// ABOUTME: Pure ETA-display logic — the lifecycle stepper's elapsed timer + "taking longer than usual" past p90 (T-L4), and
// ABOUTME: the progress view's per-stage timing note (chip → "Taking longer" callout), and Review's "Est. time" label.

import { isTerminalState } from './types'
import type { StageEstimate, TxExecutionState, TxKind } from './types'
import { lifecycleFor } from './lifecycles'
import { PROOF_MS } from './proofProgress'

export interface StepperEta {
  /** Header label, e.g. "Usually takes ~30 sec · 12s elapsed" or "Taking longer than usual · 4m elapsed". Empty for terminal records. */
  label: string
  /** True once elapsed exceeds the kind's p90 — the UI styles it as a warning. */
  overdue: boolean
}

/** "~30 sec" / "~2 min" / "~1 hr" — the coarse expected-duration hint. */
export function formatDurationHint(ms: number): string {
  const s = Math.round(ms / 1000)
  if (s < 60) return `~${s} sec`
  const m = Math.round(s / 60)
  if (m < 60) return `~${m} min`
  const h = Math.round(m / 60)
  return `~${h} hr`
}

/** Live elapsed counter: "12s" / "4m" / "1h 5m". */
export function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

/**
 * Compute the stepper header ETA. While a tx is in flight we show how long it's actually taken and,
 * once that passes the kind's p90, swap the "usually takes" hint for an honest "taking longer than
 * usual" — instead of a frozen p50 that reads as a lie 25 minutes into a slow attestation. Terminal
 * records get no live ETA (the status chip already says what happened).
 */
export function stepperEta(
  record: { executionState: TxExecutionState; createdAt: number },
  estDuration: { p50: number; p90: number },
  nowMs: number,
): StepperEta {
  if (isTerminalState(record.executionState)) return { label: '', overdue: false }

  const elapsedMs = Math.max(0, nowMs - record.createdAt)
  const { p50, p90 } = estDuration

  if (p90 > 0 && elapsedMs > p90) {
    return { label: `Taking longer than usual · ${formatElapsed(elapsedMs)} elapsed`, overdue: true }
  }
  if (p50 > 0) {
    return { label: `Usually takes ${formatDurationHint(p50)} · ${formatElapsed(elapsedMs)} elapsed`, overdue: false }
  }
  return { label: `${formatElapsed(elapsedMs)} elapsed`, overdue: false }
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

