/// <reference types="vitest/config" />
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const here = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(here, './src'),
    },
  },
  server: {
    // Shifted off Vite default 5173 to reduce collision with other local tools.
    // strictPort: fail instead of auto-incrementing so the proxy/backend pair stays aligned.
    port: 5787,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
  },
})
