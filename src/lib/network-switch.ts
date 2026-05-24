// ABOUTME: Ensures the connected wallet is on a specific chain before a user-signed transaction; prompts to switch otherwise via raw EIP-1193 request.
// ABOUTME: Bypasses wagmi/actions::switchChain so we don't trip wagmi's ConnectorChainMismatchError when its cached state is briefly out of sync with the live connector.

import { getAccount } from 'wagmi/actions'
import { wagmiConfig } from '@/config/wagmi'
import { getChainById } from '@/config/network'

/** Minimal EIP-1193 surface — what `connector.getProvider()` returns. */
interface Eip1193Provider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
}

/** How long to wait for the connector to settle on the new chainId after a successful switch request. */
const POST_SWITCH_SETTLE_TIMEOUT_MS = 3_000
/** Polling interval while waiting for the connector to report the new chainId. */
const POST_SWITCH_POLL_INTERVAL_MS = 100

function chainLabel(chainId: number): string {
  return getChainById(chainId)?.name ?? `chain ${chainId}`
}

function toHexChainId(chainId: number): `0x${string}` {
  return `0x${chainId.toString(16)}`
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
 * Detect EIP-3326 "chain not added" — the wallet doesn't have this chain configured and the user
 * has to add it before the switch can complete. MetaMask returns code 4902; we also accept the
 * message pattern as a fallback for wallets that surface the underlying RPC error.
 */
function isChainNotAdded(err: unknown): boolean {
  if (!err) return false
  const e = err as { code?: number | string; message?: string; cause?: unknown }
  if (e.code === 4902) return true
  const msg = e.message ?? ''
  if (/unrecognized chain|chain.*not (added|recognized|configured)/i.test(msg)) return true
  if (e.cause && e.cause !== err) return isChainNotAdded(e.cause)
  return false
}

/**
 * Narrow the unknown returned by `connector.getProvider()` to our minimal EIP-1193 shape.
 * Both injected (MetaMask) and WalletConnect connectors implement `.request`; smart-wallet
 * connectors wrap an EIP-1193 provider with the same shape.
 */
function asEip1193(provider: unknown): Eip1193Provider | null {
  if (!provider || typeof provider !== 'object') return null
  const candidate = provider as { request?: unknown }
  if (typeof candidate.request !== 'function') return null
  return candidate as Eip1193Provider
}

/**
 * Ensure the connected EVM wallet is on `targetChainId` before signing. No-op if the connector
 * already reports the target chain. Otherwise sends `wallet_switchEthereumChain` directly to the
 * EIP-1193 provider and waits briefly for the connector to acknowledge.
 *
 * Throws a friendly user-facing message on rejection, missing-chain, or unknown wallet errors so
 * the tx record's `error` field is actionable. Throws if no wallet is connected at all.
 *
 * Use at the top of each handler's first user-signed step. The handler's outer try/catch
 * captures the thrown error and routes it into the tx record via `markFailed`.
 *
 * Why raw EIP-1193 instead of `wagmi/actions::switchChain`: when wagmi's cached connection state
 * briefly disagrees with the live connector (which happens on mid-flight chain changes, dropped
 * `chainChanged` events, or connector-reconnect races), wagmi's actions throw
 * `ConnectorChainMismatchError` at entry — BEFORE attempting the switch. The user sees a hard
 * error instead of the MetaMask prompt. Sending the request directly to the provider sidesteps
 * wagmi's invariant check; the wallet's subsequent `chainChanged` event lets wagmi self-correct.
 *
 * After the switch we poll the connector until its live `getChainId()` matches the target, so
 * downstream wagmi calls (`signMessage`, `writeContract`) don't immediately re-throw on a
 * still-stale wagmi cache. The poll is bounded; if it times out we still return and let the
 * downstream call decide whether to fail.
 */
export async function ensureChain(targetChainId: number): Promise<void> {
  const account = getAccount(wagmiConfig)
  if (!account.isConnected || !account.connector) {
    throw new Error('No wallet connected — connect a wallet before submitting a transaction.')
  }
  const connector = account.connector

  const liveChainId = await connector.getChainId()
  if (liveChainId === targetChainId) return

  const provider = asEip1193(await connector.getProvider())
  if (!provider) {
    throw new Error(
      `Could not switch to ${chainLabel(targetChainId)}: connector did not expose an EIP-1193 provider.`,
    )
  }

  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: toHexChainId(targetChainId) }],
    })
  } catch (err) {
    if (isUserRejection(err)) {
      throw new Error(
        `Network switch declined. Approve the switch to ${chainLabel(targetChainId)} in your wallet and try again.`,
      )
    }
    if (isChainNotAdded(err)) {
      throw new Error(
        `${chainLabel(targetChainId)} isn't configured in your wallet. Add the network and try again.`,
      )
    }
    const msg = err instanceof Error ? err.message : 'unknown error'
    throw new Error(`Could not switch to ${chainLabel(targetChainId)}: ${msg}`)
  }

  // Wait for the connector's live chainId to acknowledge the switch. wagmi listens for the
  // wallet's `chainChanged` event and updates its cache; downstream actions check that cache.
  // Polling against the connector tracks the same source of truth wagmi relies on, so once we
  // see it match the target the next wagmi call is safe.
  await waitForConnectorChainId(targetChainId, connector)
}

/**
 * Poll `connector.getChainId()` until it matches `targetChainId` or the timeout expires. Resolves
 * either way — if the connector hasn't acknowledged within the window we still return, letting
 * the downstream wagmi action surface its own error. This is intentional: blocking forever on a
 * pathological wallet would be worse UX than a clear "current chain" error from the next call.
 */
async function waitForConnectorChainId(
  targetChainId: number,
  connector: NonNullable<ReturnType<typeof getAccount>['connector']>,
): Promise<void> {
  const deadline = Date.now() + POST_SWITCH_SETTLE_TIMEOUT_MS
  while (Date.now() < deadline) {
    try {
      const live = await connector.getChainId()
      if (live === targetChainId) return
    } catch {
      // Ignore transient errors — keep polling until the timeout.
    }
    await new Promise<void>(resolve => setTimeout(resolve, POST_SWITCH_POLL_INTERVAL_MS))
  }
}

// Internal — exported for tests only. Do not import from app code.
export { isUserRejection as _isUserRejection, isChainNotAdded as _isChainNotAdded }
