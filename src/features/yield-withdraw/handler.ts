// ABOUTME: Yield-withdraw (redeem) handler — single atomic adapt-proof tx unshields ayUSDC shares, redeems from Aave, re-shields the resulting USDC back into the user's 0zk wallet.
// ABOUTME: Symmetric with yield-deposit; only the adapter entry point + token roles flip.

import {
  sendTransaction,
  waitForTransactionReceipt,
} from 'wagmi/actions'
import { wagmiConfig } from '@/config/wagmi'
import { loadDeployments, loadYieldDeployment } from '@/config/deployments'
import { getNetworkConfig } from '@/config/network'
import {
  getRailgunAddress as kmGetRailgunAddress,
  getSdkEncryptionKey as kmGetSdkEncryptionKey,
  getWalletId as kmGetWalletId,
  isUnlocked as kmIsUnlocked,
} from '@/lib/railgun/keyManager'
import { refreshShieldedBalances } from '@/lib/railgun/sync'
import { buildYieldAdaptTransaction } from '@/lib/railgun/yield'
import { ensureChain } from '@/lib/network-switch'
import { advance, markFailed } from '@/lib/tx/reducer'
import { createProofProgressWriter } from '@/lib/tx/progress'
import type { StageHandler } from '@/lib/tx/executor'
import type { TxRecord } from '@/lib/tx/types'

/**
 * Lifecycle mirrors yield-deposit. The amount field on the meta is the SHARES count (ayUSDC),
 * computed by the modal as `requestedUsdc × 1e18 / rate` where rate comes from `useYieldRate()`.
 * If rate moves between quote and execution the user receives slightly more or less than
 * requested — out of scope to slippage-protect for v1.
 */
export const yieldWithdrawHandler: StageHandler<'yield-withdraw'> = {
  kind: 'yield-withdraw',
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
    } catch (err) {
      const message = err instanceof Error ? err.message : 'yield-withdraw handler failed'
      await ctx.upsert(markFailed(record, message))
    }
  },
}

async function runBuildProof(
  record: TxRecord<'yield-withdraw'>,
  ctx: Parameters<typeof yieldWithdrawHandler.run>[1],
): Promise<void> {
  if (!kmIsUnlocked()) {
    throw new Error('Yield withdraw requires an unlocked shielded wallet.')
  }
  const walletId = kmGetWalletId()
  const encryptionKey = kmGetSdkEncryptionKey()
  const railgunAddress = kmGetRailgunAddress()
  const deployments = await loadDeployments()
  const yieldDeployment = await loadYieldDeployment()
  if (!yieldDeployment) {
    throw new Error('Yield deployment manifest not found — run `npm run setup`.')
  }
  if (record.meta.shares <= 0n) {
    throw new Error('Withdraw shares is zero — the vault rate may not have synced yet. Try again in a moment.')
  }

  if (ctx.signal.aborted) throw new Error('cancelled')

  const progress = createProofProgressWriter(record)
  const built = await buildYieldAdaptTransaction({
    walletId,
    encryptionKey,
    mode: 'redeem',
    // Redeem flips the token roles: we unshield SHARES (ayUSDC, the vault token) and receive
    // USDC (the underlying) back into the shielded pool.
    unshieldToken: yieldDeployment.contracts.armadaYieldVault,
    shieldOutputToken: deployments.hub.cctp.usdc,
    amount: record.meta.shares,
    railgunAddress,
    adapterAddress: yieldDeployment.contracts.armadaYieldAdapter,
    hubChainId: getNetworkConfig().hub.chainId,
    onProgress: progress.write,
  })

  if (ctx.signal.aborted) throw new Error('cancelled')
  // Stash the populated calldata — see yield-deposit handler for the proof-cache rationale.
  await ctx.upsert(advance(progress.latest(), 'submit-relayer', {
    yieldTx: {
      to: built.transaction.to,
      data: built.transaction.data,
      value: built.transaction.value.toString(),
    },
  }))
}

async function runSubmitAndConfirm(
  record: TxRecord<'yield-withdraw'>,
  ctx: Parameters<typeof yieldWithdrawHandler.run>[1],
): Promise<void> {
  const yieldTx = record.artifacts.yieldTx
  if (!yieldTx) {
    throw new Error('Yield adapt-proof tx missing — re-run build-proof stage.')
  }

  // Adapter call lives on the hub.
  await ensureChain(getNetworkConfig().hub.chainId)
  if (ctx.signal.aborted) throw new Error('cancelled')

  const hash = await sendTransaction(wagmiConfig, {
    to: yieldTx.to,
    data: yieldTx.data,
    value: BigInt(yieldTx.value),
  })
  if (ctx.signal.aborted) throw new Error('cancelled')

  await waitForTransactionReceipt(wagmiConfig, { hash })

  if (kmIsUnlocked()) {
    void refreshShieldedBalances(kmGetWalletId()).catch(() => {})
  }

  await ctx.upsert(advance(record, 'hub-confirmed', { sourceTxHash: hash }))
}
