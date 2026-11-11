// ABOUTME: Side-effect import — registers the yield-withdraw handler with the tx executor.
// ABOUTME: App.tsx imports this once; the registerHandler call writes into the module-scope handlers map.

import { registerHandler } from '@/lib/tx/executor'
import { yieldWithdrawHandler } from './handler'

registerHandler(yieldWithdrawHandler)

export { yieldWithdrawHandler }
