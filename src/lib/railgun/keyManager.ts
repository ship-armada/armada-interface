// ABOUTME: Module-scope private state for the unlocked wallet — root_secret, walletId, sdkEncryptionKey, railgunAddress, checksum.
// ABOUTME: Never exposed to React state, atoms, or localStorage. Cleared on lock; best-effort fill(0) on the root_secret buffer.

import { antiPhishChecksumBytes, formatChecksumDisplay } from '@/lib/crypto/kdf'

interface UnlockedState {
  /** 32-byte root_secret. Kept here so re-derivation isn't needed on each tx. */
  rootSecret: Uint8Array
  /** Cached walletId for fast SDK calls. Persisted via localStorage separately. */
  walletId: string
  /** 64-hex SDK encryption key, derived from rootSecret. */
  sdkEncryptionKey: string
  /** Display-format anti-phish checksum ("a3f2 91c8 b7e0"). */
  checksum: string
  /** The 0zk… address returned by the SDK. */
  railgunAddress: string
}

let unlocked: UnlockedState | null = null

/**
 * Mark the wallet as unlocked. Takes ownership of the `rootSecret` buffer — callers should not
 * retain or reuse the passed Uint8Array after handing it over. `clear()` zeroizes it.
 */
export function setUnlocked(s: UnlockedState): void {
  if (s.rootSecret.length !== 32) {
    throw new Error('keyManager.setUnlocked: rootSecret must be 32 bytes')
  }
  unlocked = s
}

export function isUnlocked(): boolean {
  return unlocked !== null
}

/** Throws if locked. */
export function getRootSecret(): Uint8Array {
  if (!unlocked) throw new Error('keyManager: wallet is locked')
  return unlocked.rootSecret
}

export function getWalletId(): string {
  if (!unlocked) throw new Error('keyManager: wallet is locked')
  return unlocked.walletId
}

export function getSdkEncryptionKey(): string {
  if (!unlocked) throw new Error('keyManager: wallet is locked')
  return unlocked.sdkEncryptionKey
}

export function getRailgunAddress(): string {
  if (!unlocked) throw new Error('keyManager: wallet is locked')
  return unlocked.railgunAddress
}

export function getChecksum(): string {
  if (!unlocked) throw new Error('keyManager: wallet is locked')
  return unlocked.checksum
}

/**
 * Re-compute the checksum from the current rootSecret. Used by UI surfaces that need to compare
 * against a stored value (mismatch → possible compromise). Cheap (one SHA256).
 */
export function deriveChecksum(): string {
  if (!unlocked) throw new Error('keyManager: wallet is locked')
  return formatChecksumDisplay(antiPhishChecksumBytes(unlocked.rootSecret))
}

/**
 * Lock the wallet: zeroize the rootSecret buffer and drop all derived state. Best-effort —
 * JavaScript can't guarantee memory zeroing (see specs/TX_SIGNING.md §"Clear-After-Use") but
 * limiting the lifetime of the buffer + the unlocked struct meaningfully reduces leak surface.
 */
export function clear(): void {
  if (unlocked) {
    unlocked.rootSecret.fill(0)
  }
  unlocked = null
}
