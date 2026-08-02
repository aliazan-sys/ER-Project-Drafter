// ---------------------------------------------------------------------------
// Persistence layer — used by BOTH the local Express server (server.js) and the
// Vercel serverless functions (api/*.js).
//
// Storage is Supabase Postgres, reached through a single DATABASE_URL (use the
// Supabase "Transaction pooler" connection string — it is the serverless-safe
// one). Locally the URL comes from .env; on Vercel from the project's
// Environment Variables.
//
// Everything here is best-effort: if DATABASE_URL is not set the functions
// become no-ops so the rest of the app keeps working without a database.
// ---------------------------------------------------------------------------

import pg from 'pg'
import { isFunnelStage, stageRank } from './funnel.js'

const { Pool } = pg

export const isConfigured = () => Boolean(process.env.DATABASE_URL)

// A single pool is reused across warm serverless invocations. Supabase's
// transaction pooler handles the real connection multiplexing.
let _pool
function pool() {
  if (!_pool) {
    _pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      // Supabase requires SSL; its pooler presents a cert we don't pin here.
      ssl: { rejectUnauthorized: false },
      max: 3,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
    })
  }
  return _pool
}

// Create the schema once per process. The promise is cached so concurrent
// callers share a single CREATE TABLE round-trip.
let _schemaReady
function ensureSchema() {
  if (!_schemaReady) {
    _schemaReady = pool()
      .query(`
        CREATE TABLE IF NOT EXISTS conversations (
          id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          visitor_id text,
          mode       text NOT NULL DEFAULT 'chat',
          messages   jsonb NOT NULL DEFAULT '[]'::jsonb,
          created_at timestamptz NOT NULL DEFAULT now()
        );
        ALTER TABLE conversations ADD COLUMN IF NOT EXISTS visitor_id text;
        CREATE INDEX IF NOT EXISTS conversations_visitor_idx ON conversations(visitor_id);
        CREATE TABLE IF NOT EXISTS drafts (
          id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          conversation_id uuid REFERENCES conversations(id) ON DELETE CASCADE,
          title           text,
          draft           jsonb NOT NULL,
          created_at      timestamptz NOT NULL DEFAULT now()
        );
      `)
      .catch((err) => {
        // Reset so a later call can retry after a transient failure.
        _schemaReady = undefined
        throw err
      })
  }
  return _schemaReady
}

// The funnel counts LIVE traffic only. Vercel sets VERCEL_ENV to
// 'production' | 'preview' | 'development'; locally it is unset. So anything
// that is not exactly 'production' — a dev server on localhost, a preview
// deploy, a smoke test — is not a real user and must not reach the numbers.
//
// FUNNEL_TRACK_ALL=1 overrides this for testing the pipeline itself. Leave it
// unset everywhere that matters.
const isLiveEnvironment = () =>
  process.env.FUNNEL_TRACK_ALL === '1' || process.env.VERCEL_ENV === 'production'

const currentEnvironment = () =>
  process.env.VERCEL_ENV || (process.env.FUNNEL_TRACK_ALL === '1' ? 'forced' : 'development')

// Funnel schema, kept deliberately separate from ensureSchema() above:
// analytics must never be able to break drafting or history. If this fails,
// only recordStage() is affected.
//
// `funnel_summary` is a one-row view so the numbers can be read straight from
// the Supabase table editor without writing SQL. It filters to production, so
// anything recorded before this column existed — all of it local testing —
// drops out of the totals via the column default rather than being deleted.
let _funnelReady
function ensureFunnelSchema() {
  if (!_funnelReady) {
    _funnelReady = pool()
      .query(`
        CREATE TABLE IF NOT EXISTS funnel_sessions (
          id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          session_id   text UNIQUE NOT NULL,
          visitor_id   text,
          mode         text,
          stage        text NOT NULL,
          stage_rank   int  NOT NULL,
          started_at   timestamptz NOT NULL DEFAULT now(),
          updated_at   timestamptz NOT NULL DEFAULT now(),
          completed_at timestamptz
        );
        -- Backfills every pre-existing row as 'development', which is what
        -- they were: local testing against this same database.
        ALTER TABLE funnel_sessions
          ADD COLUMN IF NOT EXISTS environment text NOT NULL DEFAULT 'development';
        CREATE INDEX IF NOT EXISTS funnel_sessions_stage_idx ON funnel_sessions(stage);
        CREATE INDEX IF NOT EXISTS funnel_sessions_visitor_idx ON funnel_sessions(visitor_id);
        CREATE INDEX IF NOT EXISTS funnel_sessions_env_idx ON funnel_sessions(environment);
        CREATE OR REPLACE VIEW funnel_summary AS
          SELECT
            count(*)                                        AS conversations_started,
            count(*) FILTER (WHERE stage = 'conversation')  AS left_in_conversation,
            count(*) FILTER (WHERE stage = 'review')        AS left_in_review,
            count(*) FILTER (WHERE stage = 'signup')        AS left_in_signup,
            count(*) FILTER (WHERE stage = 'completed')     AS completed,
            count(DISTINCT visitor_id)                      AS unique_visitors
          FROM funnel_sessions
          WHERE environment = 'production';
      `)
      .catch((err) => {
        _funnelReady = undefined
        throw err
      })
  }
  return _funnelReady
}

// Records how far one conversation got. Called repeatedly for the same
// session_id as the user advances; the row keeps the FURTHEST stage, so an
// out-of-order or replayed report can never walk the funnel backwards.
//
// Best-effort like everything else here: a tracking failure is logged and
// swallowed, never surfaced to the user.
export async function recordStage({ sessionId, stage, mode, visitorId }) {
  if (!isConfigured() || !sessionId || !isFunnelStage(stage)) return false
  // Localhost and preview deploys write nothing at all, so the table holds
  // only real traffic — not just the summary.
  if (!isLiveEnvironment()) return false
  try {
    await ensureFunnelSchema()
    await pool().query(
      `INSERT INTO funnel_sessions (session_id, visitor_id, mode, stage, stage_rank, completed_at, environment)
       VALUES ($1, $2, $3, $4, $5, CASE WHEN $4 = 'completed' THEN now() END, $6)
       ON CONFLICT (session_id) DO UPDATE SET
         stage = CASE WHEN EXCLUDED.stage_rank > funnel_sessions.stage_rank
                      THEN EXCLUDED.stage ELSE funnel_sessions.stage END,
         stage_rank = GREATEST(funnel_sessions.stage_rank, EXCLUDED.stage_rank),
         -- First writer wins for identity, so a later report with a missing
         -- header cannot blank out what we already know.
         visitor_id = COALESCE(funnel_sessions.visitor_id, EXCLUDED.visitor_id),
         mode = COALESCE(funnel_sessions.mode, EXCLUDED.mode),
         completed_at = COALESCE(funnel_sessions.completed_at, EXCLUDED.completed_at),
         updated_at = now()`,
      [sessionId, visitorId || null, mode || null, stage, stageRank(stage), currentEnvironment()]
    )
    return true
  } catch (err) {
    console.error('[store] recordStage failed:', err.message)
    return false
  }
}

// The one-row funnel summary, for /api/funnel. Null when unavailable.
export async function funnelSummary() {
  if (!isConfigured()) return null
  try {
    await ensureFunnelSchema()
    const { rows } = await pool().query('SELECT * FROM funnel_summary')
    return rows[0] || null
  } catch (err) {
    console.error('[store] funnelSummary failed:', err.message)
    return null
  }
}

// Normalises the guided form's { question: answer } map into the same
// [{ role, text }] message shape the chatbot produces.
export function answersToMessages(answers = {}) {
  return Object.entries(answers).flatMap(([q, a]) => [
    { role: 'bot', text: String(q) },
    { role: 'user', text: a ? String(a) : '(no answer)' },
  ])
}

// Saves a conversation and its generated draft. Returns the new conversation id,
// or null when storage isn't configured. Never throws — persistence is
// best-effort and must not break draft generation.
export async function saveSubmission({ mode = 'chat', messages = [], draft, visitorId }) {
  if (!isConfigured() || !draft) return null
  try {
    await ensureSchema()
    const client = await pool().connect()
    try {
      await client.query('BEGIN')
      const conv = await client.query(
        'INSERT INTO conversations (mode, messages, visitor_id) VALUES ($1, $2::jsonb, $3) RETURNING id',
        [mode, JSON.stringify(messages), visitorId || null]
      )
      const conversationId = conv.rows[0].id
      await client.query(
        'INSERT INTO drafts (conversation_id, title, draft) VALUES ($1, $2, $3::jsonb)',
        [conversationId, draft.title || null, JSON.stringify(draft)]
      )
      await client.query('COMMIT')
      return conversationId
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {})
      throw err
    } finally {
      client.release()
    }
  } catch (err) {
    console.error('[store] saveSubmission failed:', err.message)
    return null
  }
}

// Returns conversations for a specific visitor (or all if no visitorId), newest first.
export async function listConversations(visitorId) {
  if (!isConfigured()) return []
  await ensureSchema()
  const { rows } = await pool().query(
    `SELECT c.id,
            c.mode,
            c.created_at,
            d.title,
            jsonb_array_length(c.messages) AS message_count
     FROM conversations c
     LEFT JOIN drafts d ON d.conversation_id = c.id
     WHERE (1=1)
     ORDER BY c.created_at DESC
     LIMIT 200`
  )
  return rows
}

// Returns one conversation's full transcript plus its draft, or null.
export async function getConversation(id) {
  if (!isConfigured()) return null
  await ensureSchema()
  const { rows } = await pool().query(
    `SELECT c.id, c.mode, c.messages, c.created_at, d.title, d.draft
     FROM conversations c
     LEFT JOIN drafts d ON d.conversation_id = c.id
     WHERE c.id = $1`,
    [id]
  )
  return rows[0] || null
}
