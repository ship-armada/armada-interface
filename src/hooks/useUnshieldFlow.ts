// ABOUTME: useUnshieldFlow — the unshield (private → your own EVM wallet) flow controller.
// ABOUTME: Recipient is pinned to the connected wallet; a to-chain picker drives unshield-local (hub) vs unshield-xchain (client). No ethers/execution here — that lives in features/unshield*.

import { useEffect, useRef, useState } from 'react'
import { useAtomValue } from 'jotai'
import { useAccount } from 'wagmi'
import { evmAddressAtom, shieldedUsdcAtom, shieldedUsdcSpendableAtom, shieldedWalletAtom } from '@/state/wallet'
import { useTx } from '@/hooks/useTx'
import { useFees } from '@/hooks/useFees'
import { useDisplayFees } from '@/hooks/useDisplayFees'
import { useSpendableSyncGate } from '@/hooks/useSpendableSyncGate'
import { useRelayerSubmitBlock } from '@/hooks/useRelayerSubmitBlock'
import { cctpFastFeeForAmount, computeFeeBreakdown, userFeeForKind } from '@/lib/relayer'
import { getChainById, getNetworkConfig } from '@/config/network'
import { findDeploymentForChain, loadDeployments, type ResolvedDeployments } from '@/config/deployments'
import { parseUsdcInput } from '@/lib/format'
import { isShieldedAddress } from '@/lib/address'
import { canRetryTx } from '@/lib/tx/executor'
import { resolveFreshQuote } from '@/lib/tx/submitQuote'
import { trackError } from '@/lib/telemetry'
import { assertSpendableForFeeOnTop } from '@/lib/tx/spendable'
import type { FlowStep, FlowVisibleStep } from '@/components/flow'
import type { DisplayFees } from '@/lib/fees/displayFees'
import type { FlowFeeBreakdown } from '@/components/ui/FeeBreakdownTooltip'
import type { TxRecord } from '@/lib/tx/types'
import { useSpendCheck } from './useSpendCheck'
import { useMergeNotes } from './useMergeNotes'
import type { BlockedSpend } from '@/lib/shielded/merge-intent'

type SubmittedKind = 'unshield-local' | 'unshield-xchain'

/** Unshield to your own wallet: local when the destination is the hub, cross-chain otherwise. */
function computeKind(toChainId: number, hubChainId: number): SubmittedKind {
  return toChainId === hubChainId ? 'unshield-local' : 'unshield-xchain'
}

export interface UnshieldFlow {
  // Form
  toChainId: number
  setToChainId: (chainId: number) => void
  amountStr: string
  setAmountStr: (next: string) => void
  amount: bigint
  max: bigint
  pendingUsdc: bigint
  // Fee / display
  displayFees: DisplayFees
  feeLoading: boolean
  flowBreakdown: FlowFeeBreakdown
  /** Inclusive fee (broadcaster + on-chain protocol + CCTP) shown on the review/complete cards. */
  feeInclusive: bigint
  /** The unshield's planned fee is known — until then (and when it can't be planned) the fee reads "—". */
  feeKnown: boolean
  /** The unshield is being planned: the amount card says "Estimating fees…" instead of a figure. */
  feeResolving: boolean
  /** The unshield can't be planned at this amount: the amount card shows the fee as "—". */
  feeUnavailable: boolean
  /** True when a submit-time fee refetch changed the fee — the review step shows the FeeUpdatedBanner. */
  feeChanged: boolean
  totalDeducted: bigint
  inputMax: bigint
  isXchain: boolean
  // Review / summary
  recipient: string
  shieldedAddress?: string
  recipientWalletProvider?: string
  networkName?: string
  destDeploymentError?: string
  submitBlockedReason?: string
  /** Set when the wallet is too fragmented for this unshield — the review offers "Merge notes". */
  onMergeNotes?: () => void
  // Flow state
  step: FlowStep
  isSubmitting: boolean
  record: TxRecord | null
  submitError: string | null
  // Actions
  onContinueToReview: () => void
  onBackToInput: () => void
  submit: () => Promise<void>
  errorPrimaryLabel: string
  onErrorPrimary: () => void
}

export function useUnshieldFlow(isOpen: boolean): UnshieldFlow {
  const shieldedWallet = useAtomValue(shieldedWalletAtom)

  // Destination = the connected EVM wallet (pinned; this is "unshield to my own wallet").
  const connectedEvm = useAtomValue(evmAddressAtom)
  const { connector } = useAccount()
  const recipient = connectedEvm ?? ''

  // Form state.
  const hubChainId = getNetworkConfig().hub.chainId
  const [toChainId, setToChainId] = useState<number>(hubChainId)
  const [amountStr, setAmountStr] = useState<string>('')

  // Flow state.
  const [step, setStep] = useState<FlowStep>('input')
  const [errorAtStep, setErrorAtStep] = useState<FlowVisibleStep | undefined>(undefined)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submittedKind, setSubmittedKind] = useState<SubmittedKind | null>(null)
  // Set when a submit-time fee refetch changed the fee — keeps the flow on Review with the banner.
  const [feeChanged, setFeeChanged] = useState(false)
  const submittingRef = useRef(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Source: `max` (+ the fee-on-top guard) draws from SPENDABLE only, so a not-yet-final ("pending")
  // note can't be selected; `pendingUsdc` is display-only (0 on local Anvil).
  const shieldedUsdc = useAtomValue(shieldedUsdcAtom)
  const shieldedUsdcSpendable = useAtomValue(shieldedUsdcSpendableAtom)
  const max = shieldedUsdcSpendable ?? 0n
  const pendingUsdc = (shieldedUsdc ?? 0n) - max
  const { value: amount } = parseUsdcInput(amountStr)
  // The reviewed fee is recomputed on every amount change, so clear any prior fee-changed flag.
  useEffect(() => { setFeeChanged(false) }, [amountStr])
  const { quote, refresh } = useFees()
  // Gate Confirm while the initial shielded-balance sync is incomplete — every unshield spends
  // the user's shielded USDC.
  const syncGate = useSpendableSyncGate()
  // Unshield is relayer-submitted with no wallet fallback (#23) — block Confirm when unavailable.
  const relayerBlock = useRelayerSubmitBlock(isOpen)

  // Deployment manifests — validate that the chosen destination chain actually has a deployment
  // present, otherwise the user could pick a chain the submit step would throw on.
  const [deployments, setDeployments] = useState<ResolvedDeployments | null>(null)
  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    void loadDeployments()
      .then((d) => {
        if (!cancelled) setDeployments(d)
      })
      .catch((err) => {
        // Leave `deployments` null — `destHasDeployment` stays `true` until the manifest is known,
        // so the user can still proceed; the submit step's own error path surfaces a persistent
        // failure. Telemetry is the only signal we have here.
        trackError('useUnshieldFlow.loadDeployments', err, {
          scope: 'unshield.deployments',
          message: 'failed to load deployment manifests for destination-chain check',
        })
      })
    return () => {
      cancelled = true
    }
  }, [isOpen])

  const computedKind: SubmittedKind = computeKind(toChainId, hubChainId)
  const isXchain = computedKind === 'unshield-xchain'

  const destHasDeployment = !deployments
    ? true
    : findDeploymentForChain(deployments, toChainId) !== undefined
  const destDeploymentError = destHasDeployment
    ? undefined
    : 'This destination chain has no deployment manifest. Pick another chain.'

  const txUnshieldLocal = useTx({ kind: 'unshield-local' })
  const txUnshieldXchain = useTx({ kind: 'unshield-xchain' })
  const activeTx =
    submittedKind === 'unshield-local'
      ? txUnshieldLocal
      : submittedKind === 'unshield-xchain'
        ? txUnshieldXchain
        : null
  const record = activeTx?.record ?? null

  // The relayer's per-proof quote per (kind, amount): unshield-local → its `unshield` tier;
  // unshield-xchain → `crossChainUnshield` tier (+ a CCTP fast-fee ~2 bps on the destination mint).
  const quotedFee: bigint = userFeeForKind(computedKind, amount, quote)
  // Unshields never split. It's planned — on the amount and review steps, like a private send — for the
  // fee its plan charges (the SDK folds small change into the fee when that's what makes it fit) and so a
  // wallet too fragmented for it is offered "Merge notes" before anything is attempted.
  const unshieldSpend: BlockedSpend = { kind: computedKind, amount, perProofFee: quotedFee }
  const spendCheck = useSpendCheck({
    enabled: isOpen && (step === 'input' || step === 'review'),
    spend: unshieldSpend,
    token: 'usdc',
    balanceKey: `${max}`,
  })
  // The fee the unshield's plan charges. The quote only stands in for the arithmetic below until it's
  // known; the fee itself reads as pending / "—" meanwhile.
  const fee: bigint = spendCheck.fee ?? quotedFee
  const { openMerge } = useMergeNotes()
  const cctpFee: bigint = isXchain ? cctpFastFeeForAmount(amount) : 0n
  const { fees: displayFees, isLoading: feeLoading } = useDisplayFees(
    computedKind,
    amount,
    isXchain ? toChainId : hubChainId,
    quote,
  )
  const { recipientReceives, totalDeducted, inputMax } = computeFeeBreakdown(
    computedKind,
    amount,
    fee,
    max,
    { secondaryFee: cctpFee, protocolFee: displayFees.protocolFee },
  )
  const flowBreakdown: FlowFeeBreakdown = {
    broadcasterFee: fee,
    cctpFee: isXchain ? cctpFee : undefined,
    recipientReceives,
    totalDeducted,
    recipientLabel: "You'll receive",
  }
  // The "fees" line pairs with "total deducted", so it must be exactly `totalDeducted - amount` —
  // the broadcaster fee charged ON TOP of the user's debit. The protocol fee + CCTP fee are
  // recipient-side (they reduce `recipientReceives`, not the user's debit; see the
  // `fee-on-top-and-from-recipient` model), so folding them into this line double-counts them and
  // makes fees ≠ total − amount. They still surface in `flowBreakdown` (the amount-card tooltip).
  const feeInclusive = totalDeducted > amount ? totalDeducted - amount : 0n

  // Reset local state on close so re-opening starts fresh.
  useEffect(() => {
    if (!isOpen) {
      setStep('input')
      setSubmitError(null)
      setErrorAtStep(undefined)
      setAmountStr('')
      setToChainId(hubChainId)
      setSubmittedKind(null)
    }
  }, [isOpen])

  // Terminal-state → step transition. Dep is `record?.executionState` so artifact patches during
  // xchain polling don't re-fire needlessly.
  useEffect(() => {
    if (!record) return
    if (record.executionState === 'completed') setStep('complete')
    else if (record.executionState === 'failed' || record.executionState === 'expired') {
      setStep('error')
      setErrorAtStep('progress')
    }
  }, [record?.executionState])

  async function submit() {
    if (submittingRef.current) return
    submittingRef.current = true
    setIsSubmitting(true)
    setSubmitError(null)
    try {
      let submittedId: string | null = null
      // Always refetch a fresh cacheId before proof gen (a stale cacheId is the FEE_EXPIRED cause);
      // if the fee moved since Review, bounce back with the banner rather than silently swapping it.
      const { quote: activeQuote, feeChanged: changed } = await resolveFreshQuote({
        refresh,
        reviewedFee: quotedFee,
        feeOf: (s) => userFeeForKind(computedKind, amount, s),
      })
      if (!activeQuote) {
        throw new Error('Could not fetch a current fee quote — please try again.')
      }
      if (changed) {
        setFeeChanged(true)
        setStep('review')
        return
      }
      const feeCacheId = activeQuote.cacheId
      // The unshield is re-planned at the fresh quote: the wallet's notes may plan differently than at
      // review (a sync landed), e.g. change that can no longer be folded into the fee. A different total
      // means the user hasn't approved it — re-review.
      const perProofFee = userFeeForKind(computedKind, amount, activeQuote)
      const freshFee = await spendCheck.priceAt(perProofFee)
      if (freshFee !== fee) {
        await spendCheck.invalidate()
        setFeeChanged(true)
        setStep('review')
        return
      }
      // S-M5: re-validate amount + the FRESH relayer fee against the balance before proof gen. Both
      // kinds draw the fee from the shielded balance (fee-on-top) on the relayer path.
      assertSpendableForFeeOnTop({ amount, fee: freshFee, balance: max })
      // Fail fast if the relayer published a malformed broadcaster address — avoid a 20-30s proof
      // gen doomed to surface an opaque SDK throw deep in the pipeline.
      if (!isShieldedAddress(activeQuote.broadcasterShieldedAddress)) {
        throw new Error(
          'Relayer published an invalid broadcaster address. Refresh and try again; if the ' +
            'problem persists, the relayer may be misconfigured.',
        )
      }
      if (computedKind === 'unshield-local') {
        setSubmittedKind('unshield-local')
        submittedId = await txUnshieldLocal.submit({
          amount,
          feeCacheId,
          recipient,
          broadcasterFeeAmount: freshFee,
          broadcasterFeePerProof: perProofFee,
          broadcasterShieldedAddress: activeQuote.broadcasterShieldedAddress,
          // The protocol fee shown at review, so the receipt reports the full fee.
          ...(displayFees.protocolFee > 0n ? { protocolFee: displayFees.protocolFee } : {}),
        })
      } else {
        setSubmittedKind('unshield-xchain')
        submittedId = await txUnshieldXchain.submit({
          amount,
          feeCacheId,
          toChainId,
          recipient,
          broadcasterFeeAmount: freshFee,
          broadcasterFeePerProof: perProofFee,
          broadcasterShieldedAddress: activeQuote.broadcasterShieldedAddress,
          // The protocol + CCTP fees shown at review, so the receipt reports the full fee.
          ...(displayFees.protocolFee > 0n ? { protocolFee: displayFees.protocolFee } : {}),
          ...(cctpFee > 0n ? { cctpFee } : {}),
        })
      }
      if (submittedId === null) return
      setStep('progress')
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Submit failed.')
      setStep('error')
      setErrorAtStep('review')
    } finally {
      submittingRef.current = false
      setIsSubmitting(false)
    }
  }

  const errorRetryable = errorAtStep === 'review' || (record != null && canRetryTx(record))
  const errorPrimaryLabel = errorRetryable ? 'Try again' : 'Start over'
  function onErrorPrimary() {
    if (errorAtStep === 'review') {
      setSubmitError(null)
      setErrorAtStep(undefined)
      setStep('review')
      return
    }
    if (record != null && canRetryTx(record)) {
      setErrorAtStep(undefined)
      void activeTx?.retry()?.then((accepted) => {
        if (accepted) setStep('progress')
      })
      return
    }
    setSubmitError(null)
    setErrorAtStep(undefined)
    setStep('input')
  }

  return {
    toChainId,
    setToChainId,
    amountStr,
    setAmountStr,
    amount,
    max,
    pendingUsdc,
    displayFees,
    feeLoading: feeLoading || spendCheck.pending,
    flowBreakdown,
    feeInclusive,
    feeKnown: spendCheck.fee !== null,
    feeResolving: spendCheck.pending,
    feeUnavailable: spendCheck.error !== null,
    feeChanged,
    totalDeducted,
    // Max: the SDK's unshield max (one proof, one tree), falling back to the one-fee cap until it's known.
    inputMax: spendCheck.maxInput ?? inputMax,
    isXchain,
    recipient,
    shieldedAddress: shieldedWallet.shieldedAddress,
    recipientWalletProvider: connector?.name,
    networkName: getChainById(toChainId)?.name,
    destDeploymentError,
    submitBlockedReason: syncGate.reason ?? relayerBlock ?? spendCheck.blockReason ?? undefined,
    ...(spendCheck.remedy === 'merge-notes'
      ? { onMergeNotes: () => openMerge({ token: 'usdc', blocked: unshieldSpend }) }
      : {}),
    step,
    isSubmitting,
    record,
    submitError,
    onContinueToReview: () => setStep('review'),
    onBackToInput: () => setStep('input'),
    submit,
    errorPrimaryLabel,
    onErrorPrimary,
  }
}
