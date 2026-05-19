// ABOUTME: Top-level route shell — installs the visibility listener once, hydrates tx history, starts the executor engine.
// ABOUTME: The executor lives module-scope (lib/tx/executor.ts); we just call startEngine() in an effect so it runs once after the providers mount.

import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { AppLayout } from '@/components/AppLayout'
import { useTabVisible } from '@/hooks/useTabVisible'
import { useTxHistory } from '@/hooks/useTxHistory'
import { startEngine } from '@/lib/tx/executor'

export function App() {
  useTabVisible()
  useTxHistory() // hydrate tx history from IDB on cold load

  useEffect(() => {
    // Start the tx execution engine. Idempotent + module-scope, so this runs
    // safely under StrictMode's double-mount and never spawns a second engine.
    startEngine()
  }, [])

  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  )
}
