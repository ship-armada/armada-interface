// ABOUTME: Transaction lifecycle model — discriminated unions defining each TxKind's stages, artifacts, and meta.
// ABOUTME: Plan §7. All tx UX flows through these types; the same <TxLifecycleStepper> renders any kind.

export type TxKind =
  | 'shield'
  | 'unshield-local'
  | 'unshield-xchain'
  | 'transfer-shielded'
  | 'yield-deposit'
  | 'yield-withdraw'
  | 'payment-xchain'

/**
 * Execution lifecycle state — separate from the protocol stage so they don't
 * grow tangled meanings (e.g. an xchain unshield can be `waiting` for hours
 * during `iris-attestation-pending` without "submitted" losing meaning).
 *
 *  pending    — record created, executor has not started this stage yet
 *  active     — executor is currently running the stage
 *  waiting    — running but awaiting an external event (Iris attestation, mint receipt)
 *  retrying   — a retry attempt is in flight after a recoverable failure
 *  completed  — terminal success (stage === lifecycle.terminalSuccess)
 *  failed     — terminal failure (unrecoverable error)
 *  expired    — exceeded lifecycle.maxDurationMs without reaching a terminal state
 *  cancelled  — user-initiated abort
 */
export type TxExecutionState =
  | 'pending'
  | 'active'
  | 'waiting'
  | 'retrying'
  | 'completed'
  | 'failed'
  | 'expired'
  | 'cancelled'

/** A non-terminal state still has work to do (resumable / pollable). */
export const NON_TERMINAL_STATES: ReadonlyArray<TxExecutionState> = [
  'pending', 'active', 'waiting', 'retrying',
]

/* Stage unions — every TxKind declares its own sequence. Adding a stage means
 * adding to the union AND to the lifecycle definition in `lifecycles.ts`. */

export type StageShield =
  | 'build-proof'
  | 'submit-relayer'
  | 'hub-confirmed'

export type StageUnshieldLocal =
  | 'build-proof'
  | 'submit-relayer'
  | 'hub-confirmed'

export type StageUnshieldXchain =
  | 'build-proof'
  | 'submit-relayer'
  | 'hub-burn-confirmed'
  | 'iris-attestation-pending'
  | 'iris-attestation-ready'
  | 'client-mint-pending'
  | 'client-mint-confirmed'

export type StageTransferShielded =
  | 'build-proof'
  | 'submit-relayer'
  | 'hub-confirmed'

export type StageYieldDeposit =
  | 'build-proof'
  | 'submit-relayer'
  | 'hub-confirmed'

export type StageYieldWithdraw =
  | 'build-proof'
  | 'submit-relayer'
  | 'hub-confirmed'

export type StagePaymentXchain =
  | 'build-proof'
  | 'submit-relayer'
  | 'hub-burn-confirmed'
  | 'iris-attestation-pending'
  | 'iris-attestation-ready'
  | 'client-mint-pending'
  | 'client-mint-confirmed'

export type TxStage =
  | StageShield
  | StageUnshieldLocal
  | StageUnshieldXchain
  | StageTransferShielded
  | StageYieldDeposit
  | StageYieldWithdraw
  | StagePaymentXchain

/* Per-kind stage map — used to constrain `TxRecord<K>['stage']` to legal values. */
export type StageFor<K extends TxKind> =
  K extends 'shield' ? StageShield
  : K extends 'unshield-local' ? StageUnshieldLocal
  : K extends 'unshield-xchain' ? StageUnshieldXchain
  : K extends 'transfer-shielded' ? StageTransferShielded
  : K extends 'yield-deposit' ? StageYieldDeposit
  : K extends 'yield-withdraw' ? StageYieldWithdraw
  : K extends 'payment-xchain' ? StagePaymentXchain
  : never

/* Meta — input parameters captured at tx submit time. */

export interface MetaCommon {
  /** USDC raw amount (6 decimals). */
  amount: bigint
  /** Fee quote attached to this submission. */
  feeCacheId: string
}

export interface MetaShield extends MetaCommon {
  /** Source chain id where USDC currently lives. */
  fromChainId: number
}

export interface MetaUnshieldLocal extends MetaCommon {
  /** EVM recipient on the hub chain. */
  recipient: string
}

export interface MetaUnshieldXchain extends MetaCommon {
  /** Destination client chain id. */
  toChainId: number
  /** EVM recipient on the destination chain. */
  recipient: string
}

export interface MetaTransferShielded extends MetaCommon {
  /** 0zk recipient. */
  recipient: string
}

export interface MetaYieldDeposit extends MetaCommon {}
export interface MetaYieldWithdraw extends MetaCommon {
  /** Yield share amount to redeem; `amount` is the expected USDC output. */
  shares: bigint
}

export interface MetaPaymentXchain extends MetaCommon {
  toChainId: number
  recipient: string
}

export type MetaFor<K extends TxKind> =
  K extends 'shield' ? MetaShield
  : K extends 'unshield-local' ? MetaUnshieldLocal
  : K extends 'unshield-xchain' ? MetaUnshieldXchain
  : K extends 'transfer-shielded' ? MetaTransferShielded
  : K extends 'yield-deposit' ? MetaYieldDeposit
  : K extends 'yield-withdraw' ? MetaYieldWithdraw
  : K extends 'payment-xchain' ? MetaPaymentXchain
  : never

/* Artifacts — opaque outputs accumulated as stages complete. */

export interface ArtifactsCommon {
  /** Hash of the relayer-submitted transaction on the source chain. */
  sourceTxHash?: `0x${string}`
  /** Error message if the tx failed. */
  error?: string
}

export interface ArtifactsXchain extends ArtifactsCommon {
  /** Iris message hash, used to poll attestations. */
  messageHash?: `0x${string}`
  /** Attestation bytes once Iris returns 'complete'. */
  attestation?: `0x${string}`
  /** Hash of the destination-chain `receiveMessage` / `relayWithHook` tx. */
  destTxHash?: `0x${string}`
}

export type ArtifactsFor<K extends TxKind> =
  K extends 'unshield-xchain' | 'payment-xchain' ? ArtifactsXchain
  : ArtifactsCommon

/* Ownership / session context — captured at submit. Required for history
 * filtering, debugging, and the plural-wallet schema in state/wallet.ts. */

export interface TxWalletContext {
  /** Connected EVM wallet at submit time. Undefined for shielded-only ops
   *  that didn't touch an EVM signer (e.g. a pure shielded transfer). */
  evmAddress: string | undefined
  /** Always present — every tx originates from a shielded wallet. */
  railgunWalletId: string
  /** Source chain id for the operation. Hub chain for shielded-only ops. */
  sourceChainId: number
}

/* The record itself. */

export interface TxRecord<K extends TxKind = TxKind> {
  /** ulid; idempotency key (client-side dedup). */
  id: string
  kind: K
  /** Lifecycle execution state — independent of protocol position. */
  executionState: TxExecutionState
  /** Protocol position within the lifecycle. */
  stage: StageFor<K>
  /** Stages completed so far, in order. Useful for stepper rendering. */
  stagesCompleted: StageFor<K>[]
  /** Monotonic transition counter. Reducer increments; storage rejects stale writes (OCC). */
  updatedSeq: number
  createdAt: number
  updatedAt: number
  meta: MetaFor<K>
  artifacts: Partial<ArtifactsFor<K>>
  walletContext: TxWalletContext
}

/* Lifecycle metadata — drives steppers, retry buttons, expiry rules. */

export interface TxRetryPolicy {
  /** Maximum total retry attempts across the lifecycle's retryable stages. */
  maxAttempts: number
  /** Base backoff between retries (ms). Pollers add jitter on top. */
  backoffMs: number
}

export interface TxLifecycle<K extends TxKind = TxKind> {
  kind: K
  stages: ReadonlyArray<StageFor<K>>
  /** The stage that means "fully successful". */
  terminalSuccess: StageFor<K>
  /** Stages from which user can retry without restarting from scratch. */
  retryableStages: ReadonlyArray<StageFor<K>>
  /** Heuristic durations for ETA UI (milliseconds). */
  estDuration: { p50: number; p90: number }
  /** Hard cap on total lifecycle duration. After this, executionState → expired. */
  maxDurationMs: number
  /** Retry policy applied within retryableStages. */
  retry: TxRetryPolicy
}
