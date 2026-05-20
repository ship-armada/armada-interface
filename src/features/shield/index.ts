// ABOUTME: Side-effect import target — registering the shield handler with the tx executor.
// ABOUTME: App.tsx imports this once; the registerHandler call writes into the module-scope handlers map.

import { registerHandler } from '@/lib/tx/executor'
import { shieldHandler } from './handler'

registerHandler(shieldHandler)

export { shieldHandler }
