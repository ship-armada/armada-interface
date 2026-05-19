// ABOUTME: Shield request builder — derives shieldPrivateKey + constructs ShieldNoteERC20 via the Railgun engine (Poseidon NPK + ECIES bundle).
// ABOUTME: Pure SDK-side logic; the contract call lives in features/shield/handler.ts. Dynamic imports avoid jsdom's circomlibjs crash.

import { keccak256 } from 'viem'

// `@railgun-community/engine` ships circomlibjs at module-load and crashes under jsdom; defer.
type RailgunEngine = typeof import('@railgun-community/engine')
async function railgunEngine(): Promise<RailgunEngine> {
  return import('@railgun-community/engine')
}

/**
 * Canonical message the user signs to derive a per-session shield private key. Same string the
 * Railgun SDK uses everywhere — must match exactly so signatures are portable across wallets +
 * tools that consume the same convention.
 */
export const SHIELD_SIGNATURE_MESSAGE = 'RAILGUN_SHIELD'

/**
 * `shieldPrivateKey` is a 32-byte secret used inside the engine's ECIES + Poseidon machinery
 * when constructing a shield note. It MUST be derived deterministically from the user's wallet
 * signature so the same EVM identity always produces compatible shield requests.
 *
 * Returns a 64-char lowercase hex string (no `0x` prefix) — the SDK consumes it that way.
 */
export function deriveShieldPrivateKey(signatureHex: string): string {
  // viem's keccak256 accepts a `0x`-prefixed hex string and decodes-then-hashes the bytes.
  // (Using toBytes() first would UTF-8-encode the hex chars instead — wrong domain entirely.)
  const normalized = signatureHex.startsWith('0x') ? signatureHex : `0x${signatureHex}`
  const hash = keccak256(normalized as `0x${string}`)
  return hash.slice(2) // strip the 0x for SDK compat
}

/**
 * Output shape ready to feed into PrivacyPool.shield()'s ShieldRequest tuple.
 *
 *   preimage   = { npk, token: { tokenType, tokenAddress, tokenSubID }, value }
 *   ciphertext = { encryptedBundle: bytes32[3], shieldKey: bytes32 }
 *
 * We hand back the inner fields separately so the handler can compose the tuple verbatim
 * (matching the on-chain `ShieldRequest` ABI without re-introducing engine types at the call
 * site). All bytes32 fields are 0x-prefixed.
 */
export interface ShieldRequestData {
  readonly npk: `0x${string}`
  readonly value: bigint
  readonly encryptedBundle: readonly [`0x${string}`, `0x${string}`, `0x${string}`]
  readonly shieldKey: `0x${string}`
}

function toBytes32Hex(input: string | bigint): `0x${string}` {
  const hex = typeof input === 'bigint'
    ? input.toString(16)
    : input.startsWith('0x') ? input.slice(2) : input
  if (hex.length > 64) throw new Error(`toBytes32Hex: value too long (${hex.length} hex chars)`)
  return `0x${hex.padStart(64, '0')}` as `0x${string}`
}

/**
 * Build a single ShieldRequest for the given recipient + amount on the hub chain.
 *
 * The engine's `ShieldNoteERC20` owns the cryptographic machinery (Poseidon NPK over the random,
 * ECIES-encrypted bundle of the random + viewing keys). We just feed inputs and re-format the
 * outputs to bytes32-hex.
 *
 * NOTE: only the hub-side direct shield is supported today. Cross-chain shield (PrivacyPoolClient
 * → CCTP → hub) will get its own variant in a later commit; the engine call is the same but the
 * contract surface differs.
 */
export async function createShieldRequest(
  railgunAddress: string,
  amount: bigint,
  tokenAddress: string,
  shieldPrivateKeyHex: string,
): Promise<ShieldRequestData> {
  if (!railgunAddress.startsWith('0zk')) {
    throw new Error('createShieldRequest: railgunAddress must start with 0zk')
  }
  if (amount <= 0n) {
    throw new Error('createShieldRequest: amount must be positive')
  }
  if (!/^[0-9a-fA-F]{64}$/.test(shieldPrivateKeyHex)) {
    throw new Error('createShieldRequest: shieldPrivateKey must be 64 hex chars (no 0x)')
  }

  const { RailgunEngine, ShieldNoteERC20, ByteUtils } = await railgunEngine()
  const { masterPublicKey, viewingPublicKey } = RailgunEngine.decodeAddress(railgunAddress)

  // 16 random bytes — the per-note salt the engine binds into NPK + ciphertext.
  const random = ByteUtils.randomHex(16)
  const shieldNote = new ShieldNoteERC20(masterPublicKey, random, amount, tokenAddress)

  const shieldRequest = await shieldNote.serialize(
    ByteUtils.hexToBytes(shieldPrivateKeyHex),
    viewingPublicKey,
  )

  // The engine returns these as BigNumberish-ish strings; normalize to bytes32 hex.
  return {
    npk: toBytes32Hex(shieldRequest.preimage.npk.toString()),
    value: BigInt(shieldRequest.preimage.value.toString()),
    encryptedBundle: [
      toBytes32Hex(shieldRequest.ciphertext.encryptedBundle[0].toString()),
      toBytes32Hex(shieldRequest.ciphertext.encryptedBundle[1].toString()),
      toBytes32Hex(shieldRequest.ciphertext.encryptedBundle[2].toString()),
    ] as const,
    shieldKey: toBytes32Hex(shieldRequest.ciphertext.shieldKey.toString()),
  }
}
