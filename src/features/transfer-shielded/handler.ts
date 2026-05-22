// ABOUTME: Transfer-shielded stage handler — 0zk → 0zk private send. Same shape as unshield-local; just different SDK fns + recipient kind.
// ABOUTME: build-proof → submit-relayer → hub-confirmed, all direct user-submitted via wagmi.

import {
  sendTransaction,
  waitForTransactionReceipt,
} from 'wagmi/actions'
import { wagmiConfig } from '@/config/wagmi'
import { loadDeployments } from '@/config/deployments'
import { getNetworkConfig } from '@/config/network'
import { ensureChain } from '@/lib/network-switch'
import {
  getSdkEncryptionKey as kmGetSdkEncryptionKey,
  getWalletId as kmGetWalletId,
  isUnlocked as kmIsUnlocked,
} from '@/lib/railgun/keyManager'
import { refreshShieldedBalances } from '@/lib/railgun/sync'
import {
  generateTransferProofForRecipient,
  populateTransferTransaction,
} from '@/lib/railgun/transfer'
import { advance, markFailed } from '@/lib/tx/reducer'
import { createProofProgressWriter } from '@/lib/tx/progress'
import type { StageHandler } from '@/lib/tx/executor'
import type { TxRecord } from '@/lib/tx/types'

/**
 * `transfer-shielded` stages map onto:
 *   1. `build-proof`    — generate the Groth16 transfer proof (~20-30s on local).
 *   2. `submit-relayer` — populate via `populateProvedTransfer`, sign+submit via the user's wallet.
 *   3. `hub-confirmed`  — terminal; kick a balance refresh so the UI updates immediately.
 *
 * Recipient is a 0zk address; the SDK encrypts the UTXO bundle with the recipient's viewing key,
 * so no on-chain trace of who received what beyond the public commitment hash.
 */
export const transferShieldedHandler: StageHandler<'transfer-shielded'> = {
  kind: 'transfer-shielded',
  resumableFrom: ['submit-relayer'],

  async run(record, ctx) {
    try {
      if (record.stage === 'build-proof') {
        await runBuildProof(record, ctx)
        return
      }
      if (record.stage === 'submit-relayer') {
        await runSubmitAndConfirm(record, ctx)
        return
      }
      // hub-confirmed is terminal; defensive no-op for resume-on-load.
    } catch (err) {
      const message = err instanceof Error ? err.message : 'transfer-shielded handler failed'
      const failed = markFailed(record, message)
      await ctx.upsert(failed)
    }
  },
}

async function runBuildProof(
  record: TxRecord<'transfer-shielded'>,
  ctx: Parameters<typeof transferShieldedHandler.run>[1],
): Promise<void> {
  if (!kmIsUnlocked()) {
    throw new Error('Private send requires an unlocked shielded wallet.')
  }
  const walletId = kmGetWalletId()
  const encryptionKey = kmGetSdkEncryptionKey()
  const deployments = await loadDeployments()
  const tokenAddress = deployments.hub.cctp.usdc

  if (ctx.signal.aborted) throw new Error('cancelled')

  const progress = createProofProgressWriter(record)
  await generateTransferProofForRecipient({
    walletId,
    encryptionKey,
    tokenAddress,
    recipient: record.meta.recipient,
    amount: record.meta.amount,
    onProgress: progress.write,
  })

  if (ctx.signal.aborted) throw new Error('cancelled')

  // Same deterministic-inputs argument as unshield-local — populate re-reads the token address
  // from the same manifest, so no artifacts persistence needed. Advance from `progress.latest()`
  // because the progress writes bumped updatedSeq.
  const next = advance(progress.latest(), 'submit-relayer')
  await ctx.upsert(next)
}

async function runSubmitAndConfirm(
  record: TxRecord<'transfer-shielded'>,
  ctx: Parameters<typeof transferShieldedHandler.run>[1],
): Promise<void> {
  if (!kmIsUnlocked()) {
    throw new Error('Private send requires an unlocked shielded wallet.')
  }
  const walletId = kmGetWalletId()
  const deployments = await loadDeployments()
  const tokenAddress = deployments.hub.cctp.usdc

  const populated = await populateTransferTransaction({
    walletId,
    tokenAddress,
    recipient: record.meta.recipient,
    amount: record.meta.amount,
  })
  if (ctx.signal.aborted) throw new Error('cancelled')

  // Hub-side transact() — ensure the wallet is on the hub before signing.
  await ensureChain(getNetworkConfig().hub.chainId)
  if (ctx.signal.aborted) throw new Error('cancelled')

  const hash = await sendTransaction(wagmiConfig, {
    to: populated.to,
    data: populated.data,
    value: populated.value,
  })
  if (ctx.signal.aborted) throw new Error('cancelled')

  await waitForTransactionReceipt(wagmiConfig, { hash })

  if (kmIsUnlocked()) {
    void refreshShieldedBalances(kmGetWalletId()).catch(() => {})
  }

  const completed = advance(record, 'hub-confirmed', { sourceTxHash: hash })
  await ctx.upsert(completed)
}
