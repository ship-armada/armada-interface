// ABOUTME: Unshield-local stage handler — build-proof → submit-relayer → hub-confirmed, all direct user-submitted.
// ABOUTME: Cross-chain (`unshield-xchain`) gets its own handler when CCTP wiring lands; this one is hub→hub only.

import {
  sendTransaction,
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
  generateUnshieldProofForRecipient,
  populateUnshieldTransaction,
} from '@/lib/railgun/unshield'
import { advance, markFailed, patchArtifacts } from '@/lib/tx/reducer'
import { waitForReceiptOrFail } from '@/lib/tx/receipt'
import { simulateOrThrow } from '@/lib/tx/simulate'
import { classifyHandlerError } from '@/lib/tx/errors'
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
      if (ctx.signal.aborted) return
      const failed = markFailed(record, classifyHandlerError(err, 'Unshield failed.', record.artifacts.sourceTxHash))
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

  // Hub-side transact() — ensure the wallet is on the hub before signing.
  const hubChainId = getNetworkConfig().hub.chainId
  await ensureChain(hubChainId)
  if (ctx.signal.aborted) throw new Error('cancelled')

  // Pre-flight simulation. If the on-chain call reverts (stale merkle root, already-used
  // nullifier, etc.) MetaMask would otherwise discover it inside `eth_estimateGas`, fall back
  // to a hardcoded high gas limit, and the RPC would reject with the opaque "gas limit too
  // high" — hiding the actual revert reason. Running the simulate ourselves lets us surface
  // the real reason via the typed-error pipeline (TX_REVERTED → ErrorStep) without ever
  // popping the wallet.
  const account = record.walletContext.evmAddress as `0x${string}`
  await simulateOrThrow({
    to: populated.to,
    data: populated.data,
    value: populated.value,
    account,
    chainId: hubChainId,
  })
  if (ctx.signal.aborted) throw new Error('cancelled')

  // Submit via the connected wallet. The populated `to` is the PrivacyPool address; `data` is
  // the encoded `transact(...)` calldata carrying the proof + unshield directive.
  const hash = await sendTransaction(wagmiConfig, {
    to: populated.to,
    data: populated.data,
    value: populated.value,
  })
  // Persist sourceTxHash before the receipt wait so a cancel/timeout that happens during the
  // wait carries the hash forward into the error UX (explorer link / "stopped tracking" copy).
  // The patched record MUST be threaded forward into the final advance — `record` is now stale
  // (lower updatedSeq than the atom/IDB) and an advance from it would produce an equal-seq
  // write that OCC silently drops, leaving the executor looping on this stage.
  const broadcastRecord = patchArtifacts(record, { sourceTxHash: hash })
  await ctx.upsert(broadcastRecord)
  if (ctx.signal.aborted) throw new Error('cancelled')

  await waitForReceiptOrFail({ hash, signal: ctx.signal })

  // Kick an immediate balance refresh — same fire-and-forget pattern as the shield handler.
  if (kmIsUnlocked()) {
    void refreshShieldedBalances(kmGetWalletId()).catch(() => {})
  }

  const completed = advance(broadcastRecord, 'hub-confirmed', { sourceTxHash: hash })
  await ctx.upsert(completed)
}
