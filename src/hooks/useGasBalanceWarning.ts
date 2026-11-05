// ABOUTME: Warns when the connected EVM wallet holds less native token than the direct shield's estimated gas (4F) on
// ABOUTME: the signing chain — or, while there's no estimate yet, less than a small fixed floor.

import { useAccount, useBalance } from 'wagmi'
import { formatEther } from 'viem'

/** ~0.0005 ETH — the floor used until a gas estimate is known. */
const MIN_NATIVE_WEI = 500_000_000_000_000n

export interface GasBalanceWarning {
  show: boolean
  nativeSymbol: string
  formattedBalance: string | null
  /** The gas the check compared against (the estimate, else the floor), formatted; null while unknown. */
  formattedNeeded: string | null
}

/** `requiredWei` = the estimated gas for the tx the user will sign (`useNativeGasEstimate`); null until known. */
export function useGasBalanceWarning(gasChainId: number, requiredWei: bigint | null = null): GasBalanceWarning {
  const { address, isConnected } = useAccount()
  const { data } = useBalance({
    chainId: gasChainId,
    address,
    query: { enabled: isConnected && Boolean(address) },
  })

  if (!isConnected || !address || data === undefined) {
    return { show: false, nativeSymbol: 'ETH', formattedBalance: null, formattedNeeded: null }
  }

  const needed = requiredWei ?? MIN_NATIVE_WEI
  return {
    show: data.value < needed,
    nativeSymbol: data.symbol,
    formattedBalance: formatEther(data.value),
    formattedNeeded: formatEther(needed),
  }
}
