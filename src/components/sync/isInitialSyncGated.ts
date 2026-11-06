// ABOUTME: isInitialSyncGated — whether the dashboard still lacks a known SDK balance (the first sync after sign-in hasn't landed
// ABOUTME: and been read), so it shows the sync card in the balance spot instead of a figure (G-11).

/**
 * True until the wallet has a known shielded balance from a completed scan: while the first scan is idle / in flight /
 * failed — and after it completes, until its balance is read — `shielded` is null and there is no real balance to show,
 * so the dashboard shows the sync card instead (the UI only ever shows the SDK balance — G-11).
 */
export function isInitialSyncGated(shielded: bigint | null): boolean {
  return shielded === null
}
