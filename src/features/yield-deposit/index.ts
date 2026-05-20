// ABOUTME: Side-effect import — registers the yield-deposit handler with the tx executor.

import { registerHandler } from '@/lib/tx/executor'
import { yieldDepositHandler } from './handler'

registerHandler(yieldDepositHandler)

export { yieldDepositHandler }
