// ABOUTME: TelemetrySink handed to the @armada/sdk read instance — forwards the SDK's operational
// ABOUTME: events (the quick-sync outcome + its fallback cause) onto the interface's typed track() as sdk.quicksync.

import type { TelemetrySink } from '@armada/sdk'
import { track } from '../telemetry'

/**
 * The sink passed to `createArmadaSdk`. Maps the SDK's `sync.quicksync` event → `track('sdk.quicksync')`
 * so an operator can confirm a configured indexer (watcher) is actually serving a root-verified batch,
 * vs lagging into an RPC tail (`served` + `tailCovered`) or being rejected (`root-mismatch-fallback`).
 * On a fallback the SDK also reports `reason` (why the batch was discarded — indexer-http-error /
 * schema-mismatch / root-mismatch / position-gap / unknown) and, for `indexer-http-error`, the HTTP
 * `status`; both are forwarded so a fallback self-diagnoses instead of leaving the one ambiguous label.
 * Emitted only when an indexer is configured — an RPC-only sync produces nothing. The SDK's other events
 * (`sync.reorg-recovery`, `storage.chain-reset`) are ignored. The SDK types every payload
 * (`TelemetryEventMap`), so checking `event` narrows `data`; SPEC §8: the payloads carry no key material,
 * addresses or plaintext.
 */
export const sdkTelemetrySink: TelemetrySink = {
  emit(event, data) {
    if (event !== 'sync.quicksync') return
    // `reason`/`status` are present only on a fallback.
    track('sdk.quicksync', {
      outcome: data.outcome,
      fromBlock: data.fromBlock,
      head: data.head,
      tailCovered: data.tailCovered,
      ...(data.reason !== undefined ? { reason: data.reason } : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
    })
  },
}
