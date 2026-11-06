// ABOUTME: VaultExplainer — "How the shielded vault works": a text button on the Earn step that opens a short panel on where
// ABOUTME: the yield comes from, the vault's fee, withdrawing, privacy and the risks (12F). Copy pending product/legal sign-off.

import { useId, useState } from 'react'
import { ChevronDownIcon } from '@heroicons/react/24/outline'
import { formatFeePercent } from '@/lib/yield'
import styles from './VaultExplainer.module.css'

const TITLE = 'How the shielded vault works'

export interface VaultExplainerProps {
  /** The vault's fee on earnings (basis points), when known — named in the fee line. */
  yieldFeeBps?: bigint
}

export function VaultExplainer({ yieldFeeBps }: VaultExplainerProps) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const fee = yieldFeeBps !== undefined ? `keeps ${formatFeePercent(yieldFeeBps)} of what you earn` : 'keeps a share of what you earn'

  return (
    <div className={styles.root}>
      <button
        type="button"
        className={styles.toggle}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        {TITLE}
        <ChevronDownIcon className={[styles.chevron, open && styles.chevronOpen].filter(Boolean).join(' ')} aria-hidden />
      </button>
      {open ? (
        <section id={panelId} className={styles.panel} aria-label={TITLE}>
          <p>
            <strong>Where the yield comes from.</strong> The vault lends your USDC on Aave and earns its interest. The rate
            changes with demand for borrowing.
          </p>
          <p>
            <strong>Fee.</strong> The vault {fee}; the rate shown is already after it.
          </p>
          <p>
            <strong>Withdraw any time.</strong> Move USDC back to your private balance whenever you like, for the usual
            relayer fee.
          </p>
          <p>
            <strong>Private.</strong> Your vault position is held in your shielded balance, not linked to your public
            address.
          </p>
          <p>
            <strong>Risks.</strong> Like any DeFi deposit, funds depend on smart contracts (Armada&apos;s and Aave&apos;s)
            working as intended. If Aave&apos;s USDC is fully borrowed, a withdrawal can be delayed until there&apos;s
            liquidity. The rate isn&apos;t guaranteed, and deposits aren&apos;t insured.
          </p>
        </section>
      ) : null}
    </div>
  )
}
