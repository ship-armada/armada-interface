// ABOUTME: Pure per-tick scan helper used by the xchain unshield handler — caps the eth_getLogs window to maxLogRange blocks and advances a cursor between ticks.
// ABOUTME: Lifted out of handler.ts so the cursor/window math is unit-testable without dragging in wagmi, ethers, or the railgun SDK.

/** Caller-supplied range query. Lets the handler keep viem's typed event filter without leaking it into this helper's signature. */
export type GetLogsForRange = (
  fromBlock: bigint,
  toBlock: bigint,
) => Promise<ReadonlyArray<{ transactionHash?: `0x${string}` | null }>>

export interface ScanInput {
  getBlockNumber: () => Promise<bigint>
  getLogsForRange: GetLogsForRange
  /** Current low watermark — the cursor advances forward from here. */
  scanFromBlock: bigint
  /** Cap on blocks scanned per tick. From `NetworkConfig.maxLogRange`. */
  maxLogRange: bigint
}

export type ScanOutcome =
  | { kind: 'match'; txHash: `0x${string}` }
  /** No new blocks since the cursor — caller should sleep and retry. */
  | { kind: 'no-new-blocks' }
  /** Scanned a window but found nothing; cursor advanced. Caller persists `nextScanFromBlock`. */
  | { kind: 'no-match'; nextScanFromBlock: bigint; scannedTo: bigint }

/**
 * One tick of the cross-chain delivery scan.
 *
 *  - Resolves the chain's latest block.
 *  - Computes a bounded inclusive window `[scanFromBlock, min(scanFromBlock + maxLogRange - 1, latest)]`.
 *  - Issues a single getLogs call against that window via the caller-supplied query.
 *  - Returns a typed outcome: match found, no new blocks, or scanned-but-empty.
 *
 * The caller (handler) is responsible for persisting `nextScanFromBlock` on `no-match` so a crash
 * + resume doesn't re-scan history.
 */
export async function scanCctpDeliveryWindow(input: ScanInput): Promise<ScanOutcome> {
  if (input.maxLogRange < 1n) {
    throw new Error(`scanCctpDeliveryWindow: maxLogRange must be ≥ 1 (got ${input.maxLogRange})`)
  }

  const latest = await input.getBlockNumber()
  if (input.scanFromBlock > latest) {
    return { kind: 'no-new-blocks' }
  }

  const windowEnd = input.scanFromBlock + input.maxLogRange - 1n
  const toBlock = windowEnd > latest ? latest : windowEnd

  const logs = await input.getLogsForRange(input.scanFromBlock, toBlock)

  const first = logs[0]
  if (first?.transactionHash) {
    return { kind: 'match', txHash: first.transactionHash }
  }

  return { kind: 'no-match', nextScanFromBlock: toBlock + 1n, scannedTo: toBlock }
}
