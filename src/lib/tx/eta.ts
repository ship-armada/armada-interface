// ABOUTME: Pure ETA-display logic — the progress view's per-stage timing note (chip → "Taking longer" callout) and Review's
// ABOUTME: "Est. time" label.

import type { StageEstimate, TxKind } from './types'
import { lifecycleFor } from './lifecycles'
import { PROOF_MS } from './proofProgress'

/** "~30 sec" / "~2 min" / "~1 hr" — the coarse expected-duration hint. */
export function formatDurationHint(ms: number): string {
  const s = Math.round(ms / 1000)
  if (s < 60) return `~${s} sec`
  const m = Math.round(s / 60)
  if (m < 60) return `~${m} min`
  const h = Math.round(m / 60)
  return `~${h} hr`
}

/** The active row's timing, from `buildProcessingView`: when it started, its estimate, and what's safe to say about it. */
export interface StageTiming {
  startedAt: number
  usualMs?: number
  slowMs: number
  /** The row is a cross-chain transfer in flight (broadcast) — the USDC is safe even though it's slow to arrive. */
  safeInTransit: boolean
  /** The tx has broadcast — closing the tab is safe (it resumes on the next sign-in); before that it would stop it. */
  broadcast: boolean
}

/**
 * The progress view's note for its active row: normally a quiet chip on the stepper ("Usually takes ~15 sec"); once past the slow
 * threshold, a warning callout under it — with a body that says what's safe (closing the tab only once broadcast).
 */
export type StageTimingNote = { kind: 'usual'; chip: string } | { kind: 'slow'; title: string; body: string }

/** The note for the active row at `nowMs`; null while normal on a stage with no usual time. */
export function stageTimingNote(timing: StageTiming, nowMs: number): StageTimingNote | null {
  if (nowMs - timing.startedAt > timing.slowMs) {
    const body = timing.safeInTransit
      ? 'Your USDC is safe in transit. You can close this tab \u2014 we\u2019ll keep checking.'
      : timing.broadcast
        ? 'The network may be busy. You can close this tab \u2014 we\u2019ll keep checking.'
        : 'This can take longer on some devices. Keep this tab open until it\u2019s submitted.'
    return { kind: 'slow', title: 'Taking longer than usual', body }
  }
  return timing.usualMs !== undefined ? { kind: 'usual', chip: `Usually takes ${formatDurationHint(timing.usualMs)}` } : null
}

/** Kinds that build no proof: a shield's first stage is its wallet prompts; a received payment is history only. */
const NO_PROOF_KINDS: ReadonlySet<TxKind> = new Set(['shield', 'shield-xchain', 'transfer-shielded-received'])

/** Cross-chain kinds — Circle's fast CCTP transfer carries the USDC between chains. */
const CROSS_CHAIN_KINDS: ReadonlySet<TxKind> = new Set(['shield-xchain', 'unshield-xchain'])

/**
 * Review's "Est. time": the kind's usual stage waits (`stageEstimates`) plus ~PROOF_MS per proof, to the nearest 5s —
 * "Usually takes ~15 sec"; cross-chain adds "· fast CCTP transfer". A shield's own wallet prompts aren't counted.
 */
export function estimatedTimeLabel(kind: TxKind, proofs: number): string {
  const estimates = Object.values(lifecycleFor(kind).stageEstimates ?? {}) as StageEstimate[]
  const waits = estimates.reduce((sum, estimate) => sum + (estimate.usualMs ?? 0), 0)
  const proving = NO_PROOF_KINDS.has(kind) ? 0 : PROOF_MS * Math.max(1, proofs)
  const roundedMs = Math.max(5_000, Math.round((waits + proving) / 5_000) * 5_000)
  const label = `Usually takes ${formatDurationHint(roundedMs)}`
  return CROSS_CHAIN_KINDS.has(kind) ? `${label} \u00b7 fast CCTP transfer` : label
}

