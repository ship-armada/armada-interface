// ABOUTME: Poll Iris for a CCTP attestation tied to a specific in-flight TxRecord.
// ABOUTME: Stub: typed API. Real implementation wires `poll()` from lib/tx/poller against `pollIrisOnce` from lib/cctp.

import type { TxRecord } from '@/lib/tx/types'

export interface UseCctpAttestationResult {
  /** "pending" until Iris returns "complete"; "ready" once attestation bytes are stashed in the record. */
  status: 'pending' | 'ready' | 'expired'
}

export function useCctpAttestation(_record: TxRecord<'unshield-xchain'> | TxRecord<'payment-xchain'> | undefined): UseCctpAttestationResult {
  return { status: 'pending' }
}
