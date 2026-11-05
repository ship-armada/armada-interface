// ABOUTME: FeeInfo — the ⓘ beside a fee label (Review, confirmation, receipt) saying what the fee pays for and who gets
// ABOUTME: it: one fee's short explanation, or a combined "Fees" row's parts as a list. Copy lives here, in FEE_COPY.

import { InformationCircleIcon } from '@heroicons/react/24/outline'
import { Tooltip } from '@/components/ui/Tooltip'
import styles from './FeeInfo.module.css'

/** The fees a row can be made of. */
export type FeePart = 'relayer' | 'protocol' | 'cctp' | 'gas'

const FEE_COPY: Record<FeePart, { title: string; body: string }> = {
  relayer: { title: 'Relayer fee', body: 'Pays the relayer that submits your transaction, network gas included.' },
  protocol: { title: 'Protocol fee', body: 'Armada’s ~0.5% shield fee.' },
  cctp: { title: 'CCTP fee', body: 'Circle’s fee to move USDC between chains, taken from the amount sent.' },
  gas: { title: 'Network gas', body: 'Paid in ETH from your wallet.' },
}

/** A shield's combined "Fees": the relayer's when it submits (gasless), the pool's protocol fee, and Circle's cross-chain. */
export function shieldFeeParts({ gasless, crossChain }: { gasless: boolean; crossChain: boolean }): FeePart[] {
  return [...(gasless ? (['relayer'] as const) : []), 'protocol', ...(crossChain ? (['cctp'] as const) : [])]
}

export function FeeInfo({ parts }: { parts: readonly FeePart[] }) {
  const [only] = parts
  const trigger = (
    <button type="button" className={styles.trigger} aria-label="What is this fee?">
      <InformationCircleIcon className={styles.icon} aria-hidden />
    </button>
  )
  // No heading: the row's label already names the fee. A combined row lists its parts by name.
  return (
    <span className={styles.anchor}>
      {parts.length === 1 && only ? (
        <Tooltip variant="rich" description={FEE_COPY[only].body}>
          {trigger}
        </Tooltip>
      ) : (
        <Tooltip variant="rich" bullets={parts.map((part) => `${FEE_COPY[part].title}: ${FEE_COPY[part].body}`)}>
          {trigger}
        </Tooltip>
      )}
    </span>
  )
}
