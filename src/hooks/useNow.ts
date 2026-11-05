// ABOUTME: useNow — the current time (ms), re-read every `intervalMs` while `enabled`, for live displays that change with
// ABOUTME: elapsed time (the progress view's timing note, the proof ring). Frozen when disabled; the timer is cleaned up.

import { useEffect, useState } from 'react'

export function useNow(intervalMs: number, enabled: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!enabled) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs, enabled])
  return now
}
