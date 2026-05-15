// ABOUTME: RPC provider creation with ordered fallback across multiple URLs.
// ABOUTME: Duplicated from @armada/crowdfund-shared/lib/rpc.ts (with crowdfund-specific log fetching trimmed). Extract to @armada/eth-utils when both apps evolve it.

import { JsonRpcProvider } from 'ethers'
import type { JsonRpcPayload, JsonRpcResult } from 'ethers'

/**
 * JsonRpcProvider subclass that tries multiple RPC URLs in order.
 * On transport-level errors (connection refused, timeout, HTTP 5xx),
 * automatically retries with the next URL. RPC-level errors (execution
 * reverted, invalid params) are NOT retried.
 *
 * On success, "sticks" to that URL for subsequent calls until it fails.
 *
 * Note: overrides ethers v6 internal `_send()`. If ethers changes its
 * transport API, this class needs updating.
 */
export class FallbackJsonRpcProvider extends JsonRpcProvider {
  /** @internal exposed for testing — internal providers, one per URL */
  readonly _providers: JsonRpcProvider[]
  private _currentIndex = 0

  constructor(urls: readonly string[]) {
    if (urls.length === 0) throw new Error('FallbackJsonRpcProvider: at least one URL required')
    const first = urls[0]
    if (!first) throw new Error('FallbackJsonRpcProvider: first URL is empty')
    super(first)
    this._providers = urls.map(u => new JsonRpcProvider(u))
  }

  override async _send(payload: JsonRpcPayload | JsonRpcPayload[]): Promise<JsonRpcResult[]> {
    let lastError: unknown
    for (let attempt = 0; attempt < this._providers.length; attempt++) {
      const index = (this._currentIndex + attempt) % this._providers.length
      const provider = this._providers[index]
      if (!provider) continue
      try {
        const result = await provider._send(payload)
        this._currentIndex = index
        return result
      } catch (err) {
        lastError = err
      }
    }
    throw lastError
  }
}

/** Create a provider with optional ordered fallback. Single URL → plain `JsonRpcProvider`. */
export function createProvider(urls: readonly string[]): JsonRpcProvider {
  if (urls.length === 0) throw new Error('createProvider: no RPC URLs provided')
  const first = urls[0]
  if (!first) throw new Error('createProvider: first URL is empty')
  if (urls.length === 1) return new JsonRpcProvider(first)
  return new FallbackJsonRpcProvider(urls)
}
