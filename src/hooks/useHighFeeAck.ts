// ABOUTME: useHighFeeAck — Review's high-fee state (5D): the level and percent for the warning, and the user's "I understand"
// ABOUTME: tick, which resets whenever the fee or amount changes. `blocksConfirm` while a required tick is missing.

import { useState } from 'react'
import { feePercent, highFeeLevel, type HighFeeLevel } from '@/lib/fees/highFee'

export interface HighFeeAck {
  level: HighFeeLevel
  percent: number
  acknowledged: boolean
  setAcknowledged: (acknowledged: boolean) => void
  /** Over the confirm threshold and not yet acknowledged — the Review step holds Confirm. */
  blocksConfirm: boolean
}

/** `fees` = every fee the user loses on this tx (relayer + protocol + CCTP); `amount` = what they typed. */
export function useHighFeeAck(fees: bigint | null, amount: bigint): HighFeeAck {
  const level = highFeeLevel(fees, amount)
  const percent = fees === null ? 0 : feePercent(fees, amount)
  // The tick belongs to the figures it was given for: a re-priced fee (or a new amount) asks again.
  const key = `${fees ?? ''}:${amount}`
  const [ack, setAck] = useState<{ key: string; value: boolean }>({ key, value: false })
  const acknowledged = ack.key === key && ack.value
  return {
    level,
    percent,
    acknowledged,
    setAcknowledged: (value) => setAck({ key, value }),
    blocksConfirm: level === 'confirm' && !acknowledged,
  }
}
