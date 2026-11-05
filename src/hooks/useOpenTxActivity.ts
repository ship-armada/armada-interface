// ABOUTME: useOpenTxActivity — opens a tx's Activity receipt, or the All activity panel, from any page: sets the
// ABOUTME: Dashboard's atoms and routes to the Dashboard (which renders both). Used by the header pill and tx notices.

import { useCallback } from 'react'
import { useSetAtom } from 'jotai'
import { useNavigate } from 'react-router-dom'
import { activityPanelOpenAtom, receiptTxIdAtom } from '@/state/ui'

export interface OpenTxActivity {
  openReceipt: (txId: string) => void
  openActivity: () => void
}

export function useOpenTxActivity(): OpenTxActivity {
  const navigate = useNavigate()
  const setReceiptTxId = useSetAtom(receiptTxIdAtom)
  const setActivityPanelOpen = useSetAtom(activityPanelOpenAtom)

  const openReceipt = useCallback(
    (txId: string) => {
      setReceiptTxId(txId)
      navigate('/')
    },
    [navigate, setReceiptTxId],
  )

  const openActivity = useCallback(() => {
    setActivityPanelOpen(true)
    navigate('/')
  }, [navigate, setActivityPanelOpen])

  return { openReceipt, openActivity }
}
