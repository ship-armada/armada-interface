// ABOUTME: Pure parse of a yield-withdraw (redeemAndShield) receipt → the actual redeemed gross USDC.
// ABOUTME: Reads the on-chain USDC transfer INTO the pool (reliable/final), guarded against mis-parse.

/** ERC-20 `Transfer(address,address,uint256)` topic0. */
export const ERC20_TRANSFER_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'

/** Minimal log shape for `redeemedGrossFromLogs` (matches both ethers + viem receipt logs). */
export interface TransferLog {
  address: string
  topics: ReadonlyArray<string>
  data: string
}

/**
 * The redeemed gross USDC from a `redeemAndShield` receipt = the sum of USDC `Transfer(_, to=pool)`
 * amounts (the broadcaster fee is a shielded note, not an ERC-20 transfer, so the inbound USDC to the
 * pool is the full gross). Sourced on-chain rather than from SDK history because a history read right
 * after completion can be pre-settlement (the redeemed USDC re-shield note isn't scanned yet, so the
 * SDK's `value` transiently reflects only the shares-spend and reads NEGATIVE); the receipt is final
 * once mined.
 *
 * Plausibility-guarded so a mis-parse can never be persisted: the gross must be positive, cover the
 * fee, and sit within ±25% of the typed `estimate` (rate slippage between submit and execution is
 * minuscule). Returns undefined to keep the estimate (a later rescan corrects it).
 */
export function redeemedGrossFromLogs(opts: {
  logs: ReadonlyArray<TransferLog>
  usdcAddress: string
  poolAddress: string
  fee: bigint
  estimate: bigint
}): bigint | undefined {
  const usdc = opts.usdcAddress.toLowerCase()
  const pool = opts.poolAddress.toLowerCase()
  let gross = 0n
  for (const log of opts.logs) {
    if (log.address.toLowerCase() !== usdc) continue
    if (log.topics[0] !== ERC20_TRANSFER_TOPIC || log.topics[2] === undefined) continue
    const to = `0x${log.topics[2].slice(26)}`.toLowerCase()
    if (to === pool) gross += BigInt(log.data)
  }
  if (gross <= 0n || gross < opts.fee) return undefined
  if (
    opts.estimate > 0n &&
    (gross < opts.estimate - opts.estimate / 4n || gross > opts.estimate + opts.estimate / 4n)
  ) {
    return undefined
  }
  return gross
}
