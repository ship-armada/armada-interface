// ABOUTME: Side-effect import — registers the consolidate (merge notes) handler with the tx executor.
// ABOUTME: App.tsx imports this once; the registerHandler call writes into the module-scope handlers map.

import { registerHandler } from '@/lib/tx/executor'
import { consolidateHandler } from './handler'

registerHandler(consolidateHandler)

export { consolidateHandler }
