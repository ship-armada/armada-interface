// ABOUTME: CCTP helpers — MessageSent event parsing, Iris attestation polling, message-hash derivation.
// ABOUTME: Stub: signatures only. Implementation lands when cross-chain flows are wired (per plan §7 lifecycles).

export interface CctpMessageRef {
  sourceDomain: number
  destinationDomain: number
  nonce: bigint
  /** Raw message bytes from MessageSent event. */
  message: `0x${string}`
  /** keccak256(message), used as Iris lookup id in v2. */
  messageHash: `0x${string}`
}

export interface IrisAttestation {
  status: 'pending' | 'pending_confirmations' | 'complete'
  attestation?: `0x${string}`
  message?: `0x${string}`
}

/** Parse a MessageSent event log into a normalized message reference. */
export function parseMessageSentLog(_log: unknown): CctpMessageRef {
  throw new Error('cctp.parseMessageSentLog: not implemented (scaffold).')
}

/** Single Iris poll. Caller owns the loop + abort/backoff/timeout via `lib/tx/poller.ts`. */
export async function pollIrisOnce(
  _baseUrl: string,
  _sourceDomain: number,
  _txHash: `0x${string}`,
  _signal?: AbortSignal,
): Promise<IrisAttestation[]> {
  throw new Error('cctp.pollIrisOnce: not implemented (scaffold).')
}
