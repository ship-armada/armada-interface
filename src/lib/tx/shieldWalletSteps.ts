// ABOUTME: Maps shield / shield-xchain tx records to wallet-confirmation rows (Step 4 participate flow parity).

import { formatUsdcAmount } from '@/lib/format'
import type { TxRecord } from '@/lib/tx/types'

/** `loading` — its prompt is open in the wallet; `confirming` — sent, the chain is confirming it. */
export type WalletStepStatus = 'pending' | 'loading' | 'confirming' | 'done'

export interface WalletStep {
  label: string
  status: WalletStepStatus
  /** Where the active row is: "In your wallet" / "Confirming on chain". */
  detail?: string
  /** While its prompt is open: why the wallet is asking — exactly what the signature / transaction does. */
  why?: string
}

const DETAIL: Partial<Record<WalletStepStatus, string>> = {
  loading: 'In your wallet',
  confirming: 'Confirming on chain',
}

function step(label: string, status: WalletStepStatus, why?: string): WalletStep {
  const detail = DETAIL[status]
  return {
    label,
    status,
    ...(detail ? { detail } : {}),
    // Only the row whose prompt is open explains itself.
    ...(why && status === 'loading' ? { why } : {}),
  }
}

function stepStatus(done: boolean, confirming: boolean, active: boolean): WalletStepStatus {
  if (done) return 'done'
  if (confirming) return 'confirming'
  if (active) return 'loading'
  return 'pending'
}

type ShieldRecord = TxRecord<'shield'> | TxRecord<'shield-xchain'>

function shieldArtifacts(record: ShieldRecord) {
  return record.artifacts as {
    approveSkipped?: boolean
    approveTxHash?: `0x${string}`
    approveSubmittedHash?: `0x${string}`
    sourceTxHash?: `0x${string}`
    permitSigned?: boolean
  }
}

/**
 * Wallet prompts for deposit (shield) flows:
 * 1. Approve USDC — only when the allowance is below the amount; the handler approves exactly the amount
 *    (features/shield/approve.ts), so the row names it
 * 2. Submit deposit — on-chain shield / crossChainShield (direct) or relay submit (gasless)
 *
 * The build-proof stage runs silently (ephemeral shieldPrivateKey is generated locally; no
 * wallet prompt) and isn't surfaced as a row. shieldWalletInteractionsComplete() still gates
 * on `stagesCompleted.includes('build-proof')` so downstream consumers know proof inputs are
 * ready.
 */
export function shieldWalletSteps(
  record: ShieldRecord | null,
  amount: bigint,
): WalletStep[] {
  const amountLabel = formatUsdcAmount(amount)

  // Gasless path: two back-to-back signatures during build-proof — the EIP-2612 USDC permit
  // ("Authorize") + the EIP-712 ShieldIntent ("Sign"). The relayer broadcasts the submit, so there's
  // no on-chain tx prompt. The handler writes an intermediate `permitSigned` between the two prompts,
  // so the Authorize row flips to done while the Sign prompt is still live; both are done once
  // build-proof completes. Mirrors the mockup's Approve → Sign layout.
  const useGasless = record ? (record.meta as { useGasless?: boolean }).useGasless === true : false
  if (useGasless) {
    const authorized = Boolean(record?.stagesCompleted.includes('build-proof'))
    const permitDone = authorized || Boolean(record && shieldArtifacts(record).permitSigned)
    return [
      // The EIP-2612 permit: its spender is the gasless shield wrapper, for exactly the amount (fee included).
      step(
        `Authorize ${amountLabel} USDC`,
        permitDone ? 'done' : 'loading',
        `Lets Armada\u2019s shield contract take exactly ${amountLabel} USDC for this shield. No gas.`,
      ),
      // The EIP-712 shield intent binds the note array (yours + the relayer's fee note): any relayer can submit it, none
      // can redirect it.
      step(
        'Sign shield transaction',
        authorized ? 'done' : permitDone ? 'loading' : 'pending',
        'Locks in where your USDC goes, so the relayer can submit it but not change it. No gas.',
      ),
    ]
  }

  const artifacts = record ? shieldArtifacts(record) : {}
  const approveSkipped = artifacts.approveSkipped === true
  const approveDone = approveSkipped || Boolean(artifacts.approveTxHash)
  const approveSent = Boolean(artifacts.approveSubmittedHash)
  const depositBroadcast = Boolean(artifacts.sourceTxHash)
  const terminalSuccess = record?.executionState === 'completed'

  const onSubmitWallet =
    record?.stage === 'submit-relayer'
    && !terminalSuccess
    && (record.executionState === 'active' || record.executionState === 'waiting')

  const steps: WalletStep[] = []

  if (!approveSkipped) {
    // The spender is the PrivacyPool (shield) or the PrivacyPoolClient (cross-chain) — both Armada's contracts.
    steps.push(
      step(
        `Approve ${amountLabel} USDC`,
        stepStatus(approveDone, approveSent, onSubmitWallet),
        `Lets Armada\u2019s contract take exactly ${amountLabel} USDC from your wallet.`,
      ),
    )
  }

  const depositLabel =
    record?.kind === 'shield-xchain'
      ? `Submit ${amountLabel} USDC cross-chain shield`
      : `Submit ${amountLabel} USDC shield`

  const depositWhy =
    record?.kind === 'shield-xchain'
      ? `Sends ${amountLabel} USDC across chains to the privacy pool. You pay the network gas.`
      : `Sends ${amountLabel} USDC to the privacy pool. You pay the network gas.`
  steps.push(
    step(depositLabel, stepStatus(terminalSuccess, depositBroadcast, approveDone && onSubmitWallet), depositWhy),
  )

  return steps
}

/** True once the user has finished every wallet prompt (sign, optional approve, deposit submit). */
export function shieldWalletInteractionsComplete(
  record: ShieldRecord,
): boolean {
  const authorizeDone = record.stagesCompleted.includes('build-proof')
  // Gasless: the ONLY wallet prompt is the EIP-2612 permit (+ intent), captured during build-proof.
  // The relayer broadcasts the submit, so there's nothing more for the user to sign — done once
  // build-proof has the signature (waiting on `sourceTxHash` here would keep the wallet step up
  // during the relayer's own submit, where no prompt is pending).
  const useGasless = (record.meta as { useGasless?: boolean }).useGasless === true
  if (useGasless) return authorizeDone
  const artifacts = shieldArtifacts(record)
  const approveDone =
    artifacts.approveSkipped === true || Boolean(artifacts.approveTxHash)
  return authorizeDone && approveDone && Boolean(artifacts.sourceTxHash)
}
