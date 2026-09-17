// ABOUTME: Vitest configuration — jsdom env, RTL matchers, fake IndexedDB, shared @ path alias.
// ABOUTME: Kept separate from vite.config.ts so we don't drag the deployments dev plugin into test runs.

import { defineConfig, configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  define: {
    'import.meta.env.VITE_NETWORK': '"local"',
    'import.meta.env.VITE_APP_VERSION': '"0.0.0-test"',
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    css: false,
    // `.context/` is a scratch area (gitignored) for reference checkouts like the armada-sdk clone.
    // Its tests have their own build/env harness and must not run in this app's suite.
    exclude: [...configDefaults.exclude, '**/.context/**'],
  },
})
