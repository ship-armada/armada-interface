// ABOUTME: Vitest configuration — jsdom env, RTL matchers, fake IndexedDB, shared @ path alias.
// ABOUTME: Kept separate from vite.config.ts so we don't drag the deployments dev plugin into test runs.

import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // Mirror the deep-import alias from vite.config.ts so tests that pull in
      // lib/railgun/init.ts can resolve the engine's internal constants module despite its
      // restrictive exports field. (See comment in vite.config.ts for the full reasoning.)
      '@railgun-community/engine/dist/utils/constants': path.resolve(
        __dirname,
        '../../node_modules/@railgun-community/engine/dist/utils/constants.js',
      ),
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
  },
})
