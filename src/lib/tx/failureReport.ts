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
 * NOTE (latent coupling): a corrupt/invalid proving artifact currently surfaces as `OTHER` on our
 * runtime path — our own circuit fetch throws a plain Error (circuitFetch.ts) and the worker prover
 * flattens an in-worker ProofVerificationError to a plain Error across the message boundary, so
 * neither reaches classifyHandlerError as an `ArmadaError`. If proving ever moves to the same-thread
 * prover, or the artifact source gets wrapped in the SDK's `VerifiedArtifactSource`, those failures
 * would start mapping to `PRE_FLIGHT_REVERT` (errors.ts) and slip out of this set — reinstate
 * origin-aware handling for the ArtifactIntegrity / ProofVerification codes then.
 */
const SENTRY_WORTHY_CODES: ReadonlySet<TxErrorCode> = new Set(['OTHER', 'TX_REVERTED', 'POLL_TIMEOUT'])

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
  if (code !== undefined && SENTRY_WORTHY_CODES.has(code)) {
    trackError('tx.failure', new Error(error?.message ?? 'transaction failed'), {
      scope: 'tx.failure',
      kind: record.kind,
      code,
      ...(error?.txHash !== undefined ? { txHash: error.txHash } : {}),
    })
  }
}
