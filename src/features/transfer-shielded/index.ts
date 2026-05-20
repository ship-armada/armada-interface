// ABOUTME: Side-effect import — registers the transfer-shielded handler with the tx executor.
// ABOUTME: App.tsx imports this once; the registerHandler call writes into the module-scope handlers map.

import { registerHandler } from '@/lib/tx/executor'
import { transferShieldedHandler } from './handler'

registerHandler(transferShieldedHandler)

export { transferShieldedHandler }
