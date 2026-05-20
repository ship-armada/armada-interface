// ABOUTME: Cross-chain unshield handler — burns shielded USDC on hub via atomicCrossChainUnshield, then polls destination chain for CCTP delivery.
// ABOUTME: Same handler covers Withdraw modal (destination ≠ hub) and Send-External tab (destination ≠ hub) — same contract path, different UI entry.

import { ethers } from 'ethers'
import { encodeFunctionData, erc20Abi, pad } from 'viem'
import {
  readContract,
  sendTransaction,
  waitForTransactionReceipt,
} from 'wagmi/actions'
import { wagmiConfig } from '@/config/wagmi'
import { loadDeployments } from '@/config/deployments'
import { getNetworkConfig } from '@/config/network'
import {
  getSdkEncryptionKey as kmGetSdkEncryptionKey,
  getWalletId as kmGetWalletId,
  isUnlocked as kmIsUnlocked,
} from '@/lib/railgun/keyManager'
import { refreshShieldedBalances } from '@/lib/railgun/sync'
import {
  buildXchainUnshieldTransactionStruct,
  generateXchainUnshieldProof,
} from '@/lib/railgun/unshield'
import { advance, markFailed, markWaiting } from '@/lib/tx/reducer'
import { poll } from '@/lib/tx/poller'
import type { StageHandler } from '@/lib/tx/executor'
import type { TxRecord } from '@/lib/tx/types'

/**
 * PrivacyPool.atomicCrossChainUnshield ABI — same Transaction struct as transact(), wrapped with
 * the CCTP destination + recipient + caller-restriction + maxFee. The destination router on the
 * client chain ATOMICALLY receives the CCTP USDC and forwards it to `finalRecipient` in one
 * `relayWithHook` call, so the user sees a single tx on each chain.
 */
const PRIVACY_POOL_XCHAIN_UNSHIELD_ABI = [
  {
    type: 'function',
    name: 'atomicCrossChainUnshield',
    stateMutability: 'nonpayable',
    inputs: [
      // The Transaction struct — we extract this from the SDK's transact() calldata.
      { name: '_transaction', type: 'tuple', components: [
        { name: 'proof', type: 'tuple', components: [
          { name: 'a', type: 'tuple', components: [
            { name: 'x', type: 'uint256' },
            { name: 'y', type: 'uint256' },
          ] },
          { name: 'b', type: 'tuple', components: [
            { name: 'x', type: 'uint256[2]' },
            { name: 'y', type: 'uint256[2]' },
          ] },
          { name: 'c', type: 'tuple', components: [
            { name: 'x', type: 'uint256' },
            { name: 'y', type: 'uint256' },
          ] },
        ] },
        { name: 'merkleRoot', type: 'bytes32' },
        { name: 'nullifiers', type: 'bytes32[]' },
        { name: 'commitments', type: 'bytes32[]' },
        { name: 'boundParams', type: 'tuple', components: [
          { name: 'treeNumber', type: 'uint16' },
          { name: 'minGasPrice', type: 'uint72' },
          { name: 'unshield', type: 'uint8' },
          { name: 'chainID', type: 'uint64' },
          { name: 'adaptContract', type: 'address' },
          { name: 'adaptParams', type: 'bytes32' },
          { name: 'commitmentCiphertext', type: 'tuple[]', components: [
            { name: 'ciphertext', type: 'bytes32[4]' },
            { name: 'blindedSenderViewingKey', type: 'bytes32' },
            { name: 'blindedReceiverViewingKey', type: 'bytes32' },
            { name: 'annotationData', type: 'bytes' },
            { name: 'memo', type: 'bytes' },
          ] },
        ] },
        { name: 'unshieldPreimage', type: 'tuple', components: [
          { name: 'npk', type: 'bytes32' },
          { name: 'token', type: 'tuple', components: [
            { name: 'tokenType', type: 'uint8' },
            { name: 'tokenAddress', type: 'address' },
            { name: 'tokenSubID', type: 'uint256' },
          ] },
          { name: 'value', type: 'uint120' },
        ] },
      ] },
      { name: 'destinationDomain', type: 'uint32' },
      { name: 'finalRecipient', type: 'address' },
      { name: 'destinationCaller', type: 'bytes32' },
      { name: 'maxFee', type: 'uint256' },
    ],
    outputs: [],
  },
] as const

/**
 * Stage map for `unshield-xchain`:
 *   1. `build-proof`              — Groth16 proof (recipient = PrivacyPool itself)
 *   2. `submit-relayer`           — extract Transaction struct from populated calldata, encode
 *                                    atomicCrossChainUnshield, submit via user wallet
 *   3. `hub-burn-confirmed`       — wait for hub receipt
 *   4. `iris-attestation-pending` — polls destination chain for the recipient's USDC balance to
 *                                    tick up (signal that CCTP delivered + hook router minted).
 *                                    In MOCK mode the local cctp-relay handles this; in REAL
 *                                    mode Iris attestation + the relayer's iris-relay handles it.
 *   5. `iris-attestation-ready` / `client-mint-pending` / `client-mint-confirmed` — advanced
 *                                    through in quick succession on detection. The intermediate
 *                                    states exist for finer-grained UI; v1 collapses them since
 *                                    our single "balance increased on destination" signal can't
 *                                    distinguish them.
 */
export const unshieldXchainHandler: StageHandler<'unshield-xchain'> = {
  kind: 'unshield-xchain',
  // Iris/client polling can be resumed; pre-hub-receipt stages can't (proof + onchain submit).
  resumableFrom: ['submit-relayer', 'iris-attestation-pending'],

  async run(record, ctx) {
    try {
      switch (record.stage) {
        case 'build-proof':
          await runBuildProof(record, ctx)
          return
        case 'submit-relayer':
          await runSubmitAndBurn(record, ctx)
          return
        case 'hub-burn-confirmed':
          // Bridge stage — advance into the polling phase.
          await ctx.upsert(advance(record, 'iris-attestation-pending'))
          return
        case 'iris-attestation-pending':
          await runWaitForDelivery(record, ctx)
          return
        // The remaining stages (iris-attestation-ready / client-mint-pending /
        // client-mint-confirmed) are advanced through inside runWaitForDelivery. If we end up
        // here it's a resume from a partially-completed delivery and we're already terminal.
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unshield-xchain handler failed'
      const failed = markFailed(record, message)
      await ctx.upsert(failed)
    }
  },
}

async function runBuildProof(
  record: TxRecord<'unshield-xchain'>,
  ctx: Parameters<typeof unshieldXchainHandler.run>[1],
): Promise<void> {
  if (!kmIsUnlocked()) {
    throw new Error('Cross-chain withdraw requires an unlocked shielded wallet.')
  }
  const walletId = kmGetWalletId()
  const encryptionKey = kmGetSdkEncryptionKey()
  const deployments = await loadDeployments()
  const tokenAddress = deployments.hub.cctp.usdc
  const privacyPoolAddress = deployments.hub.contracts.privacyPool

  if (ctx.signal.aborted) throw new Error('cancelled')

  await generateXchainUnshieldProof({
    walletId,
    encryptionKey,
    tokenAddress,
    privacyPoolAddress,
    amount: record.meta.amount,
  })

  if (ctx.signal.aborted) throw new Error('cancelled')
  await ctx.upsert(advance(record, 'submit-relayer'))
}

async function runSubmitAndBurn(
  record: TxRecord<'unshield-xchain'>,
  ctx: Parameters<typeof unshieldXchainHandler.run>[1],
): Promise<void> {
  const walletId = kmGetWalletId()
  const deployments = await loadDeployments()
  const tokenAddress = deployments.hub.cctp.usdc
  const privacyPoolAddress = deployments.hub.contracts.privacyPool

  // Map destination chain id → CCTP domain. Both come from the network config.
  const destChain = getNetworkConfig().clients.find(c => c.chainId === record.meta.toChainId)
  if (!destChain) {
    throw new Error(`Unknown destination chain ${record.meta.toChainId}`)
  }
  const destinationDomain = destChain.domain
  const destClientDeployment = deployments.clients.find(c => c.chainId === record.meta.toChainId)
  if (!destClientDeployment) {
    throw new Error(`No deployment for destination chain ${record.meta.toChainId}`)
  }
  const destHookRouter = destClientDeployment.contracts.hookRouter

  // Build the Transaction struct (decoded from the SDK's populated transact() calldata).
  const txStruct = await buildXchainUnshieldTransactionStruct({
    walletId,
    tokenAddress,
    privacyPoolAddress,
    amount: record.meta.amount,
  })
  if (ctx.signal.aborted) throw new Error('cancelled')

  // destinationCaller: bytes32 form of the destination hook router; restricts who can call
  // receiveMessage on the destination MessageTransmitter (the router atomically delivers).
  const destinationCaller = destHookRouter && destHookRouter !== ethers.ZeroAddress
    ? pad(destHookRouter as `0x${string}`, { size: 32 })
    : `0x${'00'.repeat(32)}` as `0x${string}`

  // maxFee = 0 for now (no relayer fee in this path). When the relayer-mediated path lands we
  // pull from useFees / the /fees endpoint and pass the quoted value here.
  const maxFee = 0n

  const hash = await sendTransaction(wagmiConfig, {
    to: privacyPoolAddress as `0x${string}`,
    data: encodeAtomicCrossChainUnshield(
      txStruct,
      destinationDomain,
      record.meta.recipient as `0x${string}`,
      destinationCaller,
      maxFee,
    ),
    value: 0n,
  })
  if (ctx.signal.aborted) throw new Error('cancelled')

  await waitForTransactionReceipt(wagmiConfig, { hash })

  // Move past `submit-relayer` → `hub-burn-confirmed`. Snapshot the destination-side starting
  // balance so the polling stage can detect a delta even if the recipient already held USDC.
  const destStartingBalance = await readDestUsdcBalance({
    chainId: record.meta.toChainId,
    usdcAddress: destClientDeployment.cctp.usdc as `0x${string}`,
    recipient: record.meta.recipient as `0x${string}`,
  })
  await ctx.upsert(advance(record, 'hub-burn-confirmed', {
    sourceTxHash: hash,
    destStartingBalance: destStartingBalance.toString(),
  }))
}

async function runWaitForDelivery(
  record: TxRecord<'unshield-xchain'>,
  ctx: Parameters<typeof unshieldXchainHandler.run>[1],
): Promise<void> {
  const deployments = await loadDeployments()
  const destClientDeployment = deployments.clients.find(c => c.chainId === record.meta.toChainId)
  if (!destClientDeployment) {
    throw new Error(`No deployment for destination chain ${record.meta.toChainId}`)
  }
  const usdcAddress = destClientDeployment.cctp.usdc as `0x${string}`
  const recipient = record.meta.recipient as `0x${string}`
  const startStr = record.artifacts.destStartingBalance
  const startingBalance = startStr ? BigInt(startStr) : 0n
  const targetIncrease = record.meta.amount

  // Park the record in 'waiting' so the stepper renders the "Waiting for cross-chain confirmation"
  // copy. The executor loop pauses (per `markWaiting` semantics) until our poll() returns.
  await ctx.upsert(markWaiting(record))

  const result = await poll<bigint>(
    async (signal) => {
      if (signal.aborted) return null
      const current = await readDestUsdcBalance({
        chainId: record.meta.toChainId,
        usdcAddress,
        recipient,
      })
      // CCTP can deliver slightly more than the proof amount when a relayer fee was zero on
      // their end; comparing ≥ targetIncrease keeps it tolerant.
      if (current - startingBalance >= targetIncrease) {
        return current
      }
      return null
    },
    {
      intervalMs: 4_000,
      jitter: 0.2,
      timeoutMs: 10 * 60_000, // 10 min cap — well below the lifecycle's 60 min xchain cap
      signal: ctx.signal,
    },
  )

  if (result.status !== 'done') {
    throw new Error(
      result.status === 'aborted'
        ? 'cancelled'
        : 'Timed out waiting for cross-chain delivery — check the destination chain manually.',
    )
  }

  // Walk through the remaining stages so the stepper shows progress, then terminate.
  // (Our single "balance increased" signal collapses Iris-ready + mint-pending + mint-confirmed
  // into one detection; future improvement is to break these apart via the relayer's /status
  // endpoint or destination-chain event logs.)
  let cursor = record
  for (const next of ['iris-attestation-ready', 'client-mint-pending', 'client-mint-confirmed'] as const) {
    cursor = advance(cursor, next)
    await ctx.upsert(cursor)
  }

  // Balance refresh — the user just sent shielded USDC out, so their shielded balance dropped.
  if (kmIsUnlocked()) {
    void refreshShieldedBalances(kmGetWalletId()).catch(() => {})
  }
}

async function readDestUsdcBalance(opts: {
  chainId: number
  usdcAddress: `0x${string}`
  recipient: `0x${string}`
}): Promise<bigint> {
  // Force chainId so wagmi picks the destination chain's transport — readContract on a
  // multi-chain wagmi config defaults to the connected chain otherwise.
  return readContract(wagmiConfig, {
    chainId: opts.chainId,
    address: opts.usdcAddress,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [opts.recipient],
  })
}

function encodeAtomicCrossChainUnshield(
  transactionStruct: unknown,
  destinationDomain: number,
  finalRecipient: `0x${string}`,
  destinationCaller: `0x${string}`,
  maxFee: bigint,
): `0x${string}` {
  return encodeFunctionData({
    abi: PRIVACY_POOL_XCHAIN_UNSHIELD_ABI,
    functionName: 'atomicCrossChainUnshield',
    args: [
      // The decoded transaction struct from the SDK — viem encodes by name matching the ABI's
      // component names. Cast through unknown since the struct shape is dynamic at this seam.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      transactionStruct as any,
      destinationDomain,
      finalRecipient,
      destinationCaller,
      maxFee,
    ],
  })
}
