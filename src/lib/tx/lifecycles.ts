// ABOUTME: Lifecycle definitions per TxKind — stage sequence, terminal-success stage, retryable stages, ETA hints, stage wait estimates.
// ABOUTME: Single source of truth for tx flow modeling. Adding a kind means adding here, its stage union in types.ts, and (optionally) a renderer.

import type { TxKind, TxLifecycle } from './types'

/*
 * Stage wait estimates (`stageEstimates`), from Sepolia runs (Debug → Tx timings, n=3 per kind) with headroom for slower
 * devices and networks: a proof ~2s (slow after 20s, which also covers a first proof's worker start-up), a chain
 * confirmation ~9–14s (p90 up to 28s), a cross-chain unshield's submit ~10s, CCTP attestation ~19s into the hub and
 * ~31s out to a client chain. Stages that take well under a second, and a shield's wallet prompts, get none.
 */
const PROOF = { slowMs: 20_000 } as const
const CONFIRMING = { usualMs: 15_000, slowMs: 45_000 } as const

/* Standard duration caps. */
const SHORT_CAP = 10 * 60_000   // 10 min — same-chain operations
const YIELD_CAP = 15 * 60_000   // 15 min — yield ops can wait for the next block batch
const XCHAIN_CAP = 60 * 60_000  // 60 min — Iris standard finality can take ~20 min on its own

const shield: TxLifecycle<'shield'> = {
  kind: 'shield',
  // `submit-relayer` = broadcasting (wallet prompt / relay POST); `hub-pending` = broadcast, awaiting
  // on-chain confirmation. Splitting them lets the stepper show a distinct "Shielding / Confirming on
  // chain" step for the confirmation wait instead of sitting on "Submitting" the whole time.
  stages: ['build-proof', 'submit-relayer', 'hub-pending', 'hub-confirmed'],
  terminalSuccess: 'hub-confirmed',
  // `hub-pending` is retryable too: a POLL_TIMEOUT / receipt-wait failure lands there post-broadcast,
  // and re-entry is idempotent (sourceTxHash present → never re-broadcasts, just re-waits).
  retryableStages: ['submit-relayer', 'hub-pending'],
  estDuration: { p50: 8_000, p90: 25_000 },
  stageEstimates: { 'hub-pending': CONFIRMING },
  maxDurationMs: SHORT_CAP,
}

const unshieldLocal: TxLifecycle<'unshield-local'> = {
  kind: 'unshield-local',
  // `hub-pending` = broadcast, awaiting on-chain confirmation (see the shield lifecycle above).
  stages: ['build-proof', 'submit-relayer', 'hub-pending', 'hub-confirmed'],
  terminalSuccess: 'hub-confirmed',
  retryableStages: ['submit-relayer', 'hub-pending'],
  estDuration: { p50: 8_000, p90: 25_000 },
  stageEstimates: { 'build-proof': PROOF, 'hub-pending': CONFIRMING },
  maxDurationMs: SHORT_CAP,
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
  stageEstimates: {
    'build-proof': PROOF,
    // The submit includes the hub burn confirming.
    'submit-relayer': { usualMs: 10_000, slowMs: 40_000 },
    // The "Bridging" row: CCTP attestation out to the client chain.
    'iris-attestation-pending': { usualMs: 30_000, slowMs: 75_000 },
  },
  maxDurationMs: XCHAIN_CAP,
}

const shieldXchain: TxLifecycle<'shield-xchain'> = {
  kind: 'shield-xchain',
  // Same shape as unshield-xchain but flipped direction: burn on client → mint on hub.
  stages: [
    'build-proof',
    'submit-relayer',
    'client-burn-confirmed',
    'iris-attestation-pending',
    'iris-attestation-ready',
    'hub-mint-pending',
    'hub-mint-confirmed',
  ],
  terminalSuccess: 'hub-mint-confirmed',
  retryableStages: ['submit-relayer', 'iris-attestation-pending'],
  estDuration: { p50: 30_000, p90: 120_000 },
  stageEstimates: {
    // The "Bridging" row: CCTP attestation into the hub.
    'iris-attestation-pending': { usualMs: 20_000, slowMs: 60_000 },
  },
  maxDurationMs: XCHAIN_CAP,
}

const transferShielded: TxLifecycle<'transfer-shielded'> = {
  kind: 'transfer-shielded',
  // `hub-pending` = broadcast, awaiting on-chain confirmation (see the shield lifecycle above).
  stages: ['build-proof', 'submit-relayer', 'hub-pending', 'hub-confirmed'],
  terminalSuccess: 'hub-confirmed',
  retryableStages: ['submit-relayer', 'hub-pending'],
  estDuration: { p50: 8_000, p90: 25_000 },
  stageEstimates: { 'build-proof': PROOF, 'hub-pending': CONFIRMING },
  maxDurationMs: SHORT_CAP,
}

/**
 * Note consolidation (armada-sdk #98) — relayer-submitted like a private send, but up to 4 proofs
 * (proving is serial), so a little more time than a transfer before the expiry backstop trips.
 */
const consolidate: TxLifecycle<'consolidate'> = {
  kind: 'consolidate',
  stages: ['build-proof', 'submit-relayer', 'hub-pending', 'hub-confirmed'],
  terminalSuccess: 'hub-confirmed',
  retryableStages: ['submit-relayer', 'hub-pending'],
  estDuration: { p50: 30_000, p90: 120_000 },
  stageEstimates: { 'build-proof': PROOF, 'hub-pending': CONFIRMING },
  maxDurationMs: YIELD_CAP,
}

/**
 * Synthetic received-transfer lifecycle. Single terminal stage — we reconstruct the record from
 * chain only once the commitment is already on the merkle tree, so there's nothing to drive or
 * resume. `maxDurationMs: 0` + empty `retryableStages` means the executor's resume probe never
 * touches it (records are born `completed`).
 */
const transferShieldedReceived: TxLifecycle<'transfer-shielded-received'> = {
  kind: 'transfer-shielded-received',
  stages: ['observed'],
  terminalSuccess: 'observed',
  retryableStages: [],
  estDuration: { p50: 0, p90: 0 },
  maxDurationMs: 0,
}

const yieldDeposit: TxLifecycle<'yield-deposit'> = {
  kind: 'yield-deposit',
  // `hub-pending` = broadcast, awaiting on-chain confirmation (see the shield lifecycle above).
  stages: ['build-proof', 'submit-relayer', 'hub-pending', 'hub-confirmed'],
  terminalSuccess: 'hub-confirmed',
  retryableStages: ['submit-relayer', 'hub-pending'],
  estDuration: { p50: 10_000, p90: 30_000 },
  stageEstimates: { 'build-proof': PROOF, 'hub-pending': CONFIRMING },
  maxDurationMs: YIELD_CAP,
}

const yieldWithdraw: TxLifecycle<'yield-withdraw'> = {
  kind: 'yield-withdraw',
  // `hub-pending` = broadcast, awaiting on-chain confirmation (see the shield lifecycle above).
  stages: ['build-proof', 'submit-relayer', 'hub-pending', 'hub-confirmed'],
  terminalSuccess: 'hub-confirmed',
  retryableStages: ['submit-relayer', 'hub-pending'],
  estDuration: { p50: 10_000, p90: 30_000 },
  stageEstimates: { 'build-proof': PROOF, 'hub-pending': CONFIRMING },
  maxDurationMs: YIELD_CAP,
}

/** Lookup table keyed by TxKind. Use `lifecycleFor(kind)` rather than indexing directly. */
const LIFECYCLES = {
  shield,
  'shield-xchain': shieldXchain,
  'unshield-local': unshieldLocal,
  'unshield-xchain': unshieldXchain,
  'transfer-shielded': transferShielded,
  'transfer-shielded-received': transferShieldedReceived,
  'yield-deposit': yieldDeposit,
  'yield-withdraw': yieldWithdraw,
  consolidate,
} as const

export function lifecycleFor<K extends TxKind>(kind: K): TxLifecycle<K> {
  return LIFECYCLES[kind] as TxLifecycle<K>
}
