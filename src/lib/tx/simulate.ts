// ABOUTME: Pre-flight `eth_call` against a populated tx so on-chain reverts surface as typed
// ABOUTME: TxErrors with the actual revert reason — instead of cascading through MetaMask's
// ABOUTME: gas-estimation fallback into the opaque "gas limit too high" RPC error.

import { getPublicClient } from 'wagmi/actions'
import { BaseError } from 'viem'
import { wagmiConfig } from '@/config/wagmi'
import { asTxError } from './receipt'

export interface SimulateInput {
  to: `0x${string}`
  data: `0x${string}`
  value: bigint
  /** Source account — must match what the wallet will use, otherwise the simulation runs
   *  as if `msg.sender = 0x0` and may revert on unrelated `msg.sender`-gated paths. */
  account: `0x${string}`
  chainId: number
}

/**
 * Run an `eth_call` simulation of the tx and throw a typed `PRE_FLIGHT_REVERT` TxError on revert.
 *
 * Why this exists: when the on-chain simulation reverts, MetaMask catches the failure inside
 * its own `eth_estimateGas` call, surfaces "We're unable to provide an accurate fee", then
 * falls back to a hardcoded high gas limit (usually 30M). On submit, the RPC rejects with
 * "gas limit too high" — completely obscuring the underlying revert. Running the simulation
 * ourselves before going to MetaMask lets us surface the actual contract revert reason via
 * our existing typed-error pipeline AND avoid prompting the wallet at all.
 *
 * Resolves cleanly when the simulation succeeds; otherwise throws a branded TxError with
 * code `PRE_FLIGHT_REVERT` so the UI can render "nothing was sent" rather than the
 * post-mining "your tx failed on chain" copy that TX_REVERTED carries.
 */
export async function simulateOrThrow(input: SimulateInput): Promise<void> {
  const client = getPublicClient(wagmiConfig, { chainId: input.chainId })
  if (!client) {
    throw new Error(`simulateOrThrow: no wagmi public client for chain ${input.chainId}`)
  }
  try {
    await client.call({
      account: input.account,
      to: input.to,
      data: input.data,
      value: input.value,
    })
  } catch (err) {
    // viem wraps revert errors in a chain: CallExecutionError → ContractFunctionRevertedError
    // → (the decoded reason). `walk()` finds the innermost error matching a predicate; passing
    // no predicate just gives us the deepest BaseError. `shortMessage` is the human-readable
    // one-liner viem assembles for any BaseError (decoded revert reason when available, raw
    // selector or generic "execution reverted" otherwise). Falls back to `err.message` if
    // somehow we got a non-BaseError throw.
    const reason = extractRevertReason(err)
    throw asTxError({
      code: 'PRE_FLIGHT_REVERT',
      message: reason,
    })
  }
}

function extractRevertReason(err: unknown): string {
  if (err instanceof BaseError) {
    // walk() finds the innermost error; the deepest typically carries the most specific reason.
    const inner = err.walk()
    if (inner instanceof BaseError) {
      return inner.shortMessage
    }
    return err.shortMessage
  }
  if (err instanceof Error) return err.message
  return String(err)
}
