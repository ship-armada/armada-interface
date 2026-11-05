// ABOUTME: useBalanceLatencyProbe — times each tx's completion to the next change of the shielded balance (USDC or vault
// ABOUTME: shares), so we can see how long the balance lags a confirmed tx (3D). Telemetry + session samples. Mount at App root.

import { useEffect, useRef } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { activeTxListAtom } from '@/state/tx'
import { shieldedUsdcAtom, yieldSharesAtom } from '@/state/wallet'
import { balanceLatencySamplesAtom } from '@/state/txTimings'
import { isTerminalState, type TxExecutionState, type TxKind } from '@/lib/tx/types'
import { track } from '@/lib/telemetry'

/** A probe gives up after this long — reported as timed out (the balance may already have caught up at completion). */
export const BALANCE_PROBE_TIMEOUT_MS = 120_000

/** Samples kept for the Debug page. */
const SAMPLE_CAP = 200

interface Probe {
  kind: TxKind
  startedAt: number
  balanceKey: string
  timer: ReturnType<typeof setTimeout>
}

/**
 * Starts a probe when a record this session watched in flight completes (not one first seen already settled — that's
 * history — and not a received payment, which only exists once the balance already has it). The probe reports at the
 * first balance change after completion, or as timed out after BALANCE_PROBE_TIMEOUT_MS.
 */
export function useBalanceLatencyProbe(): void {
  const records = useAtomValue(activeTxListAtom)
  const usdc = useAtomValue(shieldedUsdcAtom)
  const shares = useAtomValue(yieldSharesAtom)
  const setSamples = useSetAtom(balanceLatencySamplesAtom)
  const balanceKey = `${usdc ?? ''}:${shares ?? ''}`
  const balanceKeyRef = useRef(balanceKey)
  balanceKeyRef.current = balanceKey
  const statesRef = useRef(new Map<string, TxExecutionState>())
  const probesRef = useRef(new Map<string, Probe>())

  useEffect(() => {
    for (const record of records) {
      const before = statesRef.current.get(record.id)
      statesRef.current.set(record.id, record.executionState)
      const justCompleted = before !== undefined && !isTerminalState(before) && record.executionState === 'completed'
      if (!justCompleted || record.kind === 'transfer-shielded-received' || probesRef.current.has(record.id)) continue
      const { id, kind } = record
      const startedAt = Date.now()
      const timer = setTimeout(() => {
        probesRef.current.delete(id)
        track('tx.balance.latency', { id, kind, durationMs: Date.now() - startedAt, timedOut: true })
      }, BALANCE_PROBE_TIMEOUT_MS)
      probesRef.current.set(id, { kind, startedAt, balanceKey: balanceKeyRef.current, timer })
    }
  }, [records])

  useEffect(() => {
    for (const [id, probe] of probesRef.current) {
      if (probe.balanceKey === balanceKey) continue
      clearTimeout(probe.timer)
      probesRef.current.delete(id)
      const durationMs = Date.now() - probe.startedAt
      track('tx.balance.latency', { id, kind: probe.kind, durationMs, timedOut: false })
      setSamples((samples) => [...samples, { kind: probe.kind, durationMs }].slice(-SAMPLE_CAP))
    }
  }, [balanceKey, setSamples])

  useEffect(() => {
    const probes = probesRef.current
    return () => {
      for (const probe of probes.values()) clearTimeout(probe.timer)
      probes.clear()
    }
  }, [])
}
