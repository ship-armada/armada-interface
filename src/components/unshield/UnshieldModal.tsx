// ABOUTME: UnshieldModal — withdraw private USDC to an EVM address. Selects unshield-local or unshield-xchain based on destination chain.
// ABOUTME: Two useTx hooks are mounted (one per kind); submit picks the right one. Record subscription follows the kind that was submitted.

import { useEffect, useState } from 'react'
import { useAtom, useAtomValue } from 'jotai'
import { openModalAtom } from '@/state/ui'
import { evmAddressAtom, shieldedUsdcAtom } from '@/state/wallet'
import { useTx } from '@/hooks/useTx'
import { useFees } from '@/hooks/useFees'
import { getNetworkConfig } from '@/config/network'
import { parseUsdcInput } from '@/lib/format'
import {
  ActionFlowShell,
  ProgressStep,
  ErrorStep,
  type FlowStep,
  type FlowVisibleStep,
} from '@/components/flow'
import { UnshieldInputStep } from './UnshieldInputStep'
import { UnshieldReviewStep } from './UnshieldReviewStep'
import { UnshieldCompleteStep } from './UnshieldCompleteStep'

type LocalStep = FlowStep

const STEPS: ReadonlyArray<FlowVisibleStep> = ['input', 'review', 'progress', 'complete']

type SubmittedKind = 'unshield-local' | 'unshield-xchain'

export function UnshieldModal() {
  const [openModal, setOpenModal] = useAtom(openModalAtom)
  const isOpen = openModal === 'unshield'

  // Form state.
  const hubChainId = getNetworkConfig().hub.chainId
  const connectedEvm = useAtomValue(evmAddressAtom)
  const [destChainId, setDestChainId] = useState<number>(hubChainId)
  const [recipient, setRecipient] = useState<string>('')
  const [amountStr, setAmountStr] = useState<string>('')

  // Flow state.
  const [step, setStep] = useState<LocalStep>('input')
  const [errorAtStep, setErrorAtStep] = useState<FlowVisibleStep | undefined>(undefined)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submittedKind, setSubmittedKind] = useState<SubmittedKind | null>(null)

  // Source data.
  const shieldedUsdc = useAtomValue(shieldedUsdcAtom)
  const max = shieldedUsdc ?? 0n
  const amount = parseUsdcInput(amountStr)
  const { quote, isStale } = useFees()
  const fee: bigint | null = quote ? 0n : null // TODO: source per-kind fee when relayer fee schedule lands
  const netAmount = amount > 0n && fee !== null ? amount - fee : amount

  // Two hooks mounted; whichever kind we submit to gets a record. The other stays idle.
  const txLocal = useTx({ kind: 'unshield-local' })
  const txXchain = useTx({ kind: 'unshield-xchain' })
  const activeTx = submittedKind === 'unshield-local' ? txLocal : submittedKind === 'unshield-xchain' ? txXchain : null
  const record = activeTx?.record ?? null

  const computedKind: SubmittedKind = destChainId === hubChainId ? 'unshield-local' : 'unshield-xchain'

  // Pre-fill recipient from the connected EVM wallet the first time the modal opens (if available).
  useEffect(() => {
    if (isOpen && !recipient && connectedEvm) setRecipient(connectedEvm)
  }, [isOpen, recipient, connectedEvm])

  // Reset local state on close.
  useEffect(() => {
    if (!isOpen) {
      setStep('input')
      setSubmitError(null)
      setErrorAtStep(undefined)
      setAmountStr('')
      setSubmittedKind(null)
    }
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
      if (computedKind === 'unshield-local') {
        setSubmittedKind('unshield-local')
        await txLocal.submit({
          amount,
          feeCacheId: quote?.cacheId ?? '',
          recipient,
        })
      } else {
        setSubmittedKind('unshield-xchain')
        await txXchain.submit({
          amount,
          feeCacheId: quote?.cacheId ?? '',
          toChainId: destChainId,
          recipient,
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
      title="Withdraw"
      step={step}
      steps={STEPS}
      errorAtStep={errorAtStep}
    >
      {step === 'input' && (
        <UnshieldInputStep
          destChainId={destChainId}
          onDestChainIdChange={setDestChainId}
          recipient={recipient}
          onRecipientChange={setRecipient}
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
        <UnshieldReviewStep
          destChainId={destChainId}
          recipient={recipient}
          amount={amount}
          fee={fee}
          netAmount={netAmount}
          isXchain={computedKind === 'unshield-xchain'}
          onBack={() => setStep('input')}
          onConfirm={handleSubmit}
        />
      )}
      {step === 'progress' && <ProgressStep record={record} />}
      {step === 'complete' && (
        <UnshieldCompleteStep
          destChainId={destChainId}
          recipient={recipient}
          netAmount={netAmount}
          onDone={close}
        />
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
