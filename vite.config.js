import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The frontend talks to the local Express proxy (server.js) for anything
// that touches the Gemini API key. We proxy /api -> the Express port so the
// key is NEVER bundled into the browser code.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
