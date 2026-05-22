// ABOUTME: Side-effect import — registers the shield-xchain handler with the tx executor.
// ABOUTME: App.tsx imports this once; the registerHandler call writes into the module-scope handlers map.

import { registerHandler } from '@/lib/tx/executor'
import { shieldXchainHandler } from './handler'

registerHandler(shieldXchainHandler)

export { shieldXchainHandler }
