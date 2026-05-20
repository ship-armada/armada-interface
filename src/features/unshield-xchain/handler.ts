// ABOUTME: Cross-chain unshield handler — burns shielded USDC on hub via atomicCrossChainUnshield, then polls destination chain for CCTP delivery.
// ABOUTME: Same handler covers Withdraw modal (destination ≠ hub) and Send-External tab (destination ≠ hub) — same contract path, different UI entry.

import { ethers } from 'ethers'
import { encodeFunctionData, pad, parseAbiItem } from 'viem'
import { getPublicClient } from 'wagmi/actions'
import {
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
import {
  extractCctpMessageFromReceipt,
} from '@/lib/cctp'
import { fetchFees, feeForKind } from '@/lib/relayer'

// MessageReceived event signature parsed for viem's typed log filter — accepts indexed-arg
// filters via `args.nonce`. Mirrors the on-chain event verbatim (see contracts/cctp/MockCCTPV2.sol).
const MESSAGE_RECEIVED_EVENT = parseAbiItem(
  'event MessageReceived(address indexed caller, uint32 sourceDomain, bytes32 indexed nonce, bytes32 sender, uint32 indexed finalityThresholdExecuted, bytes messageBody)',
)
import { advance, markFailed, markWaiting } from '@/lib/tx/reducer'
import { poll } from '@/lib/tx/poller'
import { createProofProgressWriter } from '@/lib/tx/progress'
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

  const progress = createProofProgressWriter(record)
  await generateXchainUnshieldProof({
    walletId,
    encryptionKey,
    tokenAddress,
    privacyPoolAddress,
    amount: record.meta.amount,
    onProgress: progress.write,
  })

  if (ctx.signal.aborted) throw new Error('cancelled')
  // Advance from the LIVE record (progress bumps incremented updatedSeq).
  await ctx.upsert(advance(progress.latest(), 'submit-relayer'))
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

  // maxFee = the relayer's quoted CCTP delivery fee. We re-fetch at submit time so the value
  // is fresh; the relayer enforces a minimum and skips messages below it. Fee is deducted from
  // the amount minted on the destination — recipient receives (amount − maxFee). The modal's
  // Review step shows the same fee to the user (via feeForKind on the cached quote).
  const feeQuote = await fetchFees()
  const maxFee = feeForKind(feeQuote, 'unshield-xchain')

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

  const receipt = await waitForTransactionReceipt(wagmiConfig, { hash })

  // Extract the CCTP message reference from the hub receipt — gives us the indexed `nonce`
  // topic to filter destination events on (unique per CCTP message, eliminates false positives
  // we'd otherwise get from balance polling).
  const cctpRef = extractCctpMessageFromReceipt({
    logs: receipt.logs,
    messageTransmitterAddress: deployments.hub.cctp.messageTransmitter as `0x${string}`,
  })
  if (!cctpRef) {
    throw new Error('No CCTP MessageSent log in hub tx receipt — cross-chain delivery cannot be tracked.')
  }

  // Snapshot the destination chain's current block height so the delivery poll can scope its
  // log query to fromBlock=now. Avoids re-scanning history; also cheap to support a resume
  // mid-poll (we keep matching from the same fromBlock floor).
  const destClient = getPublicClient(wagmiConfig, { chainId: record.meta.toChainId })
  if (!destClient) {
    throw new Error(`No wagmi public client for destination chain ${record.meta.toChainId}`)
  }
  const destFromBlock = await destClient.getBlockNumber()

  await ctx.upsert(advance(record, 'hub-burn-confirmed', {
    sourceTxHash: hash,
    messageHash: cctpRef.messageHash,
    cctpNonce: cctpRef.nonce,
    destFromBlock: destFromBlock.toString(),
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
  const destMessageTransmitter = destClientDeployment.cctp.messageTransmitter as `0x${string}`
  const nonce = record.artifacts.cctpNonce
  if (!nonce) {
    throw new Error('Missing cctpNonce artifact — cannot scope destination log query.')
  }
  const fromBlock = record.artifacts.destFromBlock
    ? BigInt(record.artifacts.destFromBlock)
    : 0n

  const destClient = getPublicClient(wagmiConfig, { chainId: record.meta.toChainId })
  if (!destClient) {
    throw new Error(`No wagmi public client for destination chain ${record.meta.toChainId}`)
  }

  // Park the record in 'waiting' so the stepper renders the "Waiting for cross-chain confirmation"
  // copy. The handler doesn't return here — poll() continues; the 'waiting' state is purely a
  // UI hint for the active row.
  await ctx.upsert(markWaiting(record))

  const result = await poll<`0x${string}`>(
    async (signal) => {
      if (signal.aborted) return null
      // Query MessageReceived logs filtered by the indexed `nonce` topic. eth_getLogs returns
      // only mined events — exactly what we want for "delivery confirmed". CCTP nonces are
      // globally-unique per source domain, so this match is unambiguous.
      const logs = await destClient.getLogs({
        address: destMessageTransmitter,
        event: MESSAGE_RECEIVED_EVENT,
        args: { nonce },
        fromBlock,
        toBlock: 'latest',
      })
      const first = logs[0]
      if (first?.transactionHash) return first.transactionHash as `0x${string}`
      return null
    },
    {
      intervalMs: 3_000,
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

  // We have ONE real signal (MessageReceived observed) — the intermediate stages between hub
  // burn and destination mint don't have distinct signals in mock mode (no Iris API; relayer's
  // /status reports only on hub-side txs). Walk through them as visual progress; finer-grained
  // detection is a real-CCTP-mode polish that requires Iris polling.
  //
  // Brief inter-stage delay so the stepper has time to render each row as "current" rather than
  // flashing through three transitions in a single frame. ~350ms feels intentional and still
  // completes the visual sequence in ~1s. Skipped between the last-but-one and terminal stage to
  // keep the success state landing promptly.
  const STAGE_VISUAL_DELAY_MS = 350
  let cursor = record
  const skipStages = ['iris-attestation-ready', 'client-mint-pending', 'client-mint-confirmed'] as const
  for (let i = 0; i < skipStages.length; i++) {
    const next = skipStages[i]!
    cursor = advance(cursor, next, next === 'client-mint-confirmed' ? { destTxHash: result.value } : {})
    await ctx.upsert(cursor)
    // Only delay before the next non-terminal hop; no point pausing before terminal.
    if (i < skipStages.length - 1) {
      await new Promise<void>(resolve => {
        const t = setTimeout(resolve, STAGE_VISUAL_DELAY_MS)
        ctx.signal.addEventListener('abort', () => { clearTimeout(t); resolve() }, { once: true })
      })
      if (ctx.signal.aborted) return
    }
  }

  // Balance refresh — the user just sent shielded USDC out, so their shielded balance dropped.
  if (kmIsUnlocked()) {
    void refreshShieldedBalances(kmGetWalletId()).catch(() => {})
  }
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
