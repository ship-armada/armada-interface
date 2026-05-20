// ABOUTME: Side-effect import — registers the yield-withdraw handler with the tx executor.

import { registerHandler } from '@/lib/tx/executor'
import { yieldWithdrawHandler } from './handler'

registerHandler(yieldWithdrawHandler)

export { yieldWithdrawHandler }
