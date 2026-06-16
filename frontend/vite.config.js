import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Standard Vite + React config. Dev server runs on port 5173.
export default defineConfig({
  plugins: [react()],
  // Dedicated port for this project (Jarvis uses the default 5173).
  // strictPort: true means Vite errors loudly if 5180 is taken, instead of
  // silently moving to another port and leaving you guessing.
  server: { port: 5180, strictPort: true },
})
