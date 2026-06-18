# EqualReach AI Prototype

A small React app with a Claude-style chat interface. The chatbot asks you
**4 short questions**, then uses **Google Gemini** to draft a complete
EqualReach *Project Request* — filling every field — and previews it in a popup
(mirrors the 7-step reference form).

## How the API key is kept safe

The Gemini API key is **never** put in the frontend. It lives in a `.env` file
that is read only by a tiny local server (`server.js`). The React app talks to
that server (`/api/draft`), and the server adds the key before calling Google.

- `GEMINI_API_KEY` has **no `VITE_` prefix**, so Vite cannot bundle it into the
  browser code.
- `.env` is in `.gitignore`, so it never gets committed.

> ⚠️ A pure browser app *cannot* hide a key — anything shipped to the browser is
> public. That's why this prototype uses a server proxy, which is the correct,
> safe pattern.

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Add your key
cp .env.example .env        # (Windows: copy .env.example .env)
#   then edit .env and paste your Gemini key
#   get one at https://aistudio.google.com/app/apikey

# 3. Run both the proxy server and the frontend
npm run dev
```

Then open the URL Vite prints (usually http://localhost:5173).

## Scripts

| Command          | What it does                                  |
| ---------------- | --------------------------------------------- |
| `npm run dev`    | Runs the Gemini proxy **and** the Vite app    |
| `npm run server` | Runs only the proxy server (port 3001)        |
| `npm run client` | Runs only the Vite frontend (port 5173)       |
| `npm run build`  | Production build of the frontend              |

## Deploying (Vercel)

GitHub Pages can't host this app — it's static-only and cannot run the proxy
that hides your API key. **Vercel** serves the built frontend *and* runs the
proxy as a serverless function (`api/draft.js`), so the key stays server-side.

1. Push this repo to GitHub (already done).
2. Go to https://vercel.com → **Add New… → Project** → import the repo.
   Vercel auto-detects Vite (build `vite build`, output `dist`).
3. In **Settings → Environment Variables**, add:
   - `GEMINI_API_KEY` = your key  *(no `VITE_` prefix → stays server-side)*
   - `GEMINI_MODEL` = `gemini-2.5-flash` *(optional)*
4. **Deploy.** The app is live at `https://<project>.vercel.app`, and
   `/api/draft` / `/api/health` run as serverless functions on the same domain.

> After this, you can disable GitHub Pages for the repo — it was never able to
> run the backend.

## Saving conversations & drafts (Supabase)

Every draft you create — on the **Guided Drafter** or the **AI Chatbot** — is
saved to a Postgres database along with its conversation transcript, and listed
on the **Saved Projects** page (`#/history`). This is **optional**: if no
database is configured the app runs fine and just skips saving.

Persistence uses one env var, `DATABASE_URL`, pointing at a Supabase Postgres.
The two tables (`conversations`, `drafts`) are **created automatically** on first
use — no manual SQL needed.

1. Create a free project at https://supabase.com.
2. In **Project → Settings → Database → Connection string**, copy the
   **Transaction pooler** string (host ends in `…pooler.supabase.com:6543`) — it
   is the serverless-safe one — and replace `[YOUR-PASSWORD]` with your DB
   password.
3. Set it as `DATABASE_URL`:
   - **Local:** add the line to `.env`.
   - **Vercel:** **Settings → Environment Variables → `DATABASE_URL`** (no
     `VITE_` prefix → stays server-side), then redeploy.
4. Create a draft. It appears under **Saved Projects**, and you can also browse
   the rows in the Supabase Table Editor.

> The `DATABASE_URL` is only ever read by the server (`server.js`) and the
> serverless functions — never bundled into the browser.

## Project structure

```
api/
  draft.js                    POST /api/draft         — generate + save a draft
  chat.js                     POST /api/chat          — one chatbot turn
  conversations.js            GET  /api/conversations — list / fetch saved history
  health.js                   GET  /api/health
shared/
  gemini.js                   Shared key + prompts + schemas (api/ and server.js)
  store.js                    Postgres persistence (Supabase) — best-effort
server.js                     LOCAL dev proxy (npm run dev) — reuses shared/
src/App.jsx                   Navbar + hash router (#/ , #/chat , #/history)
src/components/
  GuidedDrafter.jsx           Original fixed-question flow
  ChatAgent.jsx               Free-form conversational chatbot
  HistoryPage.jsx             Saved Projects list + transcript/draft viewer
  Message.jsx                 Shared chat bubble
  ProjectDraftModal.jsx       The editable 7-step draft preview wizard
src/lib/
  questions.js                The 4 intake questions (guided mode)
  api.js                      Frontend -> /api helpers
Reference Images/             The original 7-step form screenshots
```

## Changing the questions or model

- Edit `src/lib/questions.js` to change what the bot asks.
- Set `GEMINI_MODEL` in `.env` (local) or Vercel env vars (prod).
- The output JSON shape lives in `shared/gemini.js` (`responseSchema`).
