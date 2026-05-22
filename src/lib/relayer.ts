// ABOUTME: HTTP client for the Armada relayer — typed fees / relay / status requests with structured error handling.
// ABOUTME: `submitRelay` is deferred (relayer-mediated submit path is a separate commit); fetchFees + pollStatus are wired.

import { RELAYER_ENDPOINTS, RELAYER_STATUS_CODES, relayerEndpoint, type RelayerErrorCode } from '@/config/relayer'
import type { TxKind } from '@/lib/tx/types'

export interface FeeSchedule {
  cacheId: string
  expiresAt: number
  chainId: number
  /** USDC raw values (6 decimals) as strings — JSON can't carry bigints. Callers BigInt() on use. */
  fees: {
    transfer: string
    unshield: string
    crossContract: string
    crossChainShield: string
    crossChainUnshield: string
  }
}

/**
 * Map a tx kind onto the relayer's fee schedule key. Single source of truth so a future schema
 * change (e.g. splitting yield-deposit vs yield-withdraw into separate buckets) is one switch.
 */
export function feeForKind(quote: FeeSchedule, kind: TxKind): bigint {
  switch (kind) {
    // Direct hub shield is user-submitted — no relayer fee today. Show 0 on the Review step.
    case 'shield': return 0n
    // Cross-chain shield: relayer pays gas to deliver the CCTP-attested message on the hub
    // (HookRouter.relayWithHook → MessageTransmitter.receiveMessage → PrivacyPool.shield).
    // The user covers that gas budget via the maxFee passed to crossChainShield, deducted from
    // the amount minted at the hub. Same fee bucket as the inverse direction (xchain unshield).
    case 'shield-xchain': return BigInt(quote.fees.crossChainShield)
    case 'unshield-local': return BigInt(quote.fees.unshield)
    case 'unshield-xchain': return BigInt(quote.fees.crossChainUnshield)
    case 'transfer-shielded': return BigInt(quote.fees.transfer)
    // Yield ops use the cross-contract-calls fee bucket (lend/redeem-and-shield).
    case 'yield-deposit':
    case 'yield-withdraw': return BigInt(quote.fees.crossContract)
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

function statusToErrorCode(httpStatus: number): RelayerErrorCode {
  for (const [code, expected] of Object.entries(RELAYER_STATUS_CODES) as [RelayerErrorCode, number][]) {
    if (expected === httpStatus) return code
  }
  return 'UNKNOWN_ERROR'
}

async function parseError(res: Response): Promise<RelayerError> {
  let message = `Relayer request failed (${res.status})`
  let code: RelayerErrorCode = statusToErrorCode(res.status)
  try {
    const body = (await res.json()) as { error?: string; code?: RelayerErrorCode }
    if (body.error) message = body.error
    if (body.code) code = body.code
  } catch {
    /* body wasn't JSON — keep defaults */
  }
  return new RelayerError(code, res.status, message)
}

/**
 * Fetch the current fee schedule from the relayer. The relayer caches its own schedule with a
 * 5-min TTL and returns the cached value when valid; the client caches at the atom layer via
 * `useFees`. Both can re-fetch independently — relayer is the source of truth.
 */
export async function fetchFees(signal?: AbortSignal): Promise<FeeSchedule> {
  const res = await fetch(relayerEndpoint(RELAYER_ENDPOINTS.fees), {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  })
  if (!res.ok) throw await parseError(res)
  return (await res.json()) as FeeSchedule
}

/**
 * Submit a relay request. Reserved for the relayer-mediated submit path (separate commit) —
 * currently throws. The xchain unshield handler reads `fetchFees` for its `maxFee` but submits
 * its hub tx via the user's wallet, not via this endpoint.
 */
export async function submitRelay(_req: RelayRequest, _signal?: AbortSignal): Promise<RelayResponse> {
  throw new Error('relayer.submitRelay: not implemented — relayer-mediated submit is a future commit.')
}

/** Poll a previously-submitted relay tx's status. */
export async function pollStatus(txHash: string, signal?: AbortSignal): Promise<StatusResponse> {
  const res = await fetch(`${relayerEndpoint(RELAYER_ENDPOINTS.status)}/${txHash}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  })
  if (!res.ok) throw await parseError(res)
  return (await res.json()) as StatusResponse
}
