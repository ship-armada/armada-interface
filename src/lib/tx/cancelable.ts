// ABOUTME: canCancelBeforeBroadcast — whether the live progress view offers "Cancel": only while a relayer spend is still
// ABOUTME: building its proof, when nothing has been sent and cancelling (cancelTx) is genuinely safe.

import type { TxKind, TxRecord } from './types'
import { isTerminalState } from './types'

/**
 * A shield's `build-proof` is its wallet prompts — a cancel can't withdraw a prompt already open in the wallet, and a
 * signature given after it could still go through. A received payment is never in flight here.
 */
const NOT_CANCELABLE_KINDS: ReadonlySet<TxKind> = new Set(['shield', 'shield-xchain', 'transfer-shielded-received'])

/**
 * Only during `build-proof`: from `submit-relayer` on, the relay request may already be on its way (the record learns
 * its hash only from the response), so a "cancel" could leave a tx that still lands.
 */
export function canCancelBeforeBroadcast(record: TxRecord): boolean {
  if (NOT_CANCELABLE_KINDS.has(record.kind) || isTerminalState(record.executionState)) return false
  if ((record.artifacts as { sourceTxHash?: string }).sourceTxHash) return false
  return record.stage === 'build-proof'
}
