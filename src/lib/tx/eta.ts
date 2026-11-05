// ABOUTME: Pure ETA-display logic — the lifecycle stepper's elapsed timer + "taking longer than usual" past p90 (T-L4), and
// ABOUTME: the progress view's per-stage timing note ("Usually takes ~N" → "Taking longer than usual", safe-in-transit).

import { isTerminalState } from './types'
import type { TxExecutionState } from './types'

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

/** The active row's timing, from `buildProcessingView`: when it started, its estimate, and whether USDC is between chains. */
export interface StageTiming {
  startedAt: number
  usualMs?: number
  slowMs: number
  /** The row is a cross-chain transfer in flight (broadcast) — the USDC is safe even though it's slow to arrive. */
  safeInTransit: boolean
}

export interface StageTimingNote {
  /** "Usually takes ~30 sec", or "Taking longer than usual" once slow; null when there's nothing to say yet. */
  hint: string | null
  /** Past the stage's slow threshold — styled amber (not a failure). */
  slow: boolean
  reassurance: string | null
}

/** The progress view's note for its active row at `nowMs`; null when it has neither a hint nor a reassurance. */
export function stageTimingNote(timing: StageTiming, nowMs: number): StageTimingNote | null {
  const slow = nowMs - timing.startedAt > timing.slowMs
  const hint = slow
    ? 'Taking longer than usual'
    : timing.usualMs !== undefined
      ? `Usually takes ${formatDurationHint(timing.usualMs)}`
      : null
  const reassurance = timing.safeInTransit ? 'Your USDC is safe in transit.' : null
  if (hint === null && reassurance === null) return null
  return { hint, slow, reassurance }
}

