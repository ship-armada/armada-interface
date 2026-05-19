// ABOUTME: Jotai atoms for wallet state — EVM connection (mirrored from wagmi) + plural Railgun shielded wallets + Railgun engine warmup.
// ABOUTME: EVM state sourced from wagmi hooks. Plural-wallet schema is future-proofing per reviewer #5; v1 only ever populates one entry.

import { atom } from 'jotai'
import type { ShieldedWalletState } from '@/lib/railgun/wallet'

/** Truncated/raw EVM address of the connected wallet. null = not connected. */
export const evmAddressAtom = atom<string | null>(null)

/** Plural shielded wallets, keyed by railgunWalletId. Schema is plural even in v1 (one entry). */
export const shieldedWalletsAtom = atom<Record<string, ShieldedWalletState>>({})

/** Which entry in `shieldedWalletsAtom` is currently active. Null when no wallet exists or none selected. */
export const activeRailgunWalletIdAtom = atom<string | null>(null)

/** Derived: the active wallet's state, or null. UI mostly reads this; write paths use the two source atoms above. */
export const activeShieldedWalletAtom = atom<ShieldedWalletState | null>((get) => {
  const id = get(activeRailgunWalletIdAtom)
  if (!id) return null
  return get(shieldedWalletsAtom)[id] ?? null
})

/**
 * Legacy alias retained until Bundle 2 consumers fully migrate to `activeShieldedWalletAtom`.
 * For now, returns a thin compat shape ({ status: 'missing' } when no wallet, else the active one).
 */
export const shieldedWalletAtom = atom<{ status: 'locked' | 'unlocked' | 'missing'; railgunAddress?: string }>((get) => {
  const active = get(activeShieldedWalletAtom)
  if (!active) return { status: 'missing' }
  return { status: active.status, railgunAddress: active.railgunAddress }
})

/** Railgun proving engine state. Used by the UI to indicate "warming up…" before first-tx readiness. */
export type RailgunEngineState = 'cold' | 'warming' | 'ready' | 'failed'

export const railgunEngineAtom = atom<{ state: RailgunEngineState; error?: string }>({ state: 'cold' })

/**
 * Unshielded USDC balance per chain id (raw 6-decimal units). Empty map until balances hook fetches.
 */
export const usdcBalancesAtom = atom<Record<number, bigint>>({})

/** Shielded USDC balance (raw 6-decimal units). null until the Railgun sync completes. */
export const shieldedUsdcAtom = atom<bigint | null>(null)

/** Shielded yield shares (raw 18-decimal units). null until sync. */
export const yieldSharesAtom = atom<bigint | null>(null)
