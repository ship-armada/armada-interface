// ABOUTME: EarnModal — vault deposit + withdrawal. Add Funds tab uses yield-deposit; Withdraw tab uses yield-withdraw.
// ABOUTME: Matches either openModalAtom === 'yield-deposit' or === 'yield-withdraw'; the entry point picks the initial tab.

import { useEffect, useState } from 'react'
import { useAtom, useAtomValue } from 'jotai'
import { openModalAtom, type ModalKind } from '@/state/ui'
import { shieldedUsdcAtom, yieldSharesAtom } from '@/state/wallet'
import { useTx } from '@/hooks/useTx'
import { useFees } from '@/hooks/useFees'
import { useSpendableSyncGate } from '@/hooks/useSpendableSyncGate'
import { useYieldRate } from '@/hooks/useYieldRate'
import { parseUsdcInput } from '@/lib/format'
import { userFeeForKind } from '@/lib/relayer'
import { sharesToUsdc } from '@/lib/yield'
import {
  ActionFlowShell,
  ProgressStep,
  ErrorStep,
  type FlowStep,
  type FlowVisibleStep,
} from '@/components/flow'
import { EarnInputStep, type EarnTab } from './EarnInputStep'
import { EarnReviewStep } from './EarnReviewStep'
import { EarnCompleteStep } from './EarnCompleteStep'

type LocalStep = FlowStep
const STEPS: ReadonlyArray<FlowVisibleStep> = ['input', 'review', 'progress', 'complete']

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

  // Source data
  const shieldedUsdc = useAtomValue(shieldedUsdcAtom)
  const yieldShares = useAtomValue(yieldSharesAtom)
  const yieldRate = useYieldRate()
  // Earning balance (USDC) requires both shares + rate to compute.
  const earningUsdc =
    yieldShares !== null && yieldRate !== null ? sharesToUsdc(yieldShares, yieldRate.rate) : null
  const max = tab === 'add' ? shieldedUsdc ?? 0n : earningUsdc ?? 0n

  const amount = parseUsdcInput(amountStr)
  const { quote, isStale, refresh } = useFees()
  // Yield ops spend the user's shielded USDC (deposit) or shielded yield shares (withdraw).
  // Either way, we need a successful first sync before letting the user submit.
  const syncGate = useSpendableSyncGate()
  // Display fee for yield ops is 0 today — user submits via own wallet, no relayer leg.
  const yieldKind: 'yield-deposit' | 'yield-withdraw' = tab === 'add' ? 'yield-deposit' : 'yield-withdraw'
  const fee: bigint = userFeeForKind(yieldKind, amount)
  const netAmount = amount > fee ? amount - fee : 0n

  // Two useTx hooks; only one gets a record per flow.
  const txDeposit = useTx({ kind: 'yield-deposit' })
  const txWithdraw = useTx({ kind: 'yield-withdraw' })
  const activeTx =
    submittedKind === 'yield-deposit' ? txDeposit
    : submittedKind === 'yield-withdraw' ? txWithdraw
    : null
  const record = activeTx?.record ?? null

  // Reset on close + sync initial tab when the entry-point modal kind changes.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  // Watch the submitted record for terminal transitions.
  useEffect(() => {
    if (!record) return
    if (record.executionState === 'completed') setStep('complete')
    else if (record.executionState === 'failed' || record.executionState === 'expired') {
      setStep('error')
      setErrorAtStep('progress')
    }
  }, [record])

  function close() {
    setOpenModal(null)
  }

  async function handleSubmit() {
    setSubmitError(null)
    try {
      const activeQuote = quote && !isStale ? quote : await refresh()
      if (!activeQuote) {
        throw new Error('Could not fetch a current fee quote — please try again.')
      }
      const feeCacheId = activeQuote.cacheId
      if (tab === 'add') {
        setSubmittedKind('yield-deposit')
        await txDeposit.submit({
          amount,
          feeCacheId,
        })
      } else {
        setSubmittedKind('yield-withdraw')
        // Convert the requested USDC amount back to shares for the meta. If we have no rate yet,
        // pass 0n shares — the executor will reject the submission when it lands; today this is moot
        // because the stub throws regardless.
        const shares =
          yieldRate !== null && yieldRate.rate > 0n
            ? (amount * 1_000_000_000_000_000_000n) / yieldRate.rate
            : 0n
        await txWithdraw.submit({
          amount,
          feeCacheId,
          shares,
        })
      }
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
      title="Earn"
      step={step}
      steps={STEPS}
      errorAtStep={errorAtStep}
    >
      {step === 'input' && (
        <EarnInputStep
          tab={tab}
          onTabChange={t => {
            setTab(t)
            setAmountStr('') // amount caps differ per tab
          }}
          amountStr={amountStr}
          onAmountChange={setAmountStr}
          max={max}
          rate={yieldRate}
          fee={fee}
          netAmount={netAmount}
          isFeeRefreshing={isStale}
          onCancel={close}
          onContinue={() => setStep('review')}
        />
      )}
      {step === 'review' && (
        <EarnReviewStep
          tab={tab}
          amount={amount}
          rate={yieldRate}
          fee={fee}
          netAmount={netAmount}
          submitBlockedReason={syncGate.reason}
          onBack={() => setStep('input')}
          onConfirm={handleSubmit}
        />
      )}
      {step === 'progress' && <ProgressStep record={record} />}
      {step === 'complete' && (
        <EarnCompleteStep tab={tab} netAmount={netAmount} onDone={close} />
      )}
      {step === 'error' && (
        <ErrorStep
          message={submitError ?? record?.artifacts.error ?? undefined}
          onRetry={errorAtStep === 'review' ? () => setStep('review') : () => activeTx?.retry()}
        />
      )}
    </ActionFlowShell>
  )
}
