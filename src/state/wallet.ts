// ABOUTME: Jotai atoms for wallet state — EVM connection (mirrored from wagmi) + Railgun shielded wallet lock/unlock.
// ABOUTME: EVM state is sourced from wagmi hooks; this layer only mirrors what the UI needs broadly.

import { atom } from 'jotai'
import type { ShieldedWalletState } from '@/lib/railgun/wallet'

/** Truncated/raw EVM address of the connected wallet. null = not connected. */
export const evmAddressAtom = atom<string | null>(null)

/** Railgun shielded wallet — locked at startup, unlocked after passphrase entry. */
export const shieldedWalletAtom = atom<ShieldedWalletState>({ status: 'missing' })

/**
 * Unshielded USDC balance per chain id (raw 6-decimal units). Empty map until balances hook fetches.
 */
export const usdcBalancesAtom = atom<Record<number, bigint>>({})

/** Shielded USDC balance (raw 6-decimal units). null until the Railgun sync completes. */
export const shieldedUsdcAtom = atom<bigint | null>(null)

/** Shielded yield shares (raw 18-decimal units). null until sync. */
export const yieldSharesAtom = atom<bigint | null>(null)
