// ABOUTME: Railgun wallet lifecycle — generate mnemonic, encrypt at rest, unlock for a session.
// ABOUTME: Stub: signatures only. Implementation lands with the Railgun integration pass; never log mnemonics or keys.

export interface ShieldedWalletState {
  /** Stable internal identifier — even with one wallet in v1, the schema is plural-ready. */
  id: string
  status: 'locked' | 'unlocked' | 'missing'
  /** 0zk… address. Present only when unlocked. */
  railgunAddress?: string
  /** Last unlock timestamp, used for inactivity timeout. */
  unlockedAt?: number
}

/** First-run only: generate a BIP39 mnemonic and encrypt with passphrase-derived key. */
export async function createWallet(_passphrase: string): Promise<{ id: string; mnemonic: string; railgunAddress: string }> {
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
