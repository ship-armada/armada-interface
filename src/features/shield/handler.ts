// ABOUTME: Shield stage handler — runs build-proof → submit-relayer → hub-confirmed for a single shield tx.
// ABOUTME: Uses wagmi/actions imperatively (no React context required); calls into lib/railgun/shield for the SDK-side request construction.

import {
  readContract,
  signMessage,
  waitForTransactionReceipt,
  writeContract,
} from 'wagmi/actions'
import { erc20Abi, maxUint256 } from 'viem'
import { wagmiConfig } from '@/config/wagmi'
import { loadDeployments } from '@/config/deployments'
import { getIntegratorAddress } from '@/config/network'
import {
  getRailgunAddress as kmGetRailgunAddress,
  getWalletId as kmGetWalletId,
  isUnlocked as kmIsUnlocked,
} from '@/lib/railgun/keyManager'
import { refreshShieldedBalances } from '@/lib/railgun/sync'
import {
  createShieldRequest,
  deriveShieldPrivateKey,
  SHIELD_SIGNATURE_MESSAGE,
} from '@/lib/railgun/shield'
import { advance, markFailed } from '@/lib/tx/reducer'
import type { StageHandler } from '@/lib/tx/executor'
import type { TxRecord } from '@/lib/tx/types'

// PrivacyPool.shield ABI — the hub-side direct shield entry point. `integrator` lets the
// contract route fees to a third party; we always pass ZeroAddress for direct user shields.
// We carry the inline tuple/enum naming so viem can encode the calldata correctly.
const PRIVACY_POOL_SHIELD_ABI = [
  {
    type: 'function',
    name: 'shield',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: '_shieldRequests',
        type: 'tuple[]',
        components: [
          {
            name: 'preimage',
            type: 'tuple',
            components: [
              { name: 'npk', type: 'bytes32' },
              {
                name: 'token',
                type: 'tuple',
                components: [
                  { name: 'tokenType', type: 'uint8' },
                  { name: 'tokenAddress', type: 'address' },
                  { name: 'tokenSubID', type: 'uint256' },
                ],
              },
              { name: 'value', type: 'uint120' },
            ],
          },
          {
            name: 'ciphertext',
            type: 'tuple',
            components: [
              { name: 'encryptedBundle', type: 'bytes32[3]' },
              { name: 'shieldKey', type: 'bytes32' },
            ],
          },
        ],
      },
      { name: 'integrator', type: 'address' },
    ],
    outputs: [],
  },
] as const

/**
 * Shield stage handler. The three stages map onto:
 *   1. `build-proof`      — sign 'RAILGUN_SHIELD', derive shieldPrivateKey, build ShieldRequest off-chain
 *   2. `submit-relayer`   — ensure USDC allowance, submit `PrivacyPool.shield(...)` via the user's wallet
 *   3. `hub-confirmed`    — wait for the receipt, attach the source tx hash, kick a balance refresh
 *
 * "submit-relayer" is the framework's stage name for "tx on the wire" — for direct hub shield
 * it's the user's wallet, not the relayer, but the stage semantics (one tx, one receipt) match.
 */
export const shieldHandler: StageHandler<'shield'> = {
  kind: 'shield',
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
      if (record.stage === 'hub-confirmed') {
        // Terminal — reducer.advance already flipped executionState='completed' on the previous
        // transition, so the executor's loop won't re-enter run(). This branch is unreachable
        // under normal flow but kept defensive for resume-on-load scenarios.
        return
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'shield handler failed'
      const failed = markFailed(record, message)
      await ctx.upsert(failed)
    }
  },
}

async function runBuildProof(
  record: TxRecord<'shield'>,
  ctx: Parameters<typeof shieldHandler.run>[1],
): Promise<void> {
  // Resolve dependencies the handler needs from outside the record itself. The handler doesn't
  // capture these at submit-time because they're not serializable / are session-scoped.
  if (!kmIsUnlocked()) {
    throw new Error('Shield requires an unlocked shielded wallet.')
  }
  const railgunAddress = kmGetRailgunAddress()

  const deployments = await loadDeployments()
  const usdcAddress = deployments.hub.cctp.usdc
  const privacyPoolAddress = deployments.hub.contracts.privacyPool

  if (ctx.signal.aborted) throw new Error('cancelled')

  // Sign 'RAILGUN_SHIELD' through wagmi. The active wallet client = the user's MetaMask.
  // signMessage prompts the user; rejection bubbles up as a Viem error.
  const sigHex = await signMessage(wagmiConfig, { message: SHIELD_SIGNATURE_MESSAGE })
  if (ctx.signal.aborted) throw new Error('cancelled')

  const shieldPrivateKey = deriveShieldPrivateKey(sigHex)
  const request = await createShieldRequest(
    railgunAddress,
    record.meta.amount,
    usdcAddress,
    shieldPrivateKey,
  )

  // Stash the request fields + addresses in artifacts so the next stage can submit without
  // re-running the (already-signed) build step on a resume.
  const next = advance(record, 'submit-relayer', {
    shieldRequest: {
      npk: request.npk,
      value: request.value.toString(), // bigint → string for IDB serializability
      encryptedBundle: request.encryptedBundle,
      shieldKey: request.shieldKey,
    },
    privacyPoolAddress,
    usdcAddress,
  })
  await ctx.upsert(next)
}

async function runSubmitAndConfirm(
  record: TxRecord<'shield'>,
  ctx: Parameters<typeof shieldHandler.run>[1],
): Promise<void> {
  const artifacts = record.artifacts
  const shieldRequest = artifacts.shieldRequest
  const privacyPoolAddress = artifacts.privacyPoolAddress
  const usdcAddress = artifacts.usdcAddress
  if (!shieldRequest || !privacyPoolAddress || !usdcAddress) {
    throw new Error('Shield artifacts missing — re-run build-proof stage.')
  }

  // 1. Ensure USDC allowance. We use the connected wallet's address (looked up via wagmi's
  //    getAccount under writeContract's hood). readContract is synchronous-ish; signal-checked
  //    around each long step.
  const ownerCaptured = record.walletContext.evmAddress
  if (!ownerCaptured) {
    throw new Error('Shield requires a connected EVM wallet; none captured at submit time.')
  }
  const owner = ownerCaptured as `0x${string}`
  const allowance = await readContract(wagmiConfig, {
    address: usdcAddress as `0x${string}`,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [owner, privacyPoolAddress as `0x${string}`],
  })
  if (ctx.signal.aborted) throw new Error('cancelled')

  if (allowance < record.meta.amount) {
    // Approve max — same UX trade-off as the legacy app (one approval, all future shields free).
    const approveHash = await writeContract(wagmiConfig, {
      address: usdcAddress as `0x${string}`,
      abi: erc20Abi,
      functionName: 'approve',
      args: [privacyPoolAddress as `0x${string}`, maxUint256],
    })
    await waitForTransactionReceipt(wagmiConfig, { hash: approveHash })
    if (ctx.signal.aborted) throw new Error('cancelled')
  }

  // 2. Submit the shield tx. Compose the tuple from the stored artifacts.
  const shieldRequestTuple = {
    preimage: {
      npk: shieldRequest.npk as `0x${string}`,
      token: {
        tokenType: 0, // 0 = ERC20 per RailgunSmartWallet's TokenType enum
        tokenAddress: usdcAddress as `0x${string}`,
        tokenSubID: 0n,
      },
      value: BigInt(shieldRequest.value),
    },
    ciphertext: {
      encryptedBundle: shieldRequest.encryptedBundle as readonly [`0x${string}`, `0x${string}`, `0x${string}`],
      shieldKey: shieldRequest.shieldKey as `0x${string}`,
    },
  }
  const shieldHash = await writeContract(wagmiConfig, {
    address: privacyPoolAddress as `0x${string}`,
    abi: PRIVACY_POOL_SHIELD_ABI,
    functionName: 'shield',
    args: [[shieldRequestTuple], getIntegratorAddress()],
  })
  if (ctx.signal.aborted) throw new Error('cancelled')

  // 3. Wait for confirmation. The SDK's merkle scan will pick up the new commitment via the
  //    onBalanceUpdate callback — but we also kick a refresh explicitly so the UI doesn't have
  //    to wait for the SDK's poll interval.
  await waitForTransactionReceipt(wagmiConfig, { hash: shieldHash })

  if (kmIsUnlocked()) {
    // Fire-and-forget — failures here are non-fatal (the periodic refresh would catch it).
    void refreshShieldedBalances(kmGetWalletId()).catch(() => {})
  }

  const completed = advance(record, 'hub-confirmed', {
    sourceTxHash: shieldHash,
  })
  await ctx.upsert(completed)
}
