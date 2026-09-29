// ABOUTME: selfSendAsMerge — a private send addressed to the wallet's own 0zk moved nothing but the fee, so it's shown as a
// ABOUTME: merge (amount 0, the fee its only charge) on the Activity row and receipt alike (spec PS-7, decision D3).

import type { TxRecord } from './types'

/**
 * The record as the Activity list and receipt show it. A private send whose recipient is the wallet's own 0zk (made
 * before the Recipient step refused it) only paid the relayer fee — the note came straight back — so it reads as a
 * merge: amount 0, Fees = Total = the fee. Its identity and lifecycle are kept; the merged token isn't recorded (a
 * recovered merge doesn't know it either). Anything else — or everything, when the own address isn't known — is
 * returned as-is.
 */
export function selfSendAsMerge(record: TxRecord, ownShieldedAddress: string | undefined): TxRecord {
  if (ownShieldedAddress === undefined || record.kind !== 'transfer-shielded') return record
  const meta = (record as TxRecord<'transfer-shielded'>).meta
  if (meta.recipient !== ownShieldedAddress) return record
  return {
    ...record,
    kind: 'consolidate',
    meta: {
      amount: 0n,
      feeCacheId: meta.feeCacheId,
      tokenAddress: '0x',
      broadcasterFeeAmount: meta.broadcasterFeeAmount,
      ...(meta.broadcasterFeePerProof !== undefined ? { broadcasterFeePerProof: meta.broadcasterFeePerProof } : {}),
      broadcasterShieldedAddress: meta.broadcasterShieldedAddress,
    },
  } as TxRecord
}
