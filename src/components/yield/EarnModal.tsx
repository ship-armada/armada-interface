// ABOUTME: EarnModal — vault deposit + withdrawal. Add Funds tab uses yield-deposit; Withdraw tab uses yield-withdraw.
// ABOUTME: Matches either openModalAtom === 'yield-deposit' or === 'yield-withdraw'; the entry point picks the initial tab.

import { useEffect, useRef, useState } from 'react'
import { useAtom, useAtomValue } from 'jotai'
import { openModalAtom, type ModalKind } from '@/state/ui'
import { RelayerStatusBanner } from '@/components/RelayerStatusBanner'
import { shieldedUsdcAtom, shieldedUsdcSpendableAtom, yieldSharesAtom } from '@/state/wallet'
import { useTx } from '@/hooks/useTx'
import { useFees } from '@/hooks/useFees'
import { useSpendableSyncGate } from '@/hooks/useSpendableSyncGate'
import { useRelayerSubmitBlock } from '@/hooks/useRelayerSubmitBlock'
import { frozenApyRate, useYieldRate } from '@/hooks/useYieldRate'
import { getNetworkConfig } from '@/config/network'
import { formatUsdcAmount, parseUsdcInput } from '@/lib/format'
import { computeFeeBreakdown, userFeeForKind } from '@/lib/relayer'
import { withdrawBelowFee } from '@/lib/fees/displayFees'
import { txFiguresAs } from '@/lib/fees/txFigures'
import type { TxDraft } from '@/lib/tx/types'
import type { FlowFeeBreakdown } from '@/components/ui/FeeBreakdownTooltip'
import { isShieldedAddress } from '@/lib/address'
import { displayTxHash, txExplorerUrl } from '@/lib/explorer'
import { canRetryTx } from '@/lib/tx/executor'
import { QUOTE_PENDING_REASON, resolveFreshQuote } from '@/lib/tx/submitQuote'
import { sharesToUsdc } from '@/lib/yield'
import { assertSpendableForFeeOnTop } from '@/lib/tx/spendable'
import {
  ProgressStep,
  ErrorStep,
  type FlowStep,
  type FlowVisibleStep,
} from '@/components/flow'
import { FlowShell } from '@/components/flow/FlowShell'
import { useFlowExit } from '@/components/flow/useFlowExit'
import { useNudgeShake } from '@/hooks/useNudgeShake'
import { EarnInputStepContent, EarnInputStepFooter, type EarnTab } from './EarnInputStep'
import { useDisplayFees } from '@/hooks/useDisplayFees'
import { EarnReviewStep } from './EarnReviewStep'
import { EarnCompleteStep } from './EarnCompleteStep'
import { useMergeNotes } from '@/hooks/useMergeNotes'
import { useSpendCheck } from '@/hooks/useSpendCheck'
import type { BlockedSpend } from '@/lib/shielded/merge-intent'

type LocalStep = FlowStep

const EARN_KINDS: ReadonlyArray<ModalKind> = ['yield-deposit', 'yield-withdraw']

export function EarnModal() {
  const [openModal, setOpenModal] = useAtom(openModalAtom)
  const isOpen = EARN_KINDS.includes(openModal)
  const initialTab: EarnTab = openModal === 'yield-withdraw' ? 'withdraw' : 'add'

  // Form state
  const [tab, setTab] = useState<EarnTab>(initialTab)
  const [amountStr, setAmountStr] = useState<string>('')

  // Flow state
  const [step, setStep] = useState<LocalStep>('input')
  const [errorAtStep, setErrorAtStep] = useState<FlowVisibleStep | undefined>(undefined)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submittedKind, setSubmittedKind] = useState<'yield-deposit' | 'yield-withdraw' | null>(null)
  // Double-submit guard (P0-7): ref = synchronous gate (state is async), state = button disable.
  const submittingRef = useRef(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  // Shared across the amount step's card + footer (siblings) so tapping the disabled "Input amount"
  // CTA can focus the amount field alongside the shake.
  const amountInputRef = useRef<HTMLInputElement>(null)
  // The nudge shakes the amount CARD (mockup), so the hook lives here — the common parent of the
  // card (Content) + CTA (Footer). Tapping the incomplete CTA fires nudge() + focus.
  const { shaking, nudge, onShakeAnimationEnd } = useNudgeShake()
  const nudgeIncomplete = () => {
    nudge()
    amountInputRef.current?.focus()
  }

  // Source data. The USDC leg (deposit amount + the withdraw-fee reserve + the fee-on-top guard) draws
  // from SPENDABLE only, so a not-yet-final ("pending") note can't be used; `pendingUsdc` is
  // display-only (0 on local Anvil). Yield shares are the whole vault position (spendable + pending); the
  // withdraw Max is the SDK's spendable-only max instead (below).
  const shieldedUsdc = useAtomValue(shieldedUsdcAtom)
  const shieldedUsdcSpendable = useAtomValue(shieldedUsdcSpendableAtom)
  const yieldShares = useAtomValue(yieldSharesAtom)
  const { rate: yieldRate, refresh: refreshYieldRate } = useYieldRate()
  // Earning balance (USDC) requires both shares + rate to compute.
  const earningUsdc =
    yieldShares !== null && yieldRate !== null ? sharesToUsdc(yieldShares, yieldRate.rate) : null
  const spendableUsdc = shieldedUsdcSpendable ?? 0n
  const max = tab === 'add' ? spendableUsdc : earningUsdc ?? 0n
  // Pending only applies to the USDC deposit leg; the withdraw tab's max is share-derived (`inputMax`, below).
  const pendingUsdc = tab === 'add' ? (shieldedUsdc ?? 0n) - spendableUsdc : 0n

  const { value: amount } = parseUsdcInput(amountStr)
  // Set when a submit-time fee refetch changed the fee — keeps the flow on Review with the banner.
  const [feeChanged, setFeeChanged] = useState(false)
  useEffect(() => { setFeeChanged(false) }, [amountStr])
  const { quote, refresh } = useFees()
  // Yield ops spend the user's shielded USDC (deposit) or shielded yield shares (withdraw).
  // Either way, we need a successful first sync before letting the user submit.
  const syncGate = useSpendableSyncGate()
  // A4 — yield ops are relayer-mediated. Fee comes from the quote's crossContract tier. Both kinds
  // (deposit + withdraw) submit via the relayer's broadcaster path; there's no wallet-submit fallback
  // (that would link the user's EVM address to a shielded spend — see #23).
  const yieldKind: 'yield-deposit' | 'yield-withdraw' = tab === 'add' ? 'yield-deposit' : 'yield-withdraw'
  const quotedFee: bigint = userFeeForKind(yieldKind, amount, quote)
  // Vault actions never split. They're planned — on the amount and review steps, like a private send — so
  // a wallet too fragmented for one is offered "Merge notes" before anything is attempted. A deposit spends
  // USDC (+ its fee note, whose planned value is the fee: the SDK folds small change into it when that's
  // what makes it fit); a withdrawal spends vault shares (its fee is taken contract-side — no fee note, so
  // it keeps the quoted fee), estimated at the current rate.
  // Nothing is planned or priced until the relayer quote loads: its per-proof fee would read 0, and a figure priced at
  // 0 would show a zero fee (spec G-4).
  const quotePending = quote === null
  const vaultSpend: BlockedSpend | null =
    quotePending ? null
    : tab === 'add' ? { kind: 'yield-deposit', amount, perProofFee: quotedFee }
    : yieldRate !== null && yieldRate.rate > 0n
      ? { kind: 'yield-withdraw', amount: (amount * 1_000_000_000_000_000_000n) / yieldRate.rate, perProofFee: 0n }
      : null
  const vaultToken = tab === 'add' ? 'usdc' : 'shares'
  const spendCheck = useSpendCheck({
    enabled: isOpen && (step === 'input' || step === 'review'),
    spend: vaultSpend,
    token: vaultToken,
    balanceKey: `${spendableUsdc}:${yieldShares ?? ''}`,
  })
  // The deposit's fee is its plan's; the quote only stands in for the arithmetic below until it's known
  // (the fee itself reads as pending / "—" meanwhile). A withdrawal's fee is the quote.
  const isDeposit = tab === 'add'
  const fee: bigint = isDeposit ? (spendCheck.fee ?? quotedFee) : quotedFee
  // Both yield ops are fee-on-top in `computeFeeBreakdown`'s model, but the balance flows differ:
  //   - Add Funds: user unshields (amount + fee) USDC. `totalDeducted = amount + fee` is the
  //     literal private-balance debit. `recipientReceives = amount` is what the vault gains.
  //   - Withdraw: vault redeems `amount` USDC; the broadcaster fee is skimmed from THOSE proceeds
  //     (contract-side re-shield to the relayer, bound into adaptParams — see yield-sdk
  //     redeemAndShield). The user receives the NET `amount - fee` into their private balance and
  //     their pre-existing private USDC is UNTOUCHED; vault balance drops by `amount`-worth of shares.
  const hubChainId = getNetworkConfig().hub.chainId
  const { fees: displayFees, isLoading: feeLoading } = useDisplayFees(
    yieldKind,
    amount,
    hubChainId,
    quote,
  )
  const { recipientReceives, totalDeducted, inputMax: feeOnTopInputMax } = computeFeeBreakdown(
    yieldKind,
    amount,
    fee,
    max,
    { protocolFee: displayFees.protocolFee },
  )
  // For withdraw the fee is skimmed from the redeemed proceeds, not reserved on top, so the typeable
  // cap is the FULL vault balance — don't subtract the fee from `max`. The only lower bound is that
  // the withdrawal must exceed its own fee (else the redeem can't pay it); that's enforced via the
  // pre-flight `continueBlockedReason` below.
  // A deposit's Max is the SDK's unshield max (one proof, one tree), falling back to the one-fee cap until
  // it's known. A withdrawal's is every share one proof can redeem — spendable shares only, one tree (the SDK's
  // max, in shares) — at the current rate, falling back to the vault position until it's known (YD-16).
  const maxShares: bigint | null = isDeposit ? null : spendCheck.maxInput
  const withdrawMax: bigint | null =
    maxShares !== null && yieldRate !== null ? sharesToUsdc(maxShares, yieldRate.rate) : null
  const inputMax: bigint = tab === 'add' ? (spendCheck.maxInput ?? feeOnTopInputMax) : (withdrawMax ?? max)
  // Per-tab display values handed down to the step components. The step components stay dumb;
  // EarnModal owns the per-tab semantic translation.
  //
  // Total displayed fee (broadcaster + any protocol fee) — the figure shown on the summary's
  // "Fees" row. Hoisted so the net-received total below subtracts the SAME number.
  const displayFeeTotal: bigint = fee + displayFees.protocolFee
  // The record this vault op will submit, built once from the reviewed figures: Review renders it (through
  // txFigures, like every later surface) and submit sends it, so the stored record is what Review showed. For
  // withdraw, the vault redeems `amount` USDC and the broadcaster fee is skimmed from those proceeds
  // (contract-side), so the user receives the NET `amount - fee` into their private balance; pre-existing private
  // USDC is untouched. A withdrawal at or below its own fee is blocked at review (see below), so that net is
  // always ≥ 0. No deposit draft (and "—" for its fee and total) until its plan prices it.
  const reviewedApy = yieldRate !== null ? { apyBps: yieldRate.apyBps } : {}
  const reviewedBroadcaster = {
    feeCacheId: quote?.cacheId ?? '',
    broadcasterShieldedAddress: quote?.broadcasterShieldedAddress ?? '',
  }
  const reviewed: TxDraft<'yield-deposit' | 'yield-withdraw'> | null =
    quotePending ? null
    : isDeposit
      ? spendCheck.fee === null
        ? null
        : {
            kind: 'yield-deposit',
            meta: { amount, ...reviewedBroadcaster, broadcasterFeeAmount: spendCheck.fee, broadcasterFeePerProof: quotedFee, ...reviewedApy },
          }
      : {
          kind: 'yield-withdraw',
          // The shares to redeem are re-read at submit against the freshest rate (slippage protection).
          // The amount is the quote-time estimate until the handler reads the actual redeemed gross.
          meta: { amount, ...reviewedBroadcaster, shares: 0n, broadcasterFeeAmount: quotedFee, ...reviewedApy, amountIsEstimate: true },
        }
  const reviewFigures = reviewed ? txFiguresAs(reviewed, 'yield') : null
  // The amount card's fee breakdown. A deposit is fee-on-top: the vault receives the amount, the balance is debited
  // amount + fee. A withdrawal's fee comes out of the redeemed proceeds instead — the private balance isn't debited,
  // so there's no "Total deducted", and what arrives is the Review draft's net (spec YD-12, YD-13).
  const flowBreakdown: FlowFeeBreakdown = isDeposit
    ? { broadcasterFee: fee, recipientReceives, totalDeducted, recipientLabel: 'Vault receives' }
    : {
        broadcasterFee: fee,
        feeFromProceeds: true,
        ...(reviewFigures ? { recipientReceives: reviewFigures.netAmount } : {}),
        recipientLabel: "You'll receive into private balance",
      }
  const displayNetLabel: string =
    tab === 'add' ? 'Total deducted from balance' : "You'll receive into private balance"
  // Past-tense variant for the confirmed screen — the review says "You'll receive…", the
  // completed screen says "Received…" for the same withdraw net.
  const completeNetLabel: string =
    tab === 'add' ? 'Total deducted from balance' : 'Received into private balance'
  // Pre-flight: the withdraw fee is skimmed from the redeemed proceeds (contract-side re-shield to
  // the relayer — see yield-sdk redeemAndShield), so the user needs NO pre-existing private USDC. The
  // only uncoverable case is a withdrawal that doesn't exceed its own fee — the redeem can't pay a fee
  // larger than its proceeds (it would revert) and a net-zero withdrawal is pointless. Block that at
  // submit-time. Only enforced when we have a real fee quote — pre-quote the number is unknown.
  // `amount > 0n` so the shortfall alert only surfaces once the user has actually typed an amount —
  // an empty field (amount 0) is "nothing entered yet", not "too small" (mirrors ShieldAmountStep's
  // `tooSmall` / useShieldFlow's `duplicateWarning` gating).
  const withdrawFeeShortfall = tab === 'withdraw' && amount > 0n && withdrawBelowFee(amount, displayFeeTotal)
  const withdrawFeeBlockedReason: string | null = withdrawFeeShortfall
    ? `Withdrawal is smaller than the ${formatUsdcAmount(displayFeeTotal)} fee — withdraw more`
    : null
  // Both yield kinds are relayer-submitted with no wallet fallback (#23) — block Confirm when the
  // relayer is unavailable.
  const relayerBlock = useRelayerSubmitBlock(isOpen)
  // Composed gate for the review step — sync gate OR private-USDC shortfall OR relayer unavailable.
  const submitBlockedReason: string | null =
    syncGate.reason || withdrawFeeBlockedReason || relayerBlock || (quotePending ? QUOTE_PENDING_REASON : null)
    || spendCheck.blockReason

  // Two useTx hooks; only one gets a record per flow.
  const txDeposit = useTx({ kind: 'yield-deposit' })
  const txWithdraw = useTx({ kind: 'yield-withdraw' })
  const activeTx =
    submittedKind === 'yield-deposit' ? txDeposit
    : submittedKind === 'yield-withdraw' ? txWithdraw
    : null
  const record = activeTx?.record ?? null
  // A spend blocked by fragmentation offers "Merge notes" on its error screen (a consolidate tx).
  const { remedyFor, openMerge } = useMergeNotes()

  // Completion-screen figures, from the record — its meta is authoritative: for WITHDRAW the handler reconciles
  // meta.amount to the ACTUAL redeemed gross (shares × execution-rate), so "confirm" shows the real figure identical
  // to the activity receipt, not the submit-time estimate. Deposit amount is exact at submit (no rate drift).
  // Complete only shows post-submit, when the record exists.
  const completeReceipt = record ? txFiguresAs(record, 'yield') : null

  // Reset on close + sync initial tab when the entry-point modal kind changes.
  // Also pull a fresh rate on open so the APY hint + max-balance reflect current state — the
  // background poll only ticks every 5 min and a user opening the modal expects "now" data.
  useEffect(() => {
    if (!isOpen) {
      setStep('input')
      setSubmitError(null)
      setErrorAtStep(undefined)
      setAmountStr('')
      setSubmittedKind(null)
      return
    }
    setTab(initialTab)
    void refreshYieldRate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  // Watch the submitted record for terminal transitions. On completed, refresh the rate so the
  // post-tx balance / APY view reflects the new vault state immediately (rather than waiting up
  // to 5 min for the next poll tick). Dep is `record?.executionState` rather than `record` so
  // artifact patches during proof-progress updates don't re-fire — the body only branches on
  // executionState. The `refreshYieldRate` reference is intentionally elided from deps (same as
  // the open-side effect above) since its identity can churn without semantic change.
  useEffect(() => {
    if (!record) return
    if (record.executionState === 'completed') {
      setStep('complete')
      void refreshYieldRate()
    }
    else if (record.executionState === 'failed' || record.executionState === 'expired') {
      setStep('error')
      setErrorAtStep('progress')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record?.executionState])

  // Route the close through useFlowExit so FlowShell plays its slide-down before unmounting. The
  // atom stays set (isOpen true) until the animation completes, which keeps the step content frozen.
  const { exiting, requestClose: close } = useFlowExit(() => setOpenModal(null))

  async function handleSubmit() {
    if (submittingRef.current) return
    submittingRef.current = true
    setIsSubmitting(true)
    setSubmitError(null)
    try {
      // null ⇒ submit refused on a follower tab (useTx.submit toasts + persists nothing); stay on review.
      let submittedId: string | null = null
      // Always refetch a fresh cacheId before proof gen (a stale cacheId is the FEE_EXPIRED cause);
      // if the fee moved since Review, bounce back with the banner rather than silently swapping it.
      const { quote: activeQuote, feeChanged: changed } = await resolveFreshQuote({
        refresh,
        reviewedFee: quotedFee,
        feeOf: (s) => userFeeForKind(yieldKind, amount, s),
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
      // Same broadcaster address guard as Send / Unshield — fail fast if the relayer published
      // a malformed value rather than paying 20-30s of proof gen for a doomed submission.
      if (!isShieldedAddress(activeQuote.broadcasterShieldedAddress)) {
        throw new Error(
          'Relayer published an invalid broadcaster address. Refresh and try again; if the ' +
            'problem persists, the relayer may be misconfigured.',
        )
      }
      // A withdrawal's fee is the quote (taken contract-side from the proceeds — no fee note to plan).
      const broadcasterFeeAmount = BigInt(activeQuote.fees.crossContract)
      const broadcasterShieldedAddress = activeQuote.broadcasterShieldedAddress
      if (tab === 'add') {
        // The deposit is re-planned at the fresh quote: the wallet's notes may plan differently than at
        // review (a sync landed), e.g. change that can no longer be folded into the fee. A different
        // total means the user hasn't approved it — re-review.
        const perProofFee = userFeeForKind(yieldKind, amount, activeQuote)
        const freshFee = await spendCheck.priceAt(perProofFee)
        if (reviewed?.kind !== 'yield-deposit' || freshFee !== reviewed.meta.broadcasterFeeAmount) {
          await spendCheck.invalidate()
          setFeeChanged(true)
          setStep('review')
          return
        }
        // S-M5: a deposit unshields amount + fee from the shielded balance (fee-on-top), so
        // re-validate against the FRESH fee before proof gen. (Withdraw takes its fee from the
        // redeemed output, not the share balance — no fee-on-top check needed.)
        assertSpendableForFeeOnTop({
          amount,
          fee: freshFee,
          balance: max,
        })
        setSubmittedKind('yield-deposit')
        // The reviewed draft (incl. the reviewed net APY, frozen so the receipt can show it — persisted for rescan
        // via selfMetadata), with the fresh quote's cache id + broadcaster address.
        submittedId = await txDeposit.submit({ ...reviewed.meta, feeCacheId, broadcasterShieldedAddress })
      } else {
        setSubmittedKind('yield-withdraw')
        // Slippage protection: re-read the vault rate just before computing shares so the
        // submitted shares reflect the freshest possible exchange ratio. The residual window
        // (this submit-block → execution-block) is ~1 block — at any realistic APY that's well
        // below USDC's display precision.
        const freshRate = await refreshYieldRate()
        const effectiveRate = freshRate ?? yieldRate
        // Max redeems exactly the shares it offered: converting its amount back to shares would round down and
        // leave a dust note (more if the rate rose since review).
        const shares =
          maxShares !== null && amount === inputMax
            ? maxShares
            : effectiveRate !== null && effectiveRate.rate > 0n
              ? (amount * 1_000_000_000_000_000_000n) / effectiveRate.rate
              : 0n
        if (reviewed?.kind !== 'yield-withdraw' || broadcasterFeeAmount !== reviewed.meta.broadcasterFeeAmount) {
          setFeeChanged(true)
          setStep('review')
          return
        }
        // The reviewed draft, with the fresh quote's cache id + broadcaster address, the shares at the freshest
        // rate, and that rate's net APY — frozen so the receipt can show it (persisted for rescan via selfMetadata).
        submittedId = await txWithdraw.submit({
          ...reviewed.meta,
          feeCacheId,
          shares,
          broadcasterShieldedAddress,
          ...(effectiveRate !== null ? { apyBps: effectiveRate.apyBps } : {}),
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

  if (!isOpen) return null

  // FlowShell renders a 3-segment Steps indicator (Amount / Review / Confirm). progress / complete /
  // error all map to the final Confirm segment; the ErrorStep itself owns the retry button + copy.
  const currentStep =
    step === 'input' ? 1
    : step === 'review' ? 2
    : 3
  const status: 'default' | 'confirmed' | 'error' =
    step === 'complete' ? 'confirmed'
    : step === 'error' ? 'error'
    : 'default'

  return (
    <FlowShell
      open={isOpen}
      onClose={close}
      exiting={exiting}
      stepKey={step}
      flowLabel="Earn"
      steps={['Amount', 'Review', 'Confirm']}
      currentStep={currentStep}
      status={status}
    >
      <RelayerStatusBanner isOpen={isOpen} />
      {step === 'input' && (
        <>
          <EarnInputStepContent
            tab={tab}
            onTabChange={t => {
              setTab(t)
              setAmountStr('') // amount caps differ per tab
            }}
            amountStr={amountStr}
            onAmountChange={setAmountStr}
            max={max}
            maxInput={inputMax}
            pending={pendingUsdc}
            displayFees={displayFees}
            flowBreakdown={flowBreakdown}
            feeLoading={feeLoading || quotePending || (isDeposit && spendCheck.pending)}
            feeResolving={quotePending || (isDeposit && spendCheck.pending)}
            feeUnavailable={isDeposit && spendCheck.error !== null}
            gasChainId={hubChainId}
            // Both tabs are relayer-mediated (gasless) — no wallet-submit fallback (#23).
            gaslessMode={true}
            rate={yieldRate}
            continueBlockedReason={withdrawFeeBlockedReason}
            inputRef={amountInputRef}
            shaking={shaking}
            onShakeAnimationEnd={onShakeAnimationEnd}
          />
          <EarnInputStepFooter
            amountStr={amountStr}
            maxInput={inputMax}
            continueBlockedReason={withdrawFeeBlockedReason}
            onCancel={close}
            onContinue={() => setStep('review')}
            onIncompleteContinue={nudgeIncomplete}
          />
        </>
      )}
      {step === 'review' && (
        <EarnReviewStep
          tab={tab}
          amount={amount}
          rate={yieldRate}
          // Inclusive Fee total — broadcaster + protocol. No CCTP on yield kinds. "—" (fee and total) until
          // the deposit's plan prices it: the quote would suggest it fits, then jump.
          fee={reviewFigures?.fee ?? null}
          netAmount={reviewFigures?.netAmount ?? null}
          netLabel={displayNetLabel}
          // Withdraw redeems fixed shares at the execution-rate → the net received is an estimate.
          estimated={reviewFigures?.estimated ?? tab === 'withdraw'}
          submitBlockedReason={submitBlockedReason}
          {...(spendCheck.remedy === 'merge-notes' && vaultSpend !== null
            ? { onMergeNotes: () => openMerge({ token: vaultToken, blocked: vaultSpend }) }
            : {})}
          feeUpdated={feeChanged}
          onBack={() => setStep('input')}
          isSubmitting={isSubmitting}
          onConfirm={handleSubmit}
        />
      )}
      {step === 'progress' && <ProgressStep record={record} />}
      {step === 'complete' && completeReceipt && (
        <EarnCompleteStep
          tab={tab}
          amount={completeReceipt.headline}
          // The net APY the user reviewed, frozen on the record — not the live rate, refreshed after completion.
          rate={completeReceipt.apyBps !== null ? frozenApyRate(completeReceipt.apyBps) : null}
          fee={completeReceipt.fee}
          // Per-tab net figure derived from the (reconciled) record: Add debits `amount + fee`;
          // Withdraw nets `amount - fee` into private balance (the fee is skimmed from the redeemed
          // proceeds). `amount` is the actual redeemed gross once the handler reconciles it.
          netAmount={completeReceipt.netAmount}
          estimated={completeReceipt.estimated}
          netLabel={completeNetLabel}
          confirmedAt={record?.updatedAt ?? Date.now()}
          explorerUrl={txExplorerUrl(record?.walletContext.sourceChainId, displayTxHash(record))}
          onViewExplorer={() => {
            const url = txExplorerUrl(record?.walletContext.sourceChainId, displayTxHash(record))
            if (url) window.open(url, '_blank', 'noopener,noreferrer')
          }}
          onGoToDashboard={close}
        />
      )}
      {step === 'error' && (
        <ErrorStep
          remedy={remedyFor(record)}
          error={record?.artifacts.error ?? null}
          message={submitError ?? undefined}
          explorerUrl={txExplorerUrl(record?.walletContext.sourceChainId, displayTxHash(record))}
          primaryLabel={
            errorAtStep === 'review' || (record != null && canRetryTx(record))
              ? 'Try again'
              : 'Start over'
          }
          onRetry={
            errorAtStep === 'review'
              ? () => {
                  setSubmitError(null)
                  setErrorAtStep(undefined)
                  setStep('review')
                }
              : record != null && canRetryTx(record)
                ? () => {
                    // Only advance to the progress step if the executor ACCEPTS the retry (marks the
                    // record `retrying` + re-dispatches). A refused retry (not retryable) must leave
                    // the user on the error step with the honest error + explorer link, not flip to a
                    // stuck spinner — that was the P0-4 no-op bug.
                    setErrorAtStep(undefined)
                    void activeTx?.retry()?.then((accepted) => {
                      if (accepted) setStep('progress')
                    })
                  }
                : () => {
                    // S-M3: build-proof / FEE_EXPIRED / DUPLICATE_TX failures aren't retryable in
                    // place; return to the input step (form state preserved) so the user can start a
                    // fresh transaction instead of clicking a dead "Try again".
                    setSubmitError(null)
                    setErrorAtStep(undefined)
                    setStep('input')
                  }
          }
        />
      )}
    </FlowShell>
  )
}
