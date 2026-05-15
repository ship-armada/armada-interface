// ABOUTME: Top-level route shell — installs the visibility listener once and renders AppLayout around the route outlet.
// ABOUTME: Every page renders inside AppLayout via <Outlet />.

import { Outlet } from 'react-router-dom'
import { AppLayout } from '@/components/AppLayout'
import { useTabVisible } from '@/hooks/useTabVisible'
import { useTxHistory } from '@/hooks/useTxHistory'

export function App() {
  useTabVisible()
  useTxHistory() // hydrate tx history from IDB on cold load

  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  )
}
