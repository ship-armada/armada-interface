// ABOUTME: Structured console-only telemetry for tx flows + caught errors. Sentry/PostHog swap-in later.
// ABOUTME: Plan §16 — call sites use track/trackTxTransition/trackError; implementation can change without touching callers.

import type { TxRecord, TxStage } from './tx/types'

type Props = Record<string, unknown>

function ts(): string {
  return new Date().toISOString()
}

function emit(level: 'info' | 'warn' | 'error', event: string, props: Props): void {
  const line = { ts: ts(), event, ...props }
  if (level === 'error') console.error('[armada]', line)
  else if (level === 'warn') console.warn('[armada]', line)
  else console.info('[armada]', line)
}

/** Generic event. Use lower-case dot-separated event names (e.g. `wallet.connected`). */
export function track(event: string, props: Props = {}): void {
  emit('info', event, props)
}

/** Tx state-machine transition. Always emits a structured record. */
export function trackTxTransition(record: TxRecord, fromStage: TxStage, toStage: TxStage): void {
  emit('info', 'tx.transition', {
    id: record.id,
    kind: record.kind,
    executionState: record.executionState,
    fromStage,
    toStage,
  })
}

/** Caught error — pass a scope tag so log filtering stays useful. */
export function trackError(scope: string, err: unknown, props: Props = {}): void {
  const message = err instanceof Error ? err.message : String(err)
  emit('error', 'error', { scope, message, ...props })
}
