// ABOUTME: useOpenActionModal — the one way into a flow (deposit, send, request, earn…): connects the wallet when there's
// ABOUTME: none, signs in when locked (resuming the flow after unlock), opens it straight away when signed in.

import { useCallback, useEffect } from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { useAccount } from 'wagmi'
import { useConnectModal } from '@rainbow-me/rainbowkit'
import { openModalAtom, signInAwaitingConnectAtom, signInResumeAtom, type ActionModalKind } from '@/state/ui'
import { shieldedWalletAtom } from '@/state/wallet'

/**
 * Returns `open(kind?)`. With a `kind`, it opens that flow — after connecting and/or signing in as needed (the flow is
 * queued in `signInResumeAtom`, which the sign-in modal opens on success). With no `kind` it just signs in (the
 * dashboard's sign-in card). While waiting for a wallet to connect it carries on once wagmi reports one.
 */
export function useOpenActionModal() {
  const { isConnected } = useAccount()
  const { openConnectModal } = useConnectModal()
  const unlocked = useAtomValue(shieldedWalletAtom).status === 'unlocked'
  const setOpenModal = useSetAtom(openModalAtom)
  const [resume, setResume] = useAtom(signInResumeAtom)
  const [awaitingConnect, setAwaitingConnect] = useAtom(signInAwaitingConnectAtom)

  // Connected after a tap with no wallet: open the queued flow if already signed in (a restored wallet), else sign in.
  useEffect(() => {
    if (!isConnected || !awaitingConnect) return
    setAwaitingConnect(false)
    if (unlocked) {
      if (resume) setOpenModal(resume)
      setResume(null)
      return
    }
    setOpenModal('sign-in')
  }, [isConnected, awaitingConnect, unlocked, resume, setAwaitingConnect, setOpenModal, setResume])

  return useCallback(
    (kind?: ActionModalKind) => {
      if (!isConnected) {
        setResume(kind ?? null)
        setAwaitingConnect(true)
        openConnectModal?.()
        return
      }
      if (!unlocked) {
        setResume(kind ?? null)
        setOpenModal('sign-in')
        return
      }
      if (kind) setOpenModal(kind)
    },
    [isConnected, unlocked, openConnectModal, setOpenModal, setResume, setAwaitingConnect],
  )
}
