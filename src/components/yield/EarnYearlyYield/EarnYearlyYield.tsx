// ABOUTME: Estimated yearly yield beside the earn balance — chart icon and a two-decimal figure.
// ABOUTME: The tooltip names the figure. The number comes from the live rate, not a demo constant.
import { ChartBarIcon } from '@heroicons/react/24/solid'
import { Tooltip } from '@/design'
import styles from './EarnYearlyYield.module.css'

export interface EarnYearlyYieldProps {
  /** Already formatted USDC figure, e.g. "4.20". */
  figure: string
}

export function EarnYearlyYield({ figure }: EarnYearlyYieldProps) {
  return (
    <Tooltip variant="centered" content="Est. yearly yield">
      <button
        type="button"
        className={styles.trigger}
        aria-label={`Est. yearly yield, ${figure} USDC`}
      >
        <span className={styles.cluster} data-tooltip-anchor="">
          <ChartBarIcon className={styles.icon} aria-hidden />
          <span className={styles.figure}>{figure}</span>
        </span>
      </button>
    </Tooltip>
  )
}
