// ABOUTME: Lifecycle definitions per TxKind — stage sequence, terminal-success stage, retryable stages, ETA hints.
// ABOUTME: Single source of truth for tx flow modeling. Adding a kind means adding here, its stage union in types.ts, and (optionally) a renderer.

import type { TxKind, TxLifecycle } from './types'

const shield: TxLifecycle<'shield'> = {
  kind: 'shield',
  stages: ['build-proof', 'submit-relayer', 'hub-confirmed'],
  terminalSuccess: 'hub-confirmed',
  retryableStages: ['submit-relayer'],
  estDuration: { p50: 8_000, p90: 25_000 },
}

const unshieldLocal: TxLifecycle<'unshield-local'> = {
  kind: 'unshield-local',
  stages: ['build-proof', 'submit-relayer', 'hub-confirmed'],
  terminalSuccess: 'hub-confirmed',
  retryableStages: ['submit-relayer'],
  estDuration: { p50: 8_000, p90: 25_000 },
}

const unshieldXchain: TxLifecycle<'unshield-xchain'> = {
  kind: 'unshield-xchain',
  stages: [
    'build-proof',
    'submit-relayer',
    'hub-burn-confirmed',
    'iris-attestation-pending',
    'iris-attestation-ready',
    'client-mint-pending',
    'client-mint-confirmed',
  ],
  terminalSuccess: 'client-mint-confirmed',
  retryableStages: ['submit-relayer', 'iris-attestation-pending'],
  estDuration: { p50: 30_000, p90: 120_000 },
}

const transferShielded: TxLifecycle<'transfer-shielded'> = {
  kind: 'transfer-shielded',
  stages: ['build-proof', 'submit-relayer', 'hub-confirmed'],
  terminalSuccess: 'hub-confirmed',
  retryableStages: ['submit-relayer'],
  estDuration: { p50: 8_000, p90: 25_000 },
}

const yieldDeposit: TxLifecycle<'yield-deposit'> = {
  kind: 'yield-deposit',
  stages: ['build-proof', 'submit-relayer', 'hub-confirmed'],
  terminalSuccess: 'hub-confirmed',
  retryableStages: ['submit-relayer'],
  estDuration: { p50: 10_000, p90: 30_000 },
}

const yieldWithdraw: TxLifecycle<'yield-withdraw'> = {
  kind: 'yield-withdraw',
  stages: ['build-proof', 'submit-relayer', 'hub-confirmed'],
  terminalSuccess: 'hub-confirmed',
  retryableStages: ['submit-relayer'],
  estDuration: { p50: 10_000, p90: 30_000 },
}

const paymentXchain: TxLifecycle<'payment-xchain'> = {
  kind: 'payment-xchain',
  stages: [
    'build-proof',
    'submit-relayer',
    'hub-burn-confirmed',
    'iris-attestation-pending',
    'iris-attestation-ready',
    'client-mint-pending',
    'client-mint-confirmed',
  ],
  terminalSuccess: 'client-mint-confirmed',
  retryableStages: ['submit-relayer', 'iris-attestation-pending'],
  estDuration: { p50: 30_000, p90: 120_000 },
}

/** Lookup table keyed by TxKind. Use `lifecycleFor(kind)` rather than indexing directly. */
const LIFECYCLES = {
  shield,
  'unshield-local': unshieldLocal,
  'unshield-xchain': unshieldXchain,
  'transfer-shielded': transferShielded,
  'yield-deposit': yieldDeposit,
  'yield-withdraw': yieldWithdraw,
  'payment-xchain': paymentXchain,
} as const

export function lifecycleFor<K extends TxKind>(kind: K): TxLifecycle<K> {
  return LIFECYCLES[kind] as TxLifecycle<K>
}
