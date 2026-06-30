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
