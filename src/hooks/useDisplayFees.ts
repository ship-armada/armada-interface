// ABOUTME: Resolves DisplayFees for action modals — on-chain shield protocol fee + native gas estimate.

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useReadContract } from 'wagmi'
import { getIntegratorAddress, getNetworkConfig } from '@/config/network'
import { loadFeeModuleAddress } from '@/config/deployments'
import { feeModuleAbi } from '@/lib/fees/feeModuleAbi'
import {
  computeDisplayFees,
  type DisplayFees,
} from '@/lib/fees/displayFees'
import type { FeeSchedule } from '@/lib/relayer'
import type { TxKind } from '@/lib/tx/types'
import { useNativeGasEstimate } from './useNativeGasEstimate'
import { useDebouncedValue } from './useDebouncedValue'

const FEE_MODULE_QUERY_KEY = ['fee-module-address'] as const

/**
 * Debounce window for the on-chain shield-fee read. The ShieldModal calls this hook on every
 * keystroke of the amount field; without debouncing, each keystroke fired a `calculateShieldFee`
 * `eth_call`. A 400ms trailing window collapses a typing burst into one read once the amount
 * settles, while the local 50 bps fallback covers the Fee row in the interim. (P2 perf)
 */
const SHIELD_FEE_DEBOUNCE_MS = 400

export function useDisplayFees(
  kind: TxKind,
  amount: bigint,
  gasChainId: number,
  quote: FeeSchedule | null,
  /**
   * Base the protocol shield fee is charged on, when it differs from `amount`. A gasless shield
   * carves the relayer fee out first as its own shielded note, so the pool takes the 50 bps fee on
   * `(amount - relayerFee)`, not the full deposit — passing that reduced base here keeps both the
   * on-chain `calculateShieldFee` read and the fallback aligned with the note that actually lands.
   * Defaults to `amount` (direct shield: no relayer fee carved out).
   */
  shieldFeeBase?: bigint,
): { fees: DisplayFees; isLoading: boolean } {
  const hubChainId = getNetworkConfig().hub.chainId
  const integrator = getIntegratorAddress()
  const feeBase = shieldFeeBase ?? amount

  const { data: feeModuleAddress } = useQuery({
    queryKey: FEE_MODULE_QUERY_KEY,
    queryFn: loadFeeModuleAddress,
    staleTime: Infinity,
  })

  // The hub `PrivacyPool.shield()` path runs `_transferTokenIn` which always calls
  // `IArmadaFeeModule.calculateShieldFee` regardless of how the USDC reached hub — so the same
  // 50 bps armadaTake applies whether the user deposited directly on hub (`shield`) or arrived
  // via CCTP from a client chain (`shield-xchain`). The on-chain read must cover both kinds;
  // gating on `shield` alone made the cross-chain Fee row miss the protocol component and
  // surface only the much-smaller CCTP fast-fee ("<0.01 USDC" on a $10 client deposit).
  const isShieldKind = kind === 'shield' || kind === 'shield-xchain'
  // Debounce the amount the on-chain read keys off so a typing burst fires one eth_call, not one
  // per keystroke. The displayed Fee row still tracks the live amount via the 50 bps fallback below
  // until the debounced read for the settled amount resolves.
  const debouncedBase = useDebouncedValue(feeBase, SHIELD_FEE_DEBOUNCE_MS)
  const needsOnChainShieldFee = isShieldKind && debouncedBase > 0n && Boolean(feeModuleAddress)

  const { data: shieldFeeResult, isLoading: shieldFeeLoading } = useReadContract({
    address: feeModuleAddress ?? undefined,
    abi: feeModuleAbi,
    functionName: 'calculateShieldFee',
    args: [integrator, debouncedBase],
    chainId: hubChainId,
    query: { enabled: needsOnChainShieldFee },
  })

  const nativeGas = useNativeGasEstimate(gasChainId, kind)

  const fees = useMemo(() => {
    const base = computeDisplayFees(kind, amount, quote)
    let protocolFee = base.protocolFee
    // Only trust the on-chain result when it was computed for the base currently displayed — while
    // the user is mid-keystroke the debounced read lags the live base, so we fall back to the 50 bps
    // estimate rather than show a fee for a stale base.
    const onChainMatchesLive = debouncedBase === feeBase
    if (isShieldKind && shieldFeeResult && onChainMatchesLive) {
      protocolFee = shieldFeeResult[2]
    } else if (isShieldKind && feeModuleAddress && feeBase > 0n) {
      // Fallback while the on-chain read is loading or the base is still settling: ~50 bps matches
      // deployed fee module `baseArmadaTakeBps` so the Fee row doesn't flash a misleading lower
      // value during the async window before the wagmi result lands.
      protocolFee = (feeBase * 50n) / 10_000n
    }
    const feeInclusive =
      kind === 'shield' || kind === 'shield-xchain' || kind === 'unshield-xchain'
    return {
      protocolFee,
      gasFee: 0n,
      nativeGas,
      totalFee: protocolFee,
      feeInclusive,
    }
  }, [kind, amount, feeBase, debouncedBase, quote, shieldFeeResult, feeModuleAddress, isShieldKind, nativeGas])

  const isLoading = needsOnChainShieldFee && shieldFeeLoading

  return { fees, isLoading }
}

/** Net USDC credited after inclusive protocol fees (deposit / CCTP). */
export function netAmountAfterFees(amount: bigint, fees: DisplayFees): bigint {
  return amount > fees.protocolFee ? amount - fees.protocolFee : 0n
}

/** Max amount the user can enter in the amount field. */
export function maxSpendableAmount(balance: bigint, fees: DisplayFees): bigint {
  if (fees.feeInclusive) return balance
  return balance > fees.totalFee ? balance - fees.totalFee : 0n
}
