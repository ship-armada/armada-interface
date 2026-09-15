// ABOUTME: Codec for the opt-in tx self-metadata blob persisted in a spend's change-note memo
// ABOUTME: (armada-sdk #88 lever 3) — round-trips the bucket-C fields a chain scan can't recover.

/**
 * The subset of `TxRecord.meta` a chain scan cannot otherwise reconstruct (armada-sdk #88 lever 3):
 * the relayer quote id + the submission-mode flags. Persisted in the spend's self-owned change note
 * so `history()` recovers it on a fresh scan even after local storage is cleared. Kept intentionally
 * tiny — the blob costs calldata gas (~16 gas/byte) and a non-empty change memo is a faint
 * metadata-presence signal to on-chain observers.
 */
export interface RecoverableTxMeta {
  feeCacheId?: string
  useGasless?: boolean
  useWalletOverride?: boolean
}

// Wire form — short keys keep the on-chain blob compact; `v` versions the shape so a future format
// change can't be misread as an older blob. Flags are encoded as `1` (present) / omitted (absent).
interface WireV1 {
  v: 1
  c?: string
  g?: 1
  w?: 1
}

/**
 * Encode the recoverable fields into a compact blob, or `undefined` when nothing is worth persisting
 * — the caller then skips `prove({ selfMetadata })` so no change memo (and no gas / presence signal)
 * is written.
 */
export function encodeTxSelfMetadata(meta: RecoverableTxMeta): string | undefined {
  const wire: WireV1 = { v: 1 }
  if (meta.feeCacheId) wire.c = meta.feeCacheId
  if (meta.useGasless) wire.g = 1
  if (meta.useWalletOverride) wire.w = 1
  if (wire.c === undefined && wire.g === undefined && wire.w === undefined) return undefined
  return JSON.stringify(wire)
}

/** Decode a recovered blob back to the recoverable fields. Unknown / malformed / wrong-version input
 *  degrades to `{}` (recovery is best-effort — a bad blob must never break history mapping). */
export function decodeTxSelfMetadata(blob: string | undefined): RecoverableTxMeta {
  if (!blob) return {}
  try {
    const wire = JSON.parse(blob) as Partial<WireV1>
    if (wire.v !== 1) return {}
    return {
      ...(typeof wire.c === 'string' ? { feeCacheId: wire.c } : {}),
      ...(wire.g === 1 ? { useGasless: true } : {}),
      ...(wire.w === 1 ? { useWalletOverride: true } : {}),
    }
  } catch {
    return {}
  }
}
