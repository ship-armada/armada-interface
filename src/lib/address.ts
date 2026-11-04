// ABOUTME: Address-format helpers — validators for EVM (0x…) and shielded (0zk…) recipient strings, address extraction from pasted text, plus the counterparty
// ABOUTME: display split (fixed prefix + verifiable head/tail). No React. Uses ethers for EIP-55 checksum verification.

import { getAddress } from 'ethers'

const EVM_SHAPE = /^0x[a-fA-F0-9]{40}$/

/** Categorised EVM-address validation error. */
export type EvmAddressError = 'shape' | 'checksum'

export interface EvmAddressValidation {
  valid: boolean
  error?: EvmAddressError
}

/**
 * Validate an EVM address, including its EIP-55 checksum when one is present.
 *
 * Shape: `0x` + 40 hex. When the address is MIXED-case (contains both upper- and lower-case hex
 * letters) it carries an EIP-55 checksum, so we verify it via `ethers.getAddress()` and reject a
 * mismatch (`'checksum'`) — that catches a single mistyped or transposed character that a pure
 * shape check would wave through. All-lowercase / all-uppercase addresses carry no checksum (users
 * routinely paste raw-lowercase), so those are accepted on shape alone. Whitespace is trimmed.
 */
export function validateEvmAddress(value: string): EvmAddressValidation {
  const v = value.trim()
  if (!EVM_SHAPE.test(v)) return { valid: false, error: 'shape' }
  const hexLetters = v.slice(2).replace(/[^a-zA-Z]/g, '')
  const mixedCase = /[a-z]/.test(hexLetters) && /[A-Z]/.test(hexLetters)
  if (mixedCase) {
    try {
      getAddress(v)
    } catch {
      return { valid: false, error: 'checksum' }
    }
  }
  return { valid: true }
}

/** Boolean convenience over {@link validateEvmAddress} — true only when shape AND checksum pass. */
export function isEvmAddress(value: string): boolean {
  return validateEvmAddress(value).valid
}

/**
 * Fast shielded-address shape pre-filter. Starts with "0zk" followed by ≥32 alphanumeric
 * characters. Synchronous + cheap, suitable for per-keystroke gating. It does NOT verify the
 * bech32m checksum — use {@link validateShieldedAddressStrict} at the submit boundary to catch a
 * typo that this shape check would accept.
 */
export function isShieldedAddress(value: string): boolean {
  return /^0zk[a-zA-Z0-9]{32,}$/.test(value.trim())
}

/**
 * Strict shielded-address validation via `@armada/sdk`'s `decodeAddress` (bech32m checksum + `0zk`
 * prefix + address version — it throws on any of those failing). The sync `isShieldedAddress` regex
 * stays the per-keystroke fast path; call this once at the form-validation / submit boundary to
 * reject a 0zk recipient whose checksum doesn't validate (a transposed character that the shape
 * regex would otherwise wave funds through to).
 */
export async function validateShieldedAddressStrict(value: string): Promise<boolean> {
  const v = value.trim()
  // Fast pre-filter: avoid the decode path for obviously-malformed input.
  if (!isShieldedAddress(v)) return false
  const { decodeAddress } = await import('@armada/sdk')
  try {
    decodeAddress(v)
    return true
  } catch {
    return false
  }
}

/** A counterparty address split for display: the fixed `prefix`, then the `head` and `tail` a user verifies. */
export interface AddressDisplayParts {
  prefix: string
  head: string
  tail: string
}

const ZK_HEAD = 8
const ZK_TAIL = 6
const EVM_HEAD = 4
const EVM_TAIL = 4

/**
 * Split a recipient / sender address for display. A shielded address's "0zk1" (bech32m hrp + separator)
 * is the same for everyone, so it's the `prefix` and the verifiable part starts after it: 8 head + 6
 * tail characters. (Showing the first 6 + last 4 of the whole string left ~5 meaningful characters —
 * cheap for a lookalike address to match.) EVM addresses keep the familiar "0x" + 4 + 4. Returns null
 * for a string too short to shorten or of another shape, so callers render it as-is.
 */
export function splitAddressForDisplay(address: string): AddressDisplayParts | null {
  const v = address.trim()
  if (v.startsWith('0zk')) {
    const prefix = v.startsWith('0zk1') ? '0zk1' : '0zk'
    const body = v.slice(prefix.length)
    if (body.length <= ZK_HEAD + ZK_TAIL) return null
    return { prefix, head: body.slice(0, ZK_HEAD), tail: body.slice(-ZK_TAIL) }
  }
  if (v.startsWith('0x')) {
    const body = v.slice(2)
    if (body.length <= EVM_HEAD + EVM_TAIL) return null
    return { prefix: '0x', head: body.slice(0, EVM_HEAD), tail: body.slice(-EVM_TAIL) }
  }
  return null
}

/** Plain-text form of {@link splitAddressForDisplay} ("0zk1qyk9nn28...9wnce0"), for places that can't style the parts. */
export function shortAddress(address: string): string {
  const parts = splitAddressForDisplay(address)
  return parts ? `${parts.prefix}${parts.head}...${parts.tail}` : address
}

const EVM_IN_TEXT = /0x[a-fA-F0-9]{40}(?![a-fA-F0-9])/g
const ZK_IN_TEXT = /0zk[a-zA-Z0-9]{32,}/g

/**
 * Pull a recipient address out of pasted text — a bare address (trimmed), or the one address inside a message
 * ("pay me at 0x… thanks") or a payment URI ("ethereum:0x…@1"). Returns null when there's no valid address, or
 * when the text holds two DIFFERENT addresses (we don't guess which one the user meant). EVM candidates must pass
 * the EIP-55 checksum (when mixed-case); 0zk candidates the shape check, like typed input.
 */
export function extractAddress(text: string): string | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  if (isShieldedAddress(trimmed) || isEvmAddress(trimmed)) return trimmed
  const candidates = [...(trimmed.match(EVM_IN_TEXT) ?? []), ...(trimmed.match(ZK_IN_TEXT) ?? [])]
  const valid = new Set(candidates.filter((c) => isEvmAddress(c) || isShieldedAddress(c)))
  return valid.size === 1 ? [...valid][0] ?? null : null
}
