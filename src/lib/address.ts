// ABOUTME: Address-format helpers — pure validators for EVM (0x…) and shielded (0zk…) recipient strings.
// ABOUTME: No React, no ethers/Railgun SDK dependency. Used by RecipientInput consumers and the unshield/send modal validators.

/**
 * Validate an EVM address shape. Checks the 0x-prefix + 40 hex characters; does NOT verify EIP-55 checksum
 * since most users paste raw-lowercase addresses. Whitespace is trimmed before checking.
 */
export function isEvmAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value.trim())
}

/**
 * Validate a Railgun shielded-address shape. Starts with "0zk" and is followed by ≥32 alphanumeric
 * characters. This is a heuristic — the real Railgun address is a structured base32-ish string;
 * sufficient for UI validation today, sharpened when the Railgun SDK lands.
 */
export function isShieldedAddress(value: string): boolean {
  return /^0zk[a-zA-Z0-9]{32,}$/.test(value.trim())
}
