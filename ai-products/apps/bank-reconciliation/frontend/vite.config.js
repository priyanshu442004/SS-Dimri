import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'url'

// Served by nginx at /ai-products/bank-reconciliation/; API at /app/bank-reconciliation/api → :8002/api
const BASE = '/ai-products/bank-reconciliation/'

export default defineConfig({
  base: BASE,
  plugins: [react(), tailwindcss()],
  resolve: {
    // shared UI lives in apps/_shared; resolve its React/router/motion imports from this app
    alias: { '@shared': fileURLToPath(new URL('../../_shared/src', import.meta.url)) },
    dedupe: ['react', 'react-dom', 'react-router', 'motion', 'react-markdown', 'remark-gfm'],
  },
  server: {
    port: 5176,
    fs: { allow: ['..', '../../_shared'] },
    proxy: {
      [`${BASE}api`]: { target: 'http://localhost:8102', changeOrigin: true, rewrite: (p) => p.replace(BASE.slice(0, -1), '') },
    },
  },
})
