// ABOUTME: Side-effect import — registers the unshield-local handler with the tx executor.
// ABOUTME: App.tsx imports this once; the registerHandler call writes into the module-scope handlers map.

import { registerHandler } from '@/lib/tx/executor'
import { unshieldLocalHandler } from './handler'

registerHandler(unshieldLocalHandler)

export { unshieldLocalHandler }
