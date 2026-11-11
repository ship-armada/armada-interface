// ABOUTME: Side-effect import — registers the yield-deposit handler with the tx executor.
// ABOUTME: App.tsx imports this once; the registerHandler call writes into the module-scope handlers map.

import { registerHandler } from '@/lib/tx/executor'
import { yieldDepositHandler } from './handler'

registerHandler(yieldDepositHandler)

export { yieldDepositHandler }
