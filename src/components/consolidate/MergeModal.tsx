// ABOUTME: MergeModal — the "Merge notes" flow (note consolidation, armada-sdk #98): review the priced merge, confirm
// ABOUTME: (re-priced at submit), then progress → complete / error. Opened from a blocked flow's error or Settings.

import { useEffect, useRef, useState } from 'react'
import { useAtom, useAtomValue } from 'jotai'
import { mergeIntentAtom, openModalAtom } from '@/state/ui'
import { shieldedUsdcSpendableAtom, yieldSharesAtom } from '@/state/wallet'
import { useTx } from '@/hooks/useTx'
import { useFees } from '@/hooks/useFees'
import { useSpendableSyncGate } from '@/hooks/useSpendableSyncGate'
import { useRelayerSubmitBlock } from '@/hooks/useRelayerSubmitBlock'
import { useConsolidationPlan } from '@/hooks/useConsolidationPlan'
import { isShieldedAddress } from '@/lib/address'
import { displayTxHash, txExplorerUrl } from '@/lib/explorer'
import { resolveFreshQuote } from '@/lib/tx/submitQuote'
import { blockedActionLabel, mergeTokenSymbol, type MergeIntent } from '@/lib/shielded/merge-intent'
import { ProgressStep, ErrorStep } from '@/components/flow'
import { FlowShell } from '@/components/flow/FlowShell'
import { useFlowExit } from '@/components/flow/useFlowExit'
import { RelayerStatusBanner } from '@/components/RelayerStatusBanner'
import { MergeReviewStep } from './MergeReviewStep'
import { MergeCompleteStep } from './MergeCompleteStep'

type Step = 'review' | 'progress' | 'complete' | 'error'

/** A merge opened without an intent (defensive) merges USDC, the app's main balance. */
const DEFAULT_INTENT: MergeIntent = { token: 'usdc' }

export function MergeModal() {
  const [openModal, setOpenModal] = useAtom(openModalAtom)
  const isOpen = openModal === 'merge'
  const [intentAtomValue, setIntent] = useAtom(mergeIntentAtom)
  const intent = intentAtomValue ?? DEFAULT_INTENT
  const tokenLabel = mergeTokenSymbol(intent.token)
  const blockedAction = intent.blocked ? blockedActionLabel(intent.blocked.kind) : undefined

  const [step, setStep] = useState<Step>('review')
  const [feeChanged, setFeeChanged] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  // Whether the blocked action still needs another round — captured from the preview the user confirmed.
  const [needsAnotherRound, setNeedsAnotherRound] = useState(false)
  // Double-submit guard (P0-7): ref = synchronous gate (state is async), state = button disable.
  const submittingRef = useRef(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const { quote, refresh } = useFees()
  const syncGate = useSpendableSyncGate()
  const relayerBlock = useRelayerSubmitBlock(isOpen)
  // Re-plan whenever the wallet's balances change (a sync moved its notes).
  const usdc = useAtomValue(shieldedUsdcSpendableAtom)
  const shares = useAtomValue(yieldSharesAtom)
  const plan = useConsolidationPlan({
    enabled: isOpen && step === 'review',
    intent,
    quote,
    balanceKey: `${usdc ?? ''}:${shares ?? ''}`,
  })
  const tx = useTx({ kind: 'consolidate' })
  const record = tx.record ?? null

  const reviewBlockedReason =
    syncGate.reason ?? relayerBlock ?? plan.error ?? (plan.pending ? 'Working out the merge…' : null)

  // Watch the submitted record for terminal transitions.
  useEffect(() => {
    if (!record) return
    if (record.executionState === 'completed') setStep('complete')
    else if (record.executionState === 'failed' || record.executionState === 'expired') setStep('error')
  }, [record?.executionState])

  // Reset local state on close, and drop the intent so the next open starts fresh.
  useEffect(() => {
    if (!isOpen) {
      setStep('review')
      setFeeChanged(false)
      setSubmitError(null)
      setNeedsAnotherRound(false)
    }
  }, [isOpen])

  const { exiting, requestClose } = useFlowExit(() => {
    setOpenModal(null)
    setIntent(null)
  })

  async function handleConfirm() {
    if (submittingRef.current || plan.preview === null || plan.tokenAddress === null) return
    submittingRef.current = true
    setIsSubmitting(true)
    setSubmitError(null)
    try {
      // Always refetch a fresh cacheId before proving (a stale one is the FEE_EXPIRED cause). A changed
      // per-proof fee, or a merge that now prices differently, isn't what the user approved — re-review.
      const reviewedPerProof = quote ? BigInt(quote.fees.transfer) : 0n
      const { quote: fresh, feeChanged: quoteChanged } = await resolveFreshQuote({
        refresh,
        reviewedFee: reviewedPerProof,
        feeOf: (s) => BigInt(s.fees.transfer),
      })
      if (!fresh) throw new Error('Could not fetch a current fee quote — please try again.')
      if (quoteChanged) {
        setFeeChanged(true)
        return
      }
      const repriced = await plan.priceAt(fresh)
      if (repriced.totalFee !== plan.preview.totalFee) {
        await plan.invalidate()
        setFeeChanged(true)
        return
      }
      // Fail fast on a malformed published broadcaster address rather than after proving.
      if (!isShieldedAddress(fresh.broadcasterShieldedAddress)) {
        throw new Error(
          'Relayer published an invalid broadcaster address. Refresh and try again; if the problem persists, the relayer may be misconfigured.',
        )
      }
      setNeedsAnotherRound(plan.preview.blockedWillWork === false)
      const id = await tx.submit({
        // A merge moves no value — only the fee (in USDC) leaves the wallet.
        amount: 0n,
        feeCacheId: fresh.cacheId,
        tokenAddress: plan.tokenAddress,
        tokenSymbol: tokenLabel,
        broadcasterFeeAmount: repriced.totalFee,
        broadcasterFeePerProof: BigInt(fresh.fees.transfer),
        broadcasterShieldedAddress: fresh.broadcasterShieldedAddress,
        notesMerged: repriced.notesMerged,
        notesCreated: repriced.notesCreated,
      })
      if (id === null) return
      setStep('progress')
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Merge failed.')
      setStep('error')
    } finally {
      submittingRef.current = false
      setIsSubmitting(false)
    }
  }

  function mergeAgain() {
    void plan.invalidate()
    setFeeChanged(false)
    setNeedsAnotherRound(false)
    setStep('review')
  }

  if (!isOpen) return null

  const explorerUrl = txExplorerUrl(record?.walletContext.sourceChainId, displayTxHash(record))

  return (
    <FlowShell
      open={isOpen}
      onClose={requestClose}
      exiting={exiting}
      stepKey={step}
      flowLabel="Merge notes"
      steps={['Review', 'Confirm']}
      currentStep={step === 'review' ? 1 : 2}
      status={step === 'complete' ? 'confirmed' : step === 'error' ? 'error' : 'default'}
    >
      <RelayerStatusBanner isOpen={isOpen} crossChain={false} />
      {step === 'review' && (
        <MergeReviewStep
          tokenLabel={tokenLabel}
          preview={plan.preview}
          {...(blockedAction !== undefined ? { blockedAction } : {})}
          submitBlockedReason={reviewBlockedReason}
          isSubmitting={isSubmitting}
          feeUpdated={feeChanged}
          onCancel={requestClose}
          onConfirm={() => void handleConfirm()}
        />
      )}
      {step === 'progress' && <ProgressStep record={record} />}
      {step === 'complete' && record && (
        <MergeCompleteStep
          tokenLabel={tokenLabel}
          notesMerged={record.meta.notesMerged ?? 0}
          notesCreated={record.meta.notesCreated ?? 0}
          fee={record.meta.broadcasterFeeAmount}
          confirmedAt={record.updatedAt}
          {...(blockedAction !== undefined ? { blockedAction } : {})}
          {...(needsAnotherRound ? { onMergeAgain: mergeAgain } : {})}
          {...(explorerUrl ? { explorerUrl } : {})}
          onViewExplorer={() => {
            if (explorerUrl) window.open(explorerUrl, '_blank', 'noopener,noreferrer')
          }}
          onDone={requestClose}
        />
      )}
      {step === 'error' && (
        <ErrorStep
          error={record?.artifacts.error ?? null}
          message={submitError ?? undefined}
          explorerUrl={explorerUrl}
          primaryLabel="Start over"
          onRetry={mergeAgain}
        />
      )}
    </FlowShell>
  )
}
