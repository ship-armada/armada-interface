// ABOUTME: Hub-chain RPC helpers — a one-shot timeout-bounded JsonRpcProvider. Pure ethers; no
// ABOUTME: @armada/sdk or shielded-engine coupling.

import { ethers } from 'ethers'

/** One-shot RPC timeout. ethers' default FetchRequest timeout is ~300s, which defeats failover —
 *  a black-holed endpoint would hang for 5 min. Cap at 15s so callers fail (or fall back) fast. */
const ONE_SHOT_RPC_TIMEOUT_MS = 15_000

/**
 * Build a one-shot JsonRpcProvider with an explicit fetch timeout (P1-18). Plain
 * `new JsonRpcProvider(url)` inherits ethers' ~300s default, so a wedged RPC pins the caller far
 * past any reasonable budget. Constructing from a `FetchRequest` lets us bound it.
 *
 * `batchMaxCount` caps how many concurrent JSON-RPC calls ethers folds into a single batch request.
 * ethers batches by default (~100), but some free-tier RPCs reject large batches (e.g. drpc's free
 * plan rejects batches >3). Pass `1` to disable batching entirely — one HTTP request per call — for
 * callers that fan out many concurrent reads against a possibly batch-limited endpoint. Omit to keep
 * ethers' default batching.
 */
export function timeoutProvider(
  url: string,
  timeoutMs: number = ONE_SHOT_RPC_TIMEOUT_MS,
  batchMaxCount?: number,
): ethers.JsonRpcProvider {
  const req = new ethers.FetchRequest(url)
  req.timeout = timeoutMs
  return new ethers.JsonRpcProvider(
    req,
    undefined,
    batchMaxCount !== undefined ? { batchMaxCount } : undefined,
  )
}
