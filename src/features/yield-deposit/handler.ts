// ABOUTME: Yield-deposit (lend) handler — single atomic adapt-proof tx unshields USDC, deposits into Aave, re-shields the resulting aUSDC into the user's 0zk wallet.
// ABOUTME: Three stages: build-proof (~20-30s), submit-relayer (user signs adapter.lendAndShield), hub-confirmed (receipt + balance refresh).

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
import { advance, markFailed } from '@/lib/tx/reducer'
import { createProofProgressWriter } from '@/lib/tx/progress'
import type { StageHandler } from '@/lib/tx/executor'
import type { TxRecord } from '@/lib/tx/types'

/**
 * Lifecycle:
 *   build-proof    — CrossContractCalls proof (USDC → adapter → aUSDC re-shielded)
 *   submit-relayer — user signs adapter.lendAndShield(...)
 *   hub-confirmed  — receipt + balance refresh
 *
 * The adapter atomically deposits unshielded USDC into Aave and re-shields the minted aUSDC
 * back into the user's 0zk wallet — the shielded balance of ayUSDC ticks up.
 */
export const yieldDepositHandler: StageHandler<'yield-deposit'> = {
  kind: 'yield-deposit',
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
      // hub-confirmed is terminal.
    } catch (err) {
      const message = err instanceof Error ? err.message : 'yield-deposit handler failed'
      await ctx.upsert(markFailed(record, message))
    }
  },
}

async function runBuildProof(
  record: TxRecord<'yield-deposit'>,
  ctx: Parameters<typeof yieldDepositHandler.run>[1],
): Promise<void> {
  if (!kmIsUnlocked()) {
    throw new Error('Yield deposit requires an unlocked shielded wallet.')
  }
  const walletId = kmGetWalletId()
  const encryptionKey = kmGetSdkEncryptionKey()
  const railgunAddress = kmGetRailgunAddress()
  const deployments = await loadDeployments()
  const yieldDeployment = await loadYieldDeployment()
  if (!yieldDeployment) {
    throw new Error('Yield deployment manifest not found — run `npm run setup` to deploy yield contracts.')
  }
  const usdcAddress = deployments.hub.cctp.usdc
  const vaultAddress = yieldDeployment.contracts.armadaYieldVault
  const adapterAddress = yieldDeployment.contracts.armadaYieldAdapter

  if (ctx.signal.aborted) throw new Error('cancelled')

  const progress = createProofProgressWriter(record)
  const built = await buildYieldAdaptTransaction({
    walletId,
    encryptionKey,
    mode: 'lend',
    unshieldToken: usdcAddress,
    shieldOutputToken: vaultAddress,
    amount: record.meta.amount,
    railgunAddress,
    adapterAddress,
    hubChainId: getNetworkConfig().hub.chainId,
    onProgress: progress.write,
  })

  if (ctx.signal.aborted) throw new Error('cancelled')
  // Stash the populated calldata so submit-relayer skips re-proving. The SDK's
  // generateProofTransactions is stateless — without this, a resume (or even the normal
  // build-proof → submit-relayer transition) would pay the ~20-30s proving cost twice.
  await ctx.upsert(advance(progress.latest(), 'submit-relayer', {
    yieldTx: {
      to: built.transaction.to,
      data: built.transaction.data,
      value: built.transaction.value.toString(),
    },
  }))
}

async function runSubmitAndConfirm(
  record: TxRecord<'yield-deposit'>,
  ctx: Parameters<typeof yieldDepositHandler.run>[1],
): Promise<void> {
  const yieldTx = record.artifacts.yieldTx
  if (!yieldTx) {
    throw new Error('Yield adapt-proof tx missing — re-run build-proof stage.')
  }

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
