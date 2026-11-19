import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Trial Balance is served as a sub-app of officeerp.analytx4t.com at /ai-products/financial-reporting/.
// `base` drives asset URLs, the router basename (App.jsx) and API paths (src/lib/apiPath.js).
const BASE = '/ai-products/financial-reporting/'

export default defineConfig({
  base: BASE,
  plugins: [react(), tailwindcss()],
  server: {
    port: 5174,
    fs: { allow: ['..', '../_shared'] }, // shared theme + logo live in apps/_shared
    // Mirrors the nginx rule: /ai-products/financial-reporting/api/* -> backend :8000/api/*
    proxy: {
      [`${BASE}api`]: {
        target: 'http://localhost:8100',
        changeOrigin: true,
        rewrite: (p) => p.replace(BASE.slice(0, -1), ''),
      },
    },
  },
})
