// ABOUTME: ShieldModal — orchestrator for the shield (deposit) action flow. Owns step + form state; renders ActionFlowShell with InputStep/ReviewStep/ProgressStep/CompleteStep/ErrorStep.
// ABOUTME: Driven by openModalAtom === 'shield'; closes via setOpenModal(null). Submits via useTx({kind:'shield'}) — executor handler lands in a later commit.

import { useEffect, useState } from 'react'
import { useAtom } from 'jotai'
import { openModalAtom } from '@/state/ui'
import { useTx } from '@/hooks/useTx'
import { useFees } from '@/hooks/useFees'
import { feeForKind } from '@/lib/relayer'
import { useBalances } from '@/hooks/useBalances'
import { getNetworkConfig } from '@/config/network'
import { parseUsdcInput } from '@/lib/format'
import {
  ActionFlowShell,
  ProgressStep,
  ErrorStep,
  type FlowStep,
  type FlowVisibleStep,
} from '@/components/flow'
import { ShieldInputStep } from './ShieldInputStep'
import { ShieldReviewStep } from './ShieldReviewStep'
import { ShieldCompleteStep } from './ShieldCompleteStep'

type LocalStep = FlowStep

const STEPS: ReadonlyArray<FlowVisibleStep> = ['input', 'review', 'progress', 'complete']

export function ShieldModal() {
  const [openModal, setOpenModal] = useAtom(openModalAtom)
  const isOpen = openModal === 'shield'

  // Form state.
  const hubChainId = getNetworkConfig().hub.chainId
  const [fromChainId, setFromChainId] = useState<number>(hubChainId)
  const [amountStr, setAmountStr] = useState<string>('')

  // Flow state.
  const [step, setStep] = useState<LocalStep>('input')
  const [errorAtStep, setErrorAtStep] = useState<FlowVisibleStep | undefined>(undefined)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const balances = useBalances()
  const max = balances.unshielded[fromChainId] ?? 0n
  const amount = parseUsdcInput(amountStr)

  const { quote, isStale } = useFees()
  // Direct hub shield is user-submitted — no relayer fee. `feeForKind('shield', ...)` returns 0n
  // by design; we still gate on `quote` so the FeeSummary shows "Loading…" until the schedule
  // arrives (UX consistency across modals; the loading state is brief in practice).
  const fee: bigint | null = quote ? feeForKind(quote, 'shield') : null
  const netAmount = amount > fee! && fee !== null ? amount - fee : amount

  const tx = useTx({ kind: 'shield' })

  // Reset local state on close so re-opening starts fresh.
  useEffect(() => {
    if (!isOpen) {
      setStep('input')
      setSubmitError(null)
      setErrorAtStep(undefined)
      setAmountStr('')
    }
  }, [isOpen])

  // Once the tx record exists and reaches a terminal state, transition step accordingly.
  useEffect(() => {
    if (!tx.record) return
    if (tx.record.executionState === 'completed') setStep('complete')
    else if (tx.record.executionState === 'failed' || tx.record.executionState === 'expired') {
      setStep('error')
      setErrorAtStep('progress')
    }
  }, [tx.record])

  function close() {
    setOpenModal(null)
  }

  async function handleSubmit() {
    setSubmitError(null)
    try {
      await tx.submit({
        amount,
        feeCacheId: quote?.cacheId ?? '',
        fromChainId,
      })
      setStep('progress')
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Submit failed.')
      setStep('error')
      setErrorAtStep('review')
    }
  }

  if (!isOpen) return null

  return (
    <ActionFlowShell
      open
      onClose={close}
      title="Deposit"
      step={step}
      steps={STEPS}
      errorAtStep={errorAtStep}
    >
      {step === 'input' && (
        <ShieldInputStep
          fromChainId={fromChainId}
          onFromChainIdChange={setFromChainId}
          amountStr={amountStr}
          onAmountChange={setAmountStr}
          max={max}
          fee={fee}
          netAmount={netAmount}
          isFeeRefreshing={isStale}
          onCancel={close}
          onContinue={() => setStep('review')}
        />
      )}
      {step === 'review' && (
        <ShieldReviewStep
          fromChainId={fromChainId}
          amount={amount}
          fee={fee}
          netAmount={netAmount}
          onBack={() => setStep('input')}
          onConfirm={handleSubmit}
        />
      )}
      {step === 'progress' && <ProgressStep record={tx.record ?? null} />}
      {step === 'complete' && <ShieldCompleteStep netAmount={netAmount} onDone={close} />}
      {step === 'error' && (
        <ErrorStep
          message={submitError ?? tx.record?.artifacts.error ?? undefined}
          onRetry={errorAtStep === 'review' ? () => setStep('review') : () => tx.retry()}
        />
      )}
    </ActionFlowShell>
  )
}
