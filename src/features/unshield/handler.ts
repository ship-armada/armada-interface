// ABOUTME: Unshield-local stage handler — build-proof → submit-relayer → hub-confirmed, all direct user-submitted.
// ABOUTME: Cross-chain (`unshield-xchain`) gets its own handler when CCTP wiring lands; this one is hub→hub only.

import {
  sendTransaction,
  waitForTransactionReceipt,
} from 'wagmi/actions'
import { wagmiConfig } from '@/config/wagmi'
import { loadDeployments } from '@/config/deployments'
import {
  getSdkEncryptionKey as kmGetSdkEncryptionKey,
  getWalletId as kmGetWalletId,
  isUnlocked as kmIsUnlocked,
} from '@/lib/railgun/keyManager'
import { refreshShieldedBalances } from '@/lib/railgun/sync'
import {
  generateUnshieldProofForRecipient,
  populateUnshieldTransaction,
} from '@/lib/railgun/unshield'
import { advance, markFailed } from '@/lib/tx/reducer'
import { createProofProgressWriter } from '@/lib/tx/progress'
import type { StageHandler } from '@/lib/tx/executor'
import type { TxRecord } from '@/lib/tx/types'

/**
 * `unshield-local` stages:
 *   1. `build-proof`    — generate the Groth16 unshield proof (20-30s on local Anvil). Persists
 *                          the inputs (tokenAddress + recipient + amount) into artifacts so the
 *                          populate step can pass exactly the same args.
 *   2. `submit-relayer` — populate the tx via `populateProvedUnshield`, sign+submit via the
 *                          user's wallet, wait for receipt.
 *   3. `hub-confirmed`  — terminal. Kicks a balance refresh so the UI updates immediately.
 *
 * Direct user-submitted (no relayer); `sendWithPublicWallet=true` is baked into the lib helper.
 */
export const unshieldLocalHandler: StageHandler<'unshield-local'> = {
  kind: 'unshield-local',
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
      // hub-confirmed is terminal; advance() flips executionState to 'completed' so the executor
      // loop won't re-enter this handler. Defensive no-op for resume-on-load.
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unshield-local handler failed'
      const failed = markFailed(record, message)
      await ctx.upsert(failed)
    }
  },
}

async function runBuildProof(
  record: TxRecord<'unshield-local'>,
  ctx: Parameters<typeof unshieldLocalHandler.run>[1],
): Promise<void> {
  if (!kmIsUnlocked()) {
    throw new Error('Unshield requires an unlocked shielded wallet.')
  }
  const walletId = kmGetWalletId()
  const encryptionKey = kmGetSdkEncryptionKey()
  const deployments = await loadDeployments()
  const tokenAddress = deployments.hub.cctp.usdc

  if (ctx.signal.aborted) throw new Error('cancelled')

  const progress = createProofProgressWriter(record)
  await generateUnshieldProofForRecipient({
    walletId,
    encryptionKey,
    tokenAddress,
    recipient: record.meta.recipient,
    amount: record.meta.amount,
    onProgress: progress.write,
  })

  if (ctx.signal.aborted) throw new Error('cancelled')

  // Advance from the LIVE record (progress bumps bumped updatedSeq). Using the original
  // `record` param here would hit upsertTxAtom's OCC guard and drop the transition silently.
  const next = advance(progress.latest(), 'submit-relayer')
  await ctx.upsert(next)
}

async function runSubmitAndConfirm(
  record: TxRecord<'unshield-local'>,
  ctx: Parameters<typeof unshieldLocalHandler.run>[1],
): Promise<void> {
  if (!kmIsUnlocked()) {
    throw new Error('Unshield requires an unlocked shielded wallet.')
  }
  const walletId = kmGetWalletId()
  const deployments = await loadDeployments()
  const tokenAddress = deployments.hub.cctp.usdc

  const populated = await populateUnshieldTransaction({
    walletId,
    tokenAddress,
    recipient: record.meta.recipient,
    amount: record.meta.amount,
  })
  if (ctx.signal.aborted) throw new Error('cancelled')

  // Submit via the connected wallet. The populated `to` is the PrivacyPool address; `data` is
  // the encoded `transact(...)` calldata carrying the proof + unshield directive.
  const hash = await sendTransaction(wagmiConfig, {
    to: populated.to,
    data: populated.data,
    value: populated.value,
  })
  if (ctx.signal.aborted) throw new Error('cancelled')

  await waitForTransactionReceipt(wagmiConfig, { hash })

  // Kick an immediate balance refresh — same fire-and-forget pattern as the shield handler.
  if (kmIsUnlocked()) {
    void refreshShieldedBalances(kmGetWalletId()).catch(() => {})
  }

  const completed = advance(record, 'hub-confirmed', { sourceTxHash: hash })
  await ctx.upsert(completed)
}
