// ABOUTME: Reports a settled `failed` TxRecord — always an info-level tx.failed event, plus a Sentry
// ABOUTME: error for the unexpected-failure codes so prod transaction failures stop failing dark.

import type { TxErrorCode, TxRecord } from './types'
import { track, trackError } from '../telemetry'

/**
 * Error codes that indicate an UNEXPECTED failure worth a Sentry alert. Everything else is
 * user-driven (USER_REJECTED), expected staleness (FEE_EXPIRED), transient infra (RPC_ERROR),
 * recovered (DUPLICATE_TX), user-initiated (CANCELLED / DISMISSED), or already carries its own
 * dedicated telemetry (STUCK → tx.executor.no-progress, INTERRUPTED → tx.interrupted) — those are
 * counted via the tx.failed info event only, to keep the Sentry signal high.
 *
 * Our own circuit fetch throws a plain Error on a corrupt artifact (circuitFetch.ts), which lands in
 * `OTHER` above.
 */
const SENTRY_WORTHY_CODES: ReadonlySet<TxErrorCode> = new Set(['OTHER', 'TX_REVERTED', 'POLL_TIMEOUT'])

/**
 * `@armada/sdk` error codes (`TxError.sdkCode`) worth a Sentry alert even though they classify as
 * `PRE_FLIGHT_REVERT` (nothing was sent — the right copy for the user): a proof that failed the SDK's
 * self-check or an artifact that failed integrity means a bug or a corrupt artifact, and a crashed
 * proving worker (e.g. out of memory) is a device limit we need to see.
 */
const SENTRY_WORTHY_SDK_CODES: ReadonlySet<string> = new Set(['PROOF_VERIFICATION', 'ARTIFACT_INTEGRITY', 'PROVER_WORKER'])

/**
 * Emit telemetry for a record that just settled into `failed`. Called once from the executor's
 * handler-chain loop when a handler leaves the record failed — this covers both the handler's outer
 * catch AND its inner post-broadcast failures (POLL_TIMEOUT / TX_REVERTED) that upsert-and-return
 * without re-throwing.
 *
 * Always emits an info-level tx.failed; for the unexpected-failure codes it additionally forwards to
 * Sentry via trackError (a no-op unless a DSN is configured). Payload is non-sensitive: id, kind,
 * code, the already-sanitized TxError message, and the public source-chain hash — no amounts or
 * recipients (see the telemetry EventRegistry privacy rules).
 */
export function reportTerminalFailure(record: TxRecord): void {
  const error = record.artifacts.error
  const code = error?.code
  track('tx.failed', { id: record.id, kind: record.kind, errorCode: code })
  const sdkCode = error?.sdkCode
  const sentryWorthy =
    (code !== undefined && SENTRY_WORTHY_CODES.has(code)) || (sdkCode !== undefined && SENTRY_WORTHY_SDK_CODES.has(sdkCode))
  if (code !== undefined && sentryWorthy) {
    trackError('tx.failure', new Error(error?.message ?? 'transaction failed'), {
      scope: 'tx.failure',
      kind: record.kind,
      code,
      ...(sdkCode !== undefined ? { sdkCode } : {}),
      ...(error?.txHash !== undefined ? { txHash: error.txHash } : {}),
    })
  }
}
