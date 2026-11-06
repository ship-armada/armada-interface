// ABOUTME: LockedDashboard — the dashboard's card stack before sign-in: the sign-in card in the balance spot, the earn banner
// ABOUTME: from the public APY (signing in on tap), and a placeholder where activity shows once signed in (history is encrypted until then).

import { ChartBarIcon, ClockIcon } from '@heroicons/react/24/outline'
import { DepositTooltip } from '@/components/dashboard/DepositTooltip'
import { SignInCard, type SignInCardProps } from '@/components/dashboard/SignInCard'
import styles from './LockedDashboard.module.css'

export interface LockedDashboardProps {
  card: SignInCardProps
  /** The earn banner, when the vault pays a real (public) APY; tapping it signs in, then opens Earn. */
  earnBanner: { headline: string; ariaLabel: string; infoTooltip: string; onDeposit: () => void } | null
}

export function LockedDashboard({ card, earnBanner }: LockedDashboardProps) {
  return (
    <>
      <SignInCard {...card} />
      {earnBanner ? (
        <DepositTooltip
          stretch
          BadgeIcon={ChartBarIcon}
          badgeBackground="white"
          iconTileTone="purple"
          headline={earnBanner.headline}
          body="Add USDC to Armada's shielded vault and start earning now."
          infoTooltip={earnBanner.infoTooltip}
          ariaLabel={earnBanner.ariaLabel}
          onDeposit={earnBanner.onDeposit}
        />
      ) : null}
      <section className={styles.activity} aria-label="Recent activity">
        <span className={styles.activityIcon} aria-hidden>
          <ClockIcon strokeWidth={1.5} />
        </span>
        <p className={styles.activityText}>Sign in to see your activity.</p>
      </section>
    </>
  )
}
