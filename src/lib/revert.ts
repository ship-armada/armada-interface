// ABOUTME: Maps EVM revert strings + wallet errors to human-readable messages.
// ABOUTME: Patterns adapted from crowdfund-committer's revertMessages.ts; crowdfund-specific entries dropped.

/** Pattern → user-facing message. Order matters: first match wins. */
const REVERT_MAP: ReadonlyArray<readonly [RegExp, string]> = [
  // Wallet-level
  [/user rejected/i, 'Transaction rejected by user'],
  [/user denied/i, 'Transaction rejected by user'],
  [/insufficient funds/i, 'Insufficient funds for gas'],
  // Token approvals + balances
  [/insufficient balance/i, 'Your balance is insufficient.'],
  [/insufficient allowance/i, 'Token allowance is insufficient — approve first.'],
  // ERC20 transfers
  [/transfer amount exceeds balance/i, 'Transfer amount exceeds balance.'],
  // Relayer / fee
  [/fee_too_low/i, 'Quoted fee is too low — re-fetch and retry.'],
  [/fee_expired/i, 'Quoted fee expired — re-fetch and retry.'],
]

/** Map an error (Error, string, anything) to a short user-facing message. */
export function mapRevertToMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  for (const [pattern, friendly] of REVERT_MAP) {
    if (pattern.test(msg)) return friendly
  }
  if (msg.length > 200) return msg.slice(0, 200) + '…'
  return msg
}
