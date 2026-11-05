// ABOUTME: usePendingTxLabel — the header pill's label for the one tx in flight ("Shielding 5.00 USDC…"), from the notice
// ABOUTME: copy, so the pill names it for as long as it's pending. Null when none or several are pending ("N Pending").

import { useAtomValue } from 'jotai'
import { pendingTxsAtom } from '@/state/tx'
import { balanceHiddenAtom } from '@/state/ui'
import { evmAddressAtom, shieldedWalletAtom } from '@/state/wallet'
import { selfSendAsMerge } from '@/lib/tx/selfSend'
import { txNoticeTitle } from '@/components/tx/noticeCopy'

export function usePendingTxLabel(): string | null {
  const pending = useAtomValue(pendingTxsAtom)
  const hideAmounts = useAtomValue(balanceHiddenAtom)
  const ownEvmAddress = useAtomValue(evmAddressAtom)
  const ownShieldedAddress = useAtomValue(shieldedWalletAtom).shieldedAddress
  const only = pending.length === 1 ? pending[0] : undefined
  if (!only) return null
  // Read like the Activity row: a private send to the wallet's own 0zk is a merge.
  return txNoticeTitle(selfSendAsMerge(only, ownShieldedAddress), 'pending', { hideAmounts, ownEvmAddress })
}
