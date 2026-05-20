// ABOUTME: EIP-712 enrollment typed-data builder + signature normalization, per specs/TX_SIGNING.md.
// ABOUTME: Chain-agnostic domain (no chainId, frozen verifyingContract). Signature normalized to 65 bytes r||s||v before any HKDF use.

import { hexToBytes, keccak256, toBytes } from 'viem'

/**
 * Phase 1 testnet `verifyingContract` value. Per the spec this is repurposed from EIP-712's
 * intended semantics ("address of the contract that will verify the signature") to "a
 * governance-frozen 20-byte protocol identity constant that wallets display during signing."
 *
 * Derived deterministically so anyone reading the code can re-compute and verify it isn't a typo:
 *   first_20_bytes(keccak256(utf8("armada-enrollment:testnet:v1")))
 *
 * Identity stability: changing this string forks every user's shielded identity. For testnet this
 * is fine (identity is disposable). Pre-mainnet a new constant will be chosen — testnet keys are
 * intentionally not interoperable with mainnet keys.
 */
export const VERIFYING_CONTRACT_SOURCE = 'armada-enrollment:testnet:v1'
export const VERIFYING_CONTRACT: `0x${string}` = (() => {
  const hash = keccak256(toBytes(VERIFYING_CONTRACT_SOURCE)) // 32-byte 0x-prefixed hex
  // Take the first 20 bytes (the leading 40 hex chars after the 0x).
  return `0x${hash.slice(2, 42)}` as `0x${string}`
})()

/**
 * The four identity-determining fields. Per spec §"Enrollment Flow", changing ANY of these after
 * launch permanently forks user identity with no migration path. Treat as immutable.
 */
export const DOMAIN_NAME = 'Armada Protocol'
export const MESSAGE_PURPOSE = 'Generate privacy keys (NOT a transaction)'
export const MESSAGE_VERSION = '1'

/**
 * The EIP-712 typed-data structure passed to `signTypedData_v4`.
 *
 * Note on the domain: `chainId` is deliberately omitted per spec, so the same wallet derives the
 * same root_secret on any chain. EIP-712 permits omitting domain fields; the EIP712Domain types
 * array MUST reflect only the fields actually present, or the domain hash diverges.
 *
 * Note on `issuedAt`: spec mandates millisecond precision + monotonic non-reuse to ensure payload
 * uniqueness even against deterministic-signing wallets (RFC 6979).
 */
export interface EnrollmentTypedData {
  readonly domain: {
    readonly name: string
    readonly verifyingContract: `0x${string}`
  }
  readonly types: {
    readonly EIP712Domain: ReadonlyArray<{ readonly name: string; readonly type: string }>
    readonly Enrollment: ReadonlyArray<{ readonly name: string; readonly type: string }>
  }
  readonly primaryType: 'Enrollment'
  readonly message: {
    readonly purpose: string
    readonly issuedAt: string // uint256 as decimal string (ms)
    readonly version: string
  }
}

export function buildEnrollmentTypedData(issuedAtMs: number): EnrollmentTypedData {
  if (!Number.isFinite(issuedAtMs) || issuedAtMs <= 0 || !Number.isInteger(issuedAtMs)) {
    throw new Error('issuedAtMs must be a positive integer (Unix epoch ms)')
  }
  return {
    domain: {
      name: DOMAIN_NAME,
      verifyingContract: VERIFYING_CONTRACT,
    },
    types: {
      // EIP712Domain MUST list only the fields actually present in `domain`.
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'verifyingContract', type: 'address' },
      ],
      Enrollment: [
        { name: 'purpose', type: 'string' },
        { name: 'issuedAt', type: 'uint256' },
        { name: 'version', type: 'string' },
      ],
    },
    primaryType: 'Enrollment',
    message: {
      purpose: MESSAGE_PURPOSE,
      issuedAt: String(issuedAtMs),
      version: MESSAGE_VERSION,
    },
  }
}

/**
 * Normalize a wallet's signature response to exactly 65 bytes in r(32) || s(32) || v(1) order,
 * with `v` in the canonical EIP-155 form (27 or 28).
 *
 * Per spec §"Enrollment Flow" step 3 (NORMATIVE):
 *  - If v is returned as 0/1, add 27.
 *  - EIP-2098 compact signatures (64 bytes, recovery bit packed into s's high bit) must be
 *    expanded to the canonical 65-byte form.
 *  - The normalized 65 bytes are the exact HKDF IKM input — no further parsing or reordering.
 *
 * Accepts either a 0x-prefixed hex string or a Uint8Array.
 */
export function normalizeSignature(sig: string | Uint8Array): Uint8Array {
  const bytes =
    typeof sig === 'string'
      ? hexToBytes(sig.startsWith('0x') || sig.startsWith('0X') ? (sig as `0x${string}`) : (`0x${sig}` as `0x${string}`))
      : sig
  if (!(bytes instanceof Uint8Array)) {
    throw new Error('normalizeSignature: input must be a hex string or Uint8Array')
  }

  if (bytes.length === 65) {
    const out = new Uint8Array(65)
    out.set(bytes)
    const v = out[64]!
    if (v === 0 || v === 1) out[64] = v + 27
    else if (v === 27 || v === 28) {
      // already canonical
    } else if (v === undefined) {
      throw new Error('normalizeSignature: missing v byte')
    } else {
      // Some EIP-155 wallets return v = 27 + (chainId * 2) + recoveryBit; we don't accept those
      // here because the chain-agnostic enrollment domain has no chainId baked in, and the
      // wallet should produce v ∈ {0, 1, 27, 28} for our typed-data shape.
      throw new Error(`normalizeSignature: unexpected v value ${v}`)
    }
    return out
  }

  if (bytes.length === 64) {
    // EIP-2098 compact signature: r (32) || yParityAndS (32), where the top bit of s encodes
    // the recovery bit (yParity = (s_high_bit ? 1 : 0)) and s is the low 255 bits.
    const r = bytes.slice(0, 32)
    const ys = bytes.slice(32, 64)
    const yParity = (ys[0]! & 0x80) !== 0 ? 1 : 0
    const s = new Uint8Array(ys)
    s[0] = s[0]! & 0x7f
    const out = new Uint8Array(65)
    out.set(r, 0)
    out.set(s, 32)
    out[64] = yParity + 27
    return out
  }

  throw new Error(`normalizeSignature: expected 64 or 65 byte input, got ${bytes.length}`)
}

