// ABOUTME: Resolves DisplayFees for action modals — on-chain shield protocol fee + native gas estimate.

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useReadContract } from 'wagmi'
import { getIntegratorAddress, getNetworkConfig } from '@/config/network'
import { loadFeeModuleAddress } from '@/config/deployments'
import { feeModuleAbi } from '@/lib/fees/feeModuleAbi'
import {
  computeDisplayFees,
  resolveShieldProtocolFee,
  type DisplayFees,
  type ShieldProtocolFeeStatus,
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
 * settles; in the interim the fee is `pending` and the flow reads "Estimating fees…". (P2 perf)
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
  /**
   * The integrator the shield will carry — the fee module prices by it. Defaults to the configured integrator; a
   * gasless or cross-chain shield carries none (`shieldFeeIntegrator`).
   */
  integrator: string = getIntegratorAddress(),
): { fees: DisplayFees; isLoading: boolean; protocolFeeStatus: ShieldProtocolFeeStatus } {
  const hubChainId = getNetworkConfig().hub.chainId
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
  // per keystroke. Until the debounced read for the settled amount resolves, the fee is `pending`.
  const debouncedBase = useDebouncedValue(feeBase, SHIELD_FEE_DEBOUNCE_MS)
  const needsOnChainShieldFee = isShieldKind && debouncedBase > 0n && Boolean(feeModuleAddress)

  const { data: shieldFeeResult, isLoading: shieldFeeLoading, isError: shieldFeeReadFailed } = useReadContract({
    address: feeModuleAddress ?? undefined,
    abi: feeModuleAbi,
    functionName: 'calculateShieldFee',
    args: [integrator as `0x${string}`, debouncedBase],
    chainId: hubChainId,
    query: { enabled: needsOnChainShieldFee },
  })

  const nativeGas = useNativeGasEstimate(gasChainId, kind)

  // Only trust the on-chain result when it was computed for the base currently displayed — while the user is
  // mid-keystroke the debounced read lags the live base. Until it lands the fee is `pending` (no fee to show or submit
  // against); when the fee module can't be read at all (no manifest, or the read failed) it's the ~50 bps `estimate`,
  // marked as one — never 0 (spec G-4, G-5).
  const shieldProtocol = isShieldKind
    ? resolveShieldProtocolFee({
        feeBase,
        onChain: shieldFeeResult?.[2],
        onChainMatchesLive: debouncedBase === feeBase,
        feeModule: feeModuleAddress === undefined ? 'loading' : feeModuleAddress === null || shieldFeeReadFailed ? 'unavailable' : 'available',
      })
    : null

  const fees = useMemo(() => {
    const base = computeDisplayFees(kind, amount, quote)
    const protocolFee = shieldProtocol?.protocolFee ?? base.protocolFee
    const feeInclusive =
      kind === 'shield' || kind === 'shield-xchain' || kind === 'unshield-xchain'
    return {
      protocolFee,
      gasFee: 0n,
      nativeGas,
      totalFee: protocolFee,
      feeInclusive,
    }
  }, [kind, amount, quote, shieldProtocol?.protocolFee, nativeGas])

  const isLoading = needsOnChainShieldFee && shieldFeeLoading

  return { fees, isLoading, protocolFeeStatus: shieldProtocol?.status ?? 'exact' }
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
