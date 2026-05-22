// ABOUTME: Ensures the connected wallet is on a specific chain before a user-signed transaction; prompts to switch otherwise.
// ABOUTME: Called by tx handlers at their first user-signature point. Throws a friendly error on user rejection so the tx record carries actionable copy.

import { getAccount, switchChain } from 'wagmi/actions'
import { wagmiConfig } from '@/config/wagmi'
import { getChainById } from '@/config/network'

function chainLabel(chainId: number): string {
  return getChainById(chainId)?.name ?? `chain ${chainId}`
}

/**
 * Heuristic for user-rejected-request errors across wallet stacks. viem throws
 * `UserRejectedRequestError` (code 4001). MetaMask sometimes surfaces it with code 4001 or as
 * a plain Error with "User rejected" / "User denied" in the message. Cover all the common
 * shapes — false positives here are harmless (we throw a friendlier message anyway).
 */
function isUserRejection(err: unknown): boolean {
  if (!err) return false
  const e = err as { code?: number | string; name?: string; message?: string; cause?: unknown }
  if (e.code === 4001 || e.code === 'ACTION_REJECTED') return true
  if (e.name === 'UserRejectedRequestError') return true
  const msg = e.message ?? ''
  if (/user (rejected|denied|cancelled)/i.test(msg)) return true
  // viem wraps the underlying provider error in `.cause`; recurse one level.
  if (e.cause && e.cause !== err) return isUserRejection(e.cause)
  return false
}

/**
 * Ensure the connected EVM wallet is on `targetChainId` before signing. No-op if already on
 * the right chain. Otherwise prompts the user to switch (via wagmi → wallet → MetaMask) and
 * waits for the switch to settle.
 *
 * Throws a friendly user-facing message on rejection or unknown wallet errors so the tx
 * record's `error` field is actionable. Throws if no wallet is connected at all.
 *
 * Use at the top of each handler's first user-signed step. The handler's outer try/catch
 * captures the thrown error and routes it into the tx record via `markFailed`.
 *
 * Implementation note: we query the connector's *live* chainId via `connector.getChainId()`
 * rather than reading `getAccount(config).chainId`. The latter reflects the last
 * `chainChanged` event wagmi observed — which can be stale when wagmi's cached state desyncs
 * from the wallet (e.g. mid-flight switches, dropped events, race conditions on connector
 * reconnect). Querying live mirrors what every wagmi action does internally before throwing
 * `ConnectorChainMismatchError`, so we make the same comparison they will.
 */
export async function ensureChain(targetChainId: number): Promise<void> {
  const account = getAccount(wagmiConfig)
  if (!account.isConnected || !account.connector) {
    throw new Error('No wallet connected — connect a wallet before submitting a transaction.')
  }
  const liveChainId = await account.connector.getChainId()
  if (liveChainId === targetChainId) return
  try {
    await switchChain(wagmiConfig, { chainId: targetChainId })
  } catch (err) {
    if (isUserRejection(err)) {
      throw new Error(
        `Network switch declined. Approve the switch to ${chainLabel(targetChainId)} in your wallet and try again.`,
      )
    }
    const msg = err instanceof Error ? err.message : 'unknown error'
    throw new Error(`Could not switch to ${chainLabel(targetChainId)}: ${msg}`)
  }
}

// Internal — exported for tests only. Do not import from app code.
export { isUserRejection as _isUserRejection }
