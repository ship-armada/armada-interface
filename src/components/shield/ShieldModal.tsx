// ABOUTME: ShieldModal — orchestrator for the shield (deposit) action flow. Owns step + form state; renders ActionFlowShell with InputStep/ReviewStep/ProgressStep/CompleteStep/ErrorStep.
// ABOUTME: Dispatches between same-chain shield (hub source) and cross-chain shield-xchain (client source) based on fromChainId; mounts both useTx hooks so either can drive a flow.

import { useEffect, useState } from 'react'
import { useAtom } from 'jotai'
import { openModalAtom } from '@/state/ui'
import { useTx } from '@/hooks/useTx'
import { useFees } from '@/hooks/useFees'
import { userFeeForKind } from '@/lib/relayer'
import { useBalances } from '@/hooks/useBalances'
import { getNetworkConfig } from '@/config/network'
import { parseUsdcInput } from '@/lib/format'
import { displayTxHash, txExplorerUrl } from '@/lib/explorer'
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
type SubmittedKind = 'shield' | 'shield-xchain'

const STEPS: ReadonlyArray<FlowVisibleStep> = ['input', 'review', 'progress', 'complete']

function computeKind(fromChainId: number, hubChainId: number): SubmittedKind {
  return fromChainId === hubChainId ? 'shield' : 'shield-xchain'
}

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
  const [submittedKind, setSubmittedKind] = useState<SubmittedKind | null>(null)

  const balances = useBalances()
  const max = balances.unshielded[fromChainId] ?? 0n
  const { value: amount } = parseUsdcInput(amountStr)

  // useFees stays plumbed in for the relayer-submit path (need cacheId at submit time even
  // though the display fee no longer comes from the quote).
  const { quote, isStale, refresh } = useFees()
  // Display fee is a pure function of (kind, amount). Today shield = 0 (user pays own gas),
  // shield-xchain = CCTP fast-fee estimate (~2 bps of amount).
  const computedKind: SubmittedKind = computeKind(fromChainId, hubChainId)
  const fee: bigint = userFeeForKind(computedKind, amount)
  // Floor at 0 — when amount < fee (e.g. user typed a value smaller than the CCTP fee) the raw
  // subtraction would render as a negative figure in the FeeSummary. The contract rejects
  // on-chain anyway; clamping just keeps the UI honest until the user types a viable amount.
  const netAmount = amount > fee ? amount - fee : 0n

  // Two useTx hooks mounted; only one gets a record per flow. Pattern mirrors SendModal +
  // UnshieldModal where same-chain vs cross-chain are sibling kinds.
  const txShield = useTx({ kind: 'shield' })
  const txShieldXchain = useTx({ kind: 'shield-xchain' })
  const activeTx =
    submittedKind === 'shield' ? txShield
    : submittedKind === 'shield-xchain' ? txShieldXchain
    : null
  const record = activeTx?.record ?? null

  // Reset local state on close so re-opening starts fresh.
  useEffect(() => {
    if (!isOpen) {
      setStep('input')
      setSubmitError(null)
      setErrorAtStep(undefined)
      setAmountStr('')
      setSubmittedKind(null)
    }
  }, [isOpen])

  // Once the tx record exists and reaches a terminal state, transition step accordingly.
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
      // Submit with a fresh cacheId — if the cached quote is within the staleness window the
      // modal sat through, re-quote first so the relayer doesn't reject with FEE_EXPIRED.
      const activeQuote = quote && !isStale ? quote : await refresh()
      if (!activeQuote) {
        throw new Error('Could not fetch a current fee quote — please try again.')
      }
      if (computedKind === 'shield') {
        setSubmittedKind('shield')
        await txShield.submit({
          amount,
          feeCacheId: activeQuote.cacheId,
          fromChainId,
        })
      } else {
        setSubmittedKind('shield-xchain')
        await txShieldXchain.submit({
          amount,
          feeCacheId: activeQuote.cacheId,
          fromChainId,
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
      {step === 'progress' && <ProgressStep record={record} />}
      {step === 'complete' && <ShieldCompleteStep netAmount={netAmount} onDone={close} />}
      {step === 'error' && (
        <ErrorStep
          error={record?.artifacts.error ?? null}
          message={submitError ?? undefined}
          explorerUrl={txExplorerUrl(record?.walletContext.sourceChainId, displayTxHash(record))}
          onRetry={errorAtStep === 'review' ? () => setStep('review') : () => activeTx?.retry()}
        />
      )}
    </ActionFlowShell>
  )
}
