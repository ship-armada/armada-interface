// ABOUTME: SignInModal — the app's sign-in, opened over the dashboard (openModalAtom 'sign-in'): SignInFlow on the flow
// ABOUTME: modal chrome, signing as soon as a wallet is connected; on success it closes, or continues into the flow tapped while locked.

import { useAtom, useSetAtom, useStore } from 'jotai'
import { FlowShell } from '@/components/flow/FlowShell'
import { useFlowExit } from '@/components/flow/useFlowExit'
import { lockReasonAtom, openModalAtom, signInResumeAtom } from '@/state/ui'
import { SignInFlow } from './SignInFlow'

export function SignInModal() {
  const [openModal, setOpenModal] = useAtom(openModalAtom)
  const setResume = useSetAtom(signInResumeAtom)
  const setLockReason = useSetAtom(lockReasonAtom)
  const store = useStore()
  const isOpen = openModal === 'sign-in'
  // Closing without signing in drops the queued flow — the user chose not to go on.
  const { exiting, requestClose } = useFlowExit(() => {
    setResume(null)
    setOpenModal(null)
  })

  if (!isOpen) return null

  // Read at completion, not render: the signature can land after the modal was closed (the wallet prompt stays open),
  // and then nothing should open — the close already dropped the queued flow.
  function handleUnlocked() {
    setLockReason(null)
    const next = store.get(signInResumeAtom)
    setResume(null)
    if (store.get(openModalAtom) !== 'sign-in') return
    // Straight into the flow that was tapped while locked; else back to the dashboard.
    setOpenModal(next ?? null)
  }

  return (
    <FlowShell open onClose={requestClose} exiting={exiting} flowLabel="Sign in" currentStep={1} hideSteps>
      <SignInFlow autoStart onUnlocked={handleUnlocked} />
    </FlowShell>
  )
}
