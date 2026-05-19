// ABOUTME: Railgun wallet lifecycle — generate mnemonic, encrypt at rest, unlock for a session.
// ABOUTME: Encryption/unlock are stubbed (lands with the Railgun integration pass); mnemonic generation is real ethers BIP39 so the onboarding UI can show the user their phrase.

import { generateMnemonic as scureGenerateMnemonic } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english'

export interface ShieldedWalletState {
  /** Stable internal identifier — even with one wallet in v1, the schema is plural-ready. */
  id: string
  status: 'locked' | 'unlocked' | 'missing'
  /** 0zk… address. Present only when unlocked. */
  railgunAddress?: string
  /** Last unlock timestamp, used for inactivity timeout. */
  unlockedAt?: number
}

/**
 * Generate a fresh BIP39 12-word mnemonic.
 *
 * Uses 128 bits of entropy (16 bytes) → 12 words. Pure / no IO. Never log the return value;
 * see lib/railgun/CLAUDE.md secret-handling rules. The onboarding UI shows this to the user
 * exactly once for backup, then passes it to `createWallet(mnemonic, passphrase)` for
 * encryption + persistence. After that the plaintext mnemonic should not be retained.
 */
export function generateMnemonic(): string {
  // @scure/bip39 is the audited pure-JS BIP39 library that ethers itself wraps;
  // we use it directly to avoid an ethers v6 internal where crypto.createHash
  // returns a Node Buffer that fails its own BytesLike check in Node ≥18.
  // 128-bit strength → 12 words.
  return scureGenerateMnemonic(wordlist, 128)
}

/**
 * First-run only: encrypt the given mnemonic with passphrase-derived key and persist.
 * Takes the mnemonic as input (rather than generating it internally) so the onboarding
 * flow can show the user their phrase + confirm a subset of words BEFORE encryption.
 */
export async function createWallet(_mnemonic: string, _passphrase: string): Promise<{ id: string; railgunAddress: string }> {
  throw new Error('railgun.wallet.createWallet: not implemented (scaffold).')
}

/** Subsequent loads: prompt for passphrase, decrypt key material, hold in memory for the session.
 *  `id` selects which stored wallet to unlock; v1 will pass the single existing id. */
export async function unlockWallet(_id: string, _passphrase: string): Promise<ShieldedWalletState> {
  throw new Error('railgun.wallet.unlockWallet: not implemented (scaffold).')
}

/** Drop in-memory keys for the given wallet (does NOT delete the encrypted blob). */
export function lockWallet(_id: string): void {
  // no-op stub
}

/** Settings → Reset wallet: irreversibly delete the encrypted blob + all derived state for one wallet. */
export async function resetWallet(_id: string): Promise<void> {
  throw new Error('railgun.wallet.resetWallet: not implemented (scaffold).')
}
