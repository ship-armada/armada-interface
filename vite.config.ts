// ABOUTME: Vite config for @armada/interface — USDC shield/yield/payment wallet on the Armada protocol.
// ABOUTME: Serves deployment JSON via dev plugin (committer pattern); runs on port 5176 to avoid collisions with crowdfund apps (5173/4/5) and the showcase (5180).

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const pkg = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'),
)

/**
 * Serves deployment JSON files from the project's `deployments/` directory.
 * Path-traversal guard prevents reads outside that directory.
 *
 * Copied from `crowdfund-ui/packages/committer/vite.config.ts`. When committer
 * and this app both evolve this plugin, extract it. Until then, keep in sync.
 */
function serveDeployments() {
  return {
    name: 'serve-deployments',
    configureServer(server: any) {
      server.middlewares.use(
        '/api/deployments',
        (req: any, res: any, _next: any) => {
          const filename = req.url?.replace(/^\//, '') || ''
          const deploymentsDir = path.resolve(__dirname, '../../deployments')
          const filepath = path.resolve(deploymentsDir, filename)

          if (!filepath.startsWith(deploymentsDir + path.sep) && filepath !== deploymentsDir) {
            res.statusCode = 403
            res.end(JSON.stringify({ error: 'Forbidden' }))
            return
          }

          if (fs.existsSync(filepath)) {
            const content = fs.readFileSync(filepath, 'utf-8')
            res.setHeader('Content-Type', 'application/json')
            res.end(content)
          } else {
            res.statusCode = 404
            res.end(JSON.stringify({ error: `Deployment file not found: ${filename}` }))
          }
        },
      )
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Railgun SDK + transitive deps (level-js, circomlibjs, ethereum-cryptography, etc.) reach
    // for Node built-ins at runtime. Polyfill the minimum set that the SDK actually touches —
    // expanding this list later is cheap, but each entry adds bundle weight.
    nodePolyfills({
      include: ['buffer', 'process', 'util', 'stream', 'events', 'assert', 'crypto'],
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
    }),
    serveDeployments(),
  ],
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version),
    // level-js (used by the Railgun engine's LevelDB store) references Node's `global`.
    // Replace it with `globalThis` so the module evaluates in the browser. Mirrors the
    // legacy app's esbuild/define pattern; the heavier `vite-plugin-node-polyfills` isn't
    // required unless other Node-flavored deps surface at runtime (Buffer, process, etc.).
    global: 'globalThis',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  optimizeDeps: {
    esbuildOptions: {
      define: {
        // Same replacement applied during dep pre-bundling — level-js gets compiled here.
        global: 'globalThis',
      },
    },
  },
  server: {
    port: 5176,
    strictPort: true,
    fs: {
      allow: ['../..'],
    },
  },
})
