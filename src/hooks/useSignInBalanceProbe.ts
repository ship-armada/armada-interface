// ABOUTME: useSignInBalanceProbe — times sign-in (the active wallet unlocking) to the first known SDK balance, tagged cold
// ABOUTME: (no history checkpoint on this device) or warm, so we can see how long a returning user waits. Mount at App root.

import { useEffect, useRef } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { activeShieldedWalletAtom, activeShieldedWalletIdAtom, shieldedUsdcAtom } from '@/state/wallet'
import { signInLatencySamplesAtom } from '@/state/txTimings'
import { readHistoryCheckpoint } from '@/lib/shielded/history-checkpoint'
import { track } from '@/lib/telemetry'

/** Samples kept for the Debug page. */
const SAMPLE_CAP = 50

/** One sample per sign-in: the probe starts when the wallet unlocks and ends at the first non-null balance. */
export function useSignInBalanceProbe(): void {
  const unlocked = useAtomValue(activeShieldedWalletAtom)?.status === 'unlocked'
  const walletId = useAtomValue(activeShieldedWalletIdAtom)
  const usdc = useAtomValue(shieldedUsdcAtom)
  const setSamples = useSetAtom(signInLatencySamplesAtom)
  const probeRef = useRef<{ startedAt: number; cold: boolean } | null>(null)

  useEffect(() => {
    if (!unlocked || walletId === null) {
      probeRef.current = null
      return
    }
    // Read at unlock, before this session's scan writes a checkpoint.
    probeRef.current = { startedAt: Date.now(), cold: readHistoryCheckpoint(walletId) === null }
  }, [unlocked, walletId])

  useEffect(() => {
    const probe = probeRef.current
    if (probe === null || usdc === null) return
    probeRef.current = null
    const sample = { durationMs: Date.now() - probe.startedAt, cold: probe.cold }
    track('sync.initial', sample)
    setSamples((samples) => [...samples, sample].slice(-SAMPLE_CAP))
  }, [usdc, setSamples])
}
