// ABOUTME: The reference fee fixture from specs/TX_VALUES.md — distinct, non-zero values so a dropped, doubled or
// ABOUTME: gross/net-confused fee changes a displayed figure — plus builders for a record of any kind.

import type { TxKind, TxRecord } from '@/lib/tx/types'

/** The amount typed (10 USDC). */
export const A = 10_000_000n
/** The relayer's per-proof fee. */
export const F = 1_000_003n
/** The pool's protocol shield fee. */
export const P = 20_011n
/** The CCTP fast-fee estimate. */
export const C = 300_007n
/** Circle's actual CCTP fee (`feeExecuted`). */
export const C_ACTUAL = 150_001n
/** Change folded into the fee on a fold-in spend. */
export const FOLD = 123_457n
/** A vault withdrawal's actual redeemed gross (the typed 10 at rate 1.05, share count floored). */
export const G = 9_999_999n

/** A settled record of `kind` carrying `meta`; `overrides` replace any other field. */
export function txRecord<K extends TxKind>(
  kind: K,
  meta: object,
  overrides: Partial<TxRecord> = {},
): TxRecord<K> {
  return {
    id: `rec-${kind}`,
    kind,
    stage: 'hub-confirmed',
    stagesCompleted: [],
    executionState: 'completed',
    updatedSeq: 0,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_050_000,
    walletContext: { evmAddress: undefined, shieldedWalletId: 'w', sourceChainId: 31337 },
    meta: { feeCacheId: 'x', ...meta },
    artifacts: {},
    ...overrides,
  } as unknown as TxRecord<K>
}
