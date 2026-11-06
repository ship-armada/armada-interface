// ABOUTME: LockedDashboard — the dashboard's card stack before sign-in: the sign-in card in the balance spot and the Recent
// ABOUTME: activity heading over "Sign in to see your activity." (history is encrypted until then), styled like the signed-in list.

import { RecentActivityList } from '@/components/dashboard/RecentActivityList'
import { SignInCard, type SignInCardProps } from '@/components/dashboard/SignInCard'

export interface LockedDashboardProps {
  card: SignInCardProps
}

export function LockedDashboard({ card }: LockedDashboardProps) {
  return (
    <>
      <SignInCard {...card} />
      <RecentActivityList items={[]} locked />
    </>
  )
}
