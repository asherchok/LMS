import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// Frontend dev server proxies the API to the Flask backend so the browser
// only ever talks to one origin (no CORS). In production Flask serves the
// built SPA, so the same relative /api paths work unchanged.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: true,
      },
    },
  },
})
