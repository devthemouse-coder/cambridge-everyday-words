import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Use VITE_BASE environment variable (set by Actions) when deploying to GitHub Pages.
// Defaults to '/' for local development.
const base = process.env.VITE_BASE || '/'

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [react()],
})
