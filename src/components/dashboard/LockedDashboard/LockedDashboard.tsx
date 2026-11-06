// ABOUTME: LockedDashboard — the dashboard's card stack before sign-in: the sign-in card in the balance spot and a
// ABOUTME: placeholder where activity shows once signed in (history is encrypted until then).

import { ClockIcon } from '@heroicons/react/24/outline'
import { SignInCard, type SignInCardProps } from '@/components/dashboard/SignInCard'
import styles from './LockedDashboard.module.css'

export interface LockedDashboardProps {
  card: SignInCardProps
}

export function LockedDashboard({ card }: LockedDashboardProps) {
  return (
    <>
      <SignInCard {...card} />
      <section className={styles.activity} aria-label="Recent activity">
        <span className={styles.activityIcon} aria-hidden>
          <ClockIcon strokeWidth={1.5} />
        </span>
        <p className={styles.activityText}>Sign in to see your activity.</p>
      </section>
    </>
  )
}
