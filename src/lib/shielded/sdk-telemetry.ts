// ABOUTME: TelemetrySink handed to the @armada/sdk read instance — forwards the SDK's operational
// ABOUTME: events (the quick-sync outcome + its fallback cause) onto the interface's typed track() as sdk.quicksync.

import type { TelemetrySink, QuickSyncReason } from '@armada/sdk'
import { track } from '../telemetry'

/**
 * The sink passed to `createArmadaSdk`. Maps the SDK's `sync.quicksync` event → `track('sdk.quicksync')`
 * so an operator can confirm a configured indexer (watcher) is actually serving a root-verified batch,
 * vs lagging into an RPC tail (`served` + `tailCovered`) or being rejected (`root-mismatch-fallback`).
 * On a fallback the SDK also reports `reason` (why the batch was discarded — indexer-http-error /
 * schema-mismatch / root-mismatch / position-gap / unknown) and, for `indexer-http-error`, the HTTP
 * `status`; both are forwarded so a fallback self-diagnoses instead of leaving the one ambiguous label.
 * Emitted only when an indexer is configured — an RPC-only sync produces nothing. Unknown SDK events
 * are ignored. SPEC §8: the SDK guarantees these payloads carry no key material / addresses / plaintext.
 */
export const sdkTelemetrySink: TelemetrySink = {
  emit(event, data) {
    if (event !== 'sync.quicksync') return
    const outcome = data.outcome
    if (outcome !== 'served' && outcome !== 'root-mismatch-fallback') return
    // `reason`/`status` are present only on a fallback; narrow off the Record<string, unknown> payload
    // and forward when they're the expected shape. The registry's union mirrors QuickSyncReason.
    const reason = data.reason
    const status = data.status
    track('sdk.quicksync', {
      outcome,
      fromBlock: Number(data.fromBlock),
      head: Number(data.head),
      tailCovered: data.tailCovered === true,
      ...(typeof reason === 'string' ? { reason: reason as QuickSyncReason } : {}),
      ...(typeof status === 'number' ? { status } : {}),
    })
  },
}
