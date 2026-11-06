// ABOUTME: useCloseFlowsOnLock — when the wallet locks, close any open flow, the receipt and the activity panel: the app shell
// ABOUTME: stays mounted while locked, and they all need the unlocked wallet. Settings and the restore modal stay open.

import { useEffect, useRef } from 'react'
import { useAtomValue, useSetAtom, useStore } from 'jotai'
import { activityPanelOpenAtom, openModalAtom, receiptTxIdAtom, type ModalKind } from '@/state/ui'
import { shieldedWalletAtom } from '@/state/wallet'

/** Modals that work (or are needed) while locked. */
const STAY_OPEN_WHEN_LOCKED: ReadonlySet<ModalKind> = new Set<ModalKind>(['settings', 'restore'])

/** Mount once at App root. */
export function useCloseFlowsOnLock(): void {
  const unlocked = useAtomValue(shieldedWalletAtom).status === 'unlocked'
  const setOpenModal = useSetAtom(openModalAtom)
  const setReceiptId = useSetAtom(receiptTxIdAtom)
  const setActivityPanelOpen = useSetAtom(activityPanelOpenAtom)
  const store = useStore()
  const wasUnlocked = useRef(unlocked)

  useEffect(() => {
    if (wasUnlocked.current && !unlocked) {
      if (!STAY_OPEN_WHEN_LOCKED.has(store.get(openModalAtom))) setOpenModal(null)
      setReceiptId(null)
      setActivityPanelOpen(false)
    }
    wasUnlocked.current = unlocked
  }, [unlocked, store, setOpenModal, setReceiptId, setActivityPanelOpen])
}
