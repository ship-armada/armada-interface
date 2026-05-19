// ABOUTME: Dashboard page — BalanceHero + ActionGrid + RecentActivity/InProgress split. The visual anchor of the app.
// ABOUTME: Layout per UI plan §3: hero full width, action row full width, lower section 7/5 split on desktop and stacked on mobile.

import { BalanceHero } from '@/components/balance/BalanceHero'
import { ActionGrid, RecentActivityCard, InProgressCard } from '@/components/dashboard'
import styles from './Dashboard.module.css'

export function Dashboard() {
  return (
    <div className={styles.page}>
      <BalanceHero />
      <ActionGrid />
      <div className={styles.split}>
        <div className={styles.activity}>
          <RecentActivityCard />
        </div>
        <div className={styles.progress}>
          <InProgressCard />
        </div>
      </div>
      <p className={styles.footnote}>
        Your privacy is protected. All transactions are shielded.
      </p>
    </div>
  )
}
