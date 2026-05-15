// ABOUTME: Transaction history page — list of every TxRecord, filterable by status/kind.
// ABOUTME: Scaffold: renders count from useTxHistory(). Real list view arrives with the History pass.

import { useTxHistory } from '@/hooks/useTxHistory'

export function History() {
  const { list } = useTxHistory()
  return (
    <div className="w-full max-w-3xl px-6 text-center">
      <h1 style={{ fontFamily: 'Charis SIL, serif', fontSize: 44, lineHeight: 1.1 }}>
        History
      </h1>
      <p className="mt-4 text-muted-foreground">
        {list.length === 0
          ? 'No transactions yet. Your shield, unshield, yield, and payment activity will appear here.'
          : `${list.length} transaction${list.length === 1 ? '' : 's'} on this device.`}
      </p>
    </div>
  )
}
