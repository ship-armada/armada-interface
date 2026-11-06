// ABOUTME: useOpenActionModal — the one way into a flow (deposit, send, request, earn…): connects the wallet when there's
// ABOUTME: none, signs in when locked (useSignIn — the card's inline sign-in — resuming the flow after), opens it when signed in.

import { useCallback, useEffect } from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { useAccount } from 'wagmi'
import { useConnectModal } from '@rainbow-me/rainbowkit'
import { openModalAtom, signInAwaitingConnectAtom, signInResumeAtom, type ActionModalKind } from '@/state/ui'
import { shieldedWalletAtom } from '@/state/wallet'
import { useSignIn } from '@/hooks/useSignIn'

/**
 * Returns `open(kind?)`. With a `kind`, it opens that flow — after connecting and/or signing in as needed (the flow is
 * queued in `signInResumeAtom`, which `useSignIn` opens on success). With no `kind` it just signs in (the dashboard's
 * sign-in card). While waiting for a wallet to connect it carries on once wagmi reports one — so connecting and signing
 * are one click; a wallet that reconnects on its own (page load) is never asked to sign.
 */
export function useOpenActionModal() {
  const { isConnected } = useAccount()
  const { openConnectModal } = useConnectModal()
  const unlocked = useAtomValue(shieldedWalletAtom).status === 'unlocked'
  const setOpenModal = useSetAtom(openModalAtom)
  const [resume, setResume] = useAtom(signInResumeAtom)
  const [awaitingConnect, setAwaitingConnect] = useAtom(signInAwaitingConnectAtom)
  const { start: startSignIn } = useSignIn()

  // Connected after a tap with no wallet: open the queued flow if already signed in (a restored wallet), else sign in.
  useEffect(() => {
    if (!isConnected || !awaitingConnect) return
    setAwaitingConnect(false)
    if (unlocked) {
      if (resume) setOpenModal(resume)
      setResume(null)
      return
    }
    void startSignIn()
  }, [isConnected, awaitingConnect, unlocked, resume, setAwaitingConnect, setOpenModal, setResume, startSignIn])

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
        void startSignIn()
        return
      }
      if (kind) setOpenModal(kind)
    },
    [isConnected, unlocked, openConnectModal, setOpenModal, setResume, setAwaitingConnect, startSignIn],
  )
}
