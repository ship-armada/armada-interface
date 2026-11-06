// ABOUTME: RestoreModal — restore from a backup file or recovery secret over the dashboard (openModalAtom 'restore'), opened
// ABOUTME: by the sign-in card's link, or on the compatibility screen when a wallet can't use sign-in; closes onto any queued flow.

import { useAtom, useAtomValue, useSetAtom, useStore } from 'jotai'
import { FlowShell } from '@/components/flow/FlowShell'
import { useFlowExit } from '@/components/flow/useFlowExit'
import { lockReasonAtom, openModalAtom, restoreEntryAtom, signInResumeAtom } from '@/state/ui'
import { RestoreFlow } from './RestoreFlow'

export function RestoreModal() {
  const [openModal, setOpenModal] = useAtom(openModalAtom)
  const entry = useAtomValue(restoreEntryAtom)
  const setEntry = useSetAtom(restoreEntryAtom)
  const setResume = useSetAtom(signInResumeAtom)
  const setLockReason = useSetAtom(lockReasonAtom)
  const store = useStore()
  const isOpen = openModal === 'restore'
  // Back to the sign-in card; the next open starts on the restore form.
  const { exiting, requestClose } = useFlowExit(() => {
    setEntry({ view: 'restore' })
    setOpenModal(null)
  })

  if (!isOpen) return null

  // Read at completion, not render: a restore can finish after the modal was closed, and then nothing should open.
  function handleUnlocked() {
    setLockReason(null)
    setEntry({ view: 'restore' })
    const next = store.get(signInResumeAtom)
    setResume(null)
    if (store.get(openModalAtom) !== 'restore') return
    // Straight into the flow requested while locked; else back to the dashboard.
    setOpenModal(next ?? null)
  }

  return (
    <FlowShell open onClose={requestClose} exiting={exiting} flowLabel="Restore wallet" currentStep={1} hideSteps>
      <RestoreFlow
        initialView={entry.view}
        signerErrorReason={entry.view === 'signer-error' ? entry.reason : undefined}
        onUnlocked={handleUnlocked}
        onClose={requestClose}
      />
    </FlowShell>
  )
}
