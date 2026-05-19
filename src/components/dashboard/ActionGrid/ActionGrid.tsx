// ABOUTME: Dashboard action grid — four ActionCards (Deposit / Withdraw / Send / Earn) wired to setOpenModal.
// ABOUTME: Each card opens the corresponding modal kind; the actual modal content lives in components/<feature>/.

import { ArrowDownToLine, ArrowUpFromLine, Send, TrendingUp } from 'lucide-react'
import { useSetAtom } from 'jotai'
import { openModalAtom } from '@/state/ui'
import { ActionCard } from '../ActionCard'
import styles from './ActionGrid.module.css'

export function ActionGrid() {
  const setOpenModal = useSetAtom(openModalAtom)
  return (
    <div className={styles.grid} role="group" aria-label="Account actions">
      <ActionCard
        icon={ArrowDownToLine}
        title="Deposit"
        subtitle="Move USDC into private balance"
        onClick={() => setOpenModal('shield')}
      />
      <ActionCard
        icon={ArrowUpFromLine}
        title="Withdraw"
        subtitle="Send to your wallet"
        onClick={() => setOpenModal('unshield')}
      />
      <ActionCard
        icon={Send}
        title="Send"
        subtitle="Pay privately or to a wallet"
        onClick={() => setOpenModal('payment')}
      />
      <ActionCard
        icon={TrendingUp}
        title="Earn"
        subtitle="Move into the savings vault"
        onClick={() => setOpenModal('yield-deposit')}
      />
    </div>
  )
}
