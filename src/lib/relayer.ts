// ABOUTME: HTTP client for the Armada relayer — typed fees / relay / status requests with structured error handling.
// ABOUTME: Stub: types are complete, body is intentionally empty (`throw not-implemented`). Implementation lands with the first feature that submits.

import { RELAYER_ENDPOINTS, relayerEndpoint, type RelayerErrorCode } from '@/config/relayer'

export interface FeeSchedule {
  cacheId: string
  expiresAt: number
  chainId: number
  fees: {
    transfer: string
    unshield: string
    crossContract: string
    crossChainShield: string
    crossChainUnshield: string
  }
}

export interface RelayRequest {
  chainId: number
  to: string
  data: string
  feesCacheId: string
}

export interface RelayResponse {
  txHash: string
  status: 'pending'
}

export interface StatusResponse {
  status: 'pending' | 'confirmed' | 'failed'
  blockNumber?: number
  error?: string
}

export class RelayerError extends Error {
  readonly code: RelayerErrorCode
  readonly httpStatus: number
  constructor(code: RelayerErrorCode, httpStatus: number, message: string) {
    super(message)
    this.name = 'RelayerError'
    this.code = code
    this.httpStatus = httpStatus
  }
}

export async function fetchFees(_signal?: AbortSignal): Promise<FeeSchedule> {
  void RELAYER_ENDPOINTS // satisfy unused import while the body is stubbed
  void relayerEndpoint
  throw new Error('relayer.fetchFees: not implemented (scaffold). Wire up when the fees flow lands.')
}

export async function submitRelay(_req: RelayRequest, _signal?: AbortSignal): Promise<RelayResponse> {
  throw new Error('relayer.submitRelay: not implemented (scaffold).')
}

export async function pollStatus(_txHash: string, _signal?: AbortSignal): Promise<StatusResponse> {
  throw new Error('relayer.pollStatus: not implemented (scaffold).')
}
