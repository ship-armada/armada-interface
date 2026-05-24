// ABOUTME: waitForReceiptOrFail — wraps viem/wagmi's waitForTransactionReceipt with explicit timeout + cancel-signal support, throwing categorised TxErrors handlers can route into markFailed.
// ABOUTME: Replaces every bare `await waitForTransactionReceipt(...)` in tx handlers so we never hang on a wedged RPC and we can distinguish "lost track of tx" from "tx reverted" in the UI.

import { waitForTransactionReceipt } from 'wagmi/actions'
import type { TransactionReceipt } from 'viem'
import { wagmiConfig } from '@/config/wagmi'
import type { TxError } from './types'

/** Default per-call ceiling. Generous enough to cover Sepolia + occasional reorg jitter. */
const DEFAULT_TIMEOUT_MS = 5 * 60_000

export interface WaitForReceiptInput {
  hash: `0x${string}`
  /** Handler's AbortSignal — aborts the wait when the user cancels or the engine tears down. */
  signal: AbortSignal
  /** Optional chain id override; defaults to whatever wagmi's active chain is. */
  chainId?: number
  /** Hard ceiling for the wait (ms). Defaults to 5min — distinct from the lifecycle cap which is upstream. */
  timeoutMs?: number
}

/**
 * Wait for a transaction receipt, or throw a categorised TxError on cancel / timeout / revert.
 *
 * Three failure modes the caller can route via the `code` field:
 *  - `CANCELLED`    — `ctx.signal` aborted (user clicked Cancel / Stop Tracking). No txHash in
 *                     the error since the executor's outer catch already knows the record.
 *  - `POLL_TIMEOUT` — `timeoutMs` elapsed without a receipt. Includes `txHash` so the UI can
 *                     deep-link the user to the explorer. The on-chain tx MAY still succeed.
 *  - `TX_REVERTED`  — receipt arrived with `status === 'reverted'`. Includes `txHash`.
 *
 * On success returns the receipt unchanged. The caller is responsible for marking the next
 * stage via `ctx.upsert(advance(...))`.
 *
 * Why this lives in a helper instead of inline at each handler: viem's `waitForTransactionReceipt`
 * doesn't expose an AbortSignal parameter, only a `timeout`. We need both — the signal so
 * cancel/auto-lock propagates instantly, and the timeout so a wedged RPC doesn't pin a handler
 * for the full 60-min lifecycle cap. Promise.race composes them.
 */
export async function waitForReceiptOrFail({
  hash,
  signal,
  chainId,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: WaitForReceiptInput): Promise<TransactionReceipt> {
  if (signal.aborted) {
    throw asTxError({ code: 'CANCELLED', message: 'Cancelled while waiting for receipt.' })
  }

  // viem throws `WaitForTransactionReceiptTimeoutError` (name === ...) on its own timeout. We
  // pass `timeoutMs` so viem stops polling cleanly; we wrap the throw into a typed error below.
  const receiptPromise = waitForTransactionReceipt(wagmiConfig, {
    hash,
    chainId,
    timeout: timeoutMs,
  })

  // Promise.race the receipt against the signal so the wait abandons immediately on cancel —
  // viem's own polling has no AbortSignal hook, so without this the handler would keep awaiting
  // even after the user clicked Cancel.
  const cancelPromise = new Promise<never>((_, reject) => {
    const onAbort = () => {
      signal.removeEventListener('abort', onAbort)
      reject(asTxError({ code: 'CANCELLED', message: 'Cancelled while waiting for receipt.', txHash: hash }))
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })

  let receipt: TransactionReceipt
  try {
    receipt = await Promise.race([receiptPromise, cancelPromise])
  } catch (err) {
    if (isTxError(err)) throw err
    if (isViemTimeout(err)) {
      throw asTxError({
        code: 'POLL_TIMEOUT',
        message: `Receipt not found within ${Math.round(timeoutMs / 1000)}s. The transaction may still complete on chain.`,
        txHash: hash,
      })
    }
    const message = err instanceof Error ? err.message : 'RPC error waiting for receipt'
    throw asTxError({ code: 'RPC_ERROR', message, txHash: hash })
  }

  if (receipt.status === 'reverted') {
    throw asTxError({
      code: 'TX_REVERTED',
      message: 'The transaction was mined but reverted on chain.',
      txHash: hash,
    })
  }

  return receipt
}

/* ---------- typed-error plumbing ---------- */

/**
 * Brand for thrown TxErrors so handler catch blocks (and this helper itself) can distinguish
 * "I threw a categorised error" from "something raw bubbled up". Without the brand, an inner
 * helper's classified throw would get re-classified as RPC_ERROR by the outer try.
 */
const TX_ERROR_TAG = Symbol.for('armada.tx.error')

interface BrandedTxError extends Error {
  [TX_ERROR_TAG]: true
  txError: TxError
}

export function isTxError(err: unknown): err is BrandedTxError {
  return typeof err === 'object' && err !== null && (err as { [k: symbol]: unknown })[TX_ERROR_TAG] === true
}

export function asTxError(error: TxError): BrandedTxError {
  const err = new Error(error.message) as unknown as BrandedTxError
  err.name = `TxError(${error.code})`
  err[TX_ERROR_TAG] = true
  err.txError = error
  return err
}

/** Pull the typed error out of a thrown branded TxError. */
export function extractTxError(err: unknown): TxError | null {
  if (isTxError(err)) return err.txError
  return null
}

function isViemTimeout(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const name = (err as { name?: string }).name
  return name === 'WaitForTransactionReceiptTimeoutError'
}
