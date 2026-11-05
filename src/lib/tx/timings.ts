// ABOUTME: Tx timing stats for the Debug page — per-kind, per-stage p50 / p90 durations from completed records' stage-entry
// ABOUTME: stamps (plus the whole tx), and the balance-lag samples. Pure; local data only (package 7).

import { lifecycleFor } from './lifecycles'
import type { TxKind, TxRecord } from './types'

export interface TimingRow {
  kind: TxKind
  /** A lifecycle stage, `total` (first stamp → last), or `balance update` (completion → balance change). */
  stage: string
  samples: number
  p50: number
  p90: number
}

/** Nearest-rank percentile of `values` (unsorted). */
export function percentile(values: readonly number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b)
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length))
  return sorted[Math.min(rank, sorted.length) - 1] ?? 0
}

function row(kind: TxKind, stage: string, durations: readonly number[]): TimingRow {
  return { kind, stage, samples: durations.length, p50: percentile(durations, 50), p90: percentile(durations, 90) }
}

/**
 * Each stage's duration is the gap from its stamp to the next stamped stage, in lifecycle order; `total` is first stamp
 * → last. Completed records only (a failure's times would skew the estimates); records without stamps are skipped.
 * Rows are ordered by kind, then lifecycle stage, then `total`.
 */
export function stageTimings(records: readonly TxRecord[]): TimingRow[] {
  const byKind = new Map<TxKind, { stages: Map<string, number[]>; totals: number[] }>()
  for (const record of records) {
    if (record.executionState !== 'completed' || !record.stageEnteredAt) continue
    const stamps = record.stageEnteredAt as Partial<Record<string, number>>
    const stamped = (lifecycleFor(record.kind).stages as readonly string[])
      .map((stage) => ({ stage, at: stamps[stage] }))
      .filter((entry): entry is { stage: string; at: number } => entry.at !== undefined)
    const first = stamped[0]
    const last = stamped[stamped.length - 1]
    if (!first || !last || stamped.length < 2) continue
    const bucket = byKind.get(record.kind) ?? { stages: new Map<string, number[]>(), totals: [] }
    for (let i = 0; i < stamped.length - 1; i++) {
      const current = stamped[i]
      const next = stamped[i + 1]
      if (!current || !next) continue
      const list = bucket.stages.get(current.stage) ?? []
      list.push(next.at - current.at)
      bucket.stages.set(current.stage, list)
    }
    bucket.totals.push(last.at - first.at)
    byKind.set(record.kind, bucket)
  }
  const rows: TimingRow[] = []
  for (const kind of [...byKind.keys()].sort()) {
    const bucket = byKind.get(kind)
    if (!bucket) continue
    for (const stage of lifecycleFor(kind).stages as readonly string[]) {
      const durations = bucket.stages.get(stage)
      if (durations) rows.push(row(kind, stage, durations))
    }
    rows.push(row(kind, 'total', bucket.totals))
  }
  return rows
}

/** The balance-lag samples (completion → balance change), summarised per kind, ordered by kind. */
export function latencyTimings(samples: ReadonlyArray<{ kind: TxKind; durationMs: number }>): TimingRow[] {
  const byKind = new Map<TxKind, number[]>()
  for (const sample of samples) byKind.set(sample.kind, [...(byKind.get(sample.kind) ?? []), sample.durationMs])
  return [...byKind.keys()].sort().map((kind) => row(kind, 'balance update', byKind.get(kind) ?? []))
}
