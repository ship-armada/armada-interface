// ABOUTME: headlineAmount — the USDC figure a record's list row / activity item shows: its `meta.amount`, except a
// ABOUTME: consolidation, which moves no value (amount 0) and is shown by the fee it paid instead.

import type { TxRecord } from './types'

/**
 * The USDC amount a record is summarised by in lists. A consolidation merges the wallet's own notes, so
 * `meta.amount` is 0n and the only USDC that leaves the wallet is the relayer fee — that's what the row shows.
 */
export function headlineAmount(record: TxRecord): bigint {
  if (record.kind === 'consolidate') return (record as TxRecord<'consolidate'>).meta.broadcasterFeeAmount
  return record.meta.amount
}
