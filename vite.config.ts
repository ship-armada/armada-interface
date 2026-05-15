// ABOUTME: Vite config for @armada/interface — USDC shield/yield/payment wallet on the Armada protocol.
// ABOUTME: Serves deployment JSON via dev plugin (committer pattern); runs on port 5176 to avoid collisions with crowdfund apps (5173/4/5) and the showcase (5180).

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
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
    serveDeployments(),
  ],
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
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
