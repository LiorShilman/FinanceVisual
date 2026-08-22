import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // production build is served by IIS under /FinanceVisual/ (see web.config) — dev server
  // stays at root so `npm run dev` URLs don't change.
  base: mode === 'production' ? '/FinanceVisual/' : '/',
}))
