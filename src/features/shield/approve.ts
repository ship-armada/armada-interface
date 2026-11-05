// ABOUTME: ensureExactAllowance — the direct shield path's USDC approval, shared by `shield` and `shield-xchain`: skipped
// ABOUTME: when the allowance covers the amount; else approve exactly the amount, wait for it, and re-check before shielding.

import { readContract, writeContract } from 'wagmi/actions'
import { erc20Abi } from 'viem'
import { wagmiConfig } from '@/config/wagmi'
import { advance, markWaiting, patchArtifacts } from '@/lib/tx/reducer'
import { asTxError, waitForReceiptOrFail } from '@/lib/tx/receipt'
import type { TxRecord } from '@/lib/tx/types'

type ShieldKind = 'shield' | 'shield-xchain'

export interface EnsureExactAllowanceArgs<K extends ShieldKind> {
  record: TxRecord<K>
  ctx: { signal: AbortSignal; upsert: (record: TxRecord<K>) => Promise<void> }
  /** The USDC the shield pulls, on the source chain. */
  token: `0x${string}`
  /** The contract that pulls it: the PrivacyPool (shield), the PrivacyPoolClient (cross-chain shield). */
  spender: `0x${string}`
  owner: `0x${string}`
  chainId: number
}

/**
 * Approves exactly `record.meta.amount` — never an unlimited allowance, so nothing is left approved for later — and
 * records the leg for the wallet-step checklist (`approveSkipped` / `approveTxHash`), marking the record `waiting` while
 * the wallet prompt is open. A wallet lets the user lower the spend cap in the prompt, so the allowance is read again once
 * the approval confirms: if it's still short, the shield would revert, so this stops first with a typed
 * PRE_FLIGHT_REVERT (the shield itself was never sent). Returns the record to continue from.
 */
export async function ensureExactAllowance<K extends ShieldKind>({
  record,
  ctx,
  token,
  spender,
  owner,
  chainId,
}: EnsureExactAllowanceArgs<K>): Promise<TxRecord<K>> {
  const amount = record.meta.amount
  const readAllowance = () =>
    readContract(wagmiConfig, { address: token, abi: erc20Abi, functionName: 'allowance', args: [owner, spender], chainId })

  const allowance = await readAllowance()
  if (ctx.signal.aborted) throw new Error('cancelled')
  if (allowance >= amount) {
    // No approve prompt — recorded as skipped so the wallet-step list omits the Approve row.
    const skipped = patchArtifacts(record, { approveSkipped: true } as Partial<TxRecord<K>['artifacts']>)
    await ctx.upsert(skipped)
    return skipped
  }

  let working = markWaiting(record)
  await ctx.upsert(working)
  const approveHash = await writeContract(wagmiConfig, {
    address: token,
    abi: erc20Abi,
    functionName: 'approve',
    args: [spender, amount],
    chainId,
  })
  await waitForReceiptOrFail({ hash: approveHash, signal: ctx.signal, chainId })
  if (ctx.signal.aborted) throw new Error('cancelled')

  if ((await readAllowance()) < amount) {
    throw asTxError({
      code: 'PRE_FLIGHT_REVERT',
      message: 'The approval in your wallet was less than the shield amount, so nothing was shielded. Try again and approve the full amount.',
    })
  }
  // Approve confirmed → back to active, record the leg.
  working = advance(working, record.stage, { approveTxHash: approveHash } as Partial<TxRecord<K>['artifacts']>)
  await ctx.upsert(working)
  return working
}
