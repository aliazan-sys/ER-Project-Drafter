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

## Project structure

```
server.js                     Express proxy — holds the API key, calls Gemini
src/App.jsx                   Chat flow + state
src/components/
  ProjectDraftModal.jsx       The draft preview popup (Review screen)
src/lib/
  questions.js                The 4 intake questions
  api.js                      Frontend -> /api/draft helper
Reference Images/             The original 7-step form screenshots
```

## Changing the questions or model

- Edit `src/lib/questions.js` to change what the bot asks.
- Set `GEMINI_MODEL` in `.env` (default `gemini-2.0-flash`).
- The output JSON shape lives in `server.js` (`responseSchema`).
