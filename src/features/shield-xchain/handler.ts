// ABOUTME: Cross-chain shield handler — user signs PrivacyPoolClient.crossChainShield on the source client chain, which burns USDC via CCTP and carries the shield payload as hook data.
// ABOUTME: Mirrors unshield-xchain but flipped direction: burn on CLIENT → mint on HUB. The relayer (or hookRouter) delivers the message on the hub, atomically minting USDC and calling PrivacyPool.shield.

import { encodeFunctionData, pad, parseAbiItem } from 'viem'
import {
  getPublicClient,
  readContract,
  sendTransaction,
  signMessage,
  waitForTransactionReceipt,
  writeContract,
} from 'wagmi/actions'
import { erc20Abi, maxUint256 } from 'viem'
import { ethers } from 'ethers'
import { wagmiConfig } from '@/config/wagmi'
import { loadDeployments } from '@/config/deployments'
import { getNetworkConfig } from '@/config/network'
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
import { extractCctpMessageFromReceipt } from '@/lib/cctp'
import { cctpMaxFeeForKind } from '@/lib/relayer'
import { ensureChain } from '@/lib/network-switch'
import { advance, markFailed, markWaiting, patchArtifacts } from '@/lib/tx/reducer'
import { poll } from '@/lib/tx/poller'
import { scanCctpDeliveryWindow } from '../unshield-xchain/scan'
import type { StageHandler } from '@/lib/tx/executor'
import type { TxRecord } from '@/lib/tx/types'

// Same event signature the unshield-xchain handler uses for delivery detection on the destination.
// For shield-xchain the "destination" is the HUB (where the USDC mints) — symmetric setup.
const MESSAGE_RECEIVED_EVENT = parseAbiItem(
  'event MessageReceived(address indexed caller, uint32 sourceDomain, bytes32 indexed nonce, bytes32 sender, uint32 indexed finalityThresholdExecuted, bytes messageBody)',
)

/**
 * PrivacyPoolClient.crossChainShield ABI — the client-side entry point. Pulls USDC from the user,
 * approves TokenMessenger, and calls depositForBurnWithHook with the shield payload as hook data
 * (npk + encryptedBundle + shieldKey). The hub-side HookRouter atomically receives the CCTP
 * message and dispatches to PrivacyPool.shield with the recovered shield request.
 */
const PRIVACY_POOL_CLIENT_SHIELD_ABI = [
  {
    type: 'function',
    name: 'crossChainShield',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'amount', type: 'uint256' },
      { name: 'maxFee', type: 'uint256' },
      { name: 'minFinalityThreshold', type: 'uint32' },
      { name: 'npk', type: 'bytes32' },
      { name: 'encryptedBundle', type: 'bytes32[3]' },
      { name: 'shieldKey', type: 'bytes32' },
      { name: 'destinationCaller', type: 'bytes32' },
      { name: 'integrator', type: 'address' },
    ],
    outputs: [{ name: 'nonce', type: 'uint64' }],
  },
] as const

/**
 * Stage map for `shield-xchain`:
 *   1. `build-proof`              — sign RAILGUN_SHIELD, derive shieldPrivateKey, build the
 *                                    ShieldRequest off-chain (keyed to the HUB USDC address — the
 *                                    shield commitment lives on the hub once delivered).
 *   2. `submit-relayer`           — on the CLIENT chain: ensure USDC allowance for the
 *                                    PrivacyPoolClient, then call crossChainShield. The contract
 *                                    handles depositForBurnWithHook internally, emitting a CCTP
 *                                    MessageSent that the relayer will pick up.
 *   3. `client-burn-confirmed`    — wait for the client-chain receipt, extract the CCTP nonce
 *                                    from MessageSent, snapshot hub-chain head for the delivery
 *                                    scan cursor.
 *   4. `iris-attestation-pending` — poll the HUB chain for MessageReceived matching the nonce.
 *                                    Real CCTP mode goes through Iris attestation (relayer-side);
 *                                    mock mode short-circuits via the local CCTP relay. Either
 *                                    way our signal is the on-chain MessageReceived event.
 *   5. `iris-attestation-ready` / `hub-mint-pending` / `hub-mint-confirmed` — walked through in
 *                                    quick succession with brief delays so the stepper has time
 *                                    to render each stage. Same single-detection collapse as the
 *                                    inverse-direction handler.
 */
export const shieldXchainHandler: StageHandler<'shield-xchain'> = {
  kind: 'shield-xchain',
  // Iris/hub polling can be resumed; pre-receipt stages can't (RAILGUN_SHIELD sig + on-chain submit).
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
        case 'client-burn-confirmed':
          // Bridge stage — advance into the polling phase.
          await ctx.upsert(advance(record, 'iris-attestation-pending'))
          return
        case 'iris-attestation-pending':
          await runWaitForDelivery(record, ctx)
          return
        // Remaining stages are walked through inside runWaitForDelivery. Resume-on-load lands
        // here only if we crashed mid-walk; we're already terminal in that case.
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'shield-xchain handler failed'
      await ctx.upsert(markFailed(record, message))
    }
  },
}

async function runBuildProof(
  record: TxRecord<'shield-xchain'>,
  ctx: Parameters<typeof shieldXchainHandler.run>[1],
): Promise<void> {
  if (!kmIsUnlocked()) {
    throw new Error('Cross-chain deposit requires an unlocked shielded wallet.')
  }
  const railgunAddress = kmGetRailgunAddress()

  const deployments = await loadDeployments()
  // The shield request is keyed to the HUB USDC address because the commitment lives on the
  // hub merkle tree. The CLIENT-side USDC we're spending is just the source asset that gets
  // bridged through CCTP — it isn't what the SDK encodes into the note.
  const hubUsdcAddress = deployments.hub.cctp.usdc
  const privacyPoolAddress = deployments.hub.contracts.privacyPool

  // Resolve the client-chain deployment (used by submit-relayer + the approve preflight).
  const fromChainDeployment = deployments.clients.find(c => c.chainId === record.meta.fromChainId)
  if (!fromChainDeployment) {
    throw new Error(`No deployment for source chain ${record.meta.fromChainId}`)
  }
  const privacyPoolClientAddress = fromChainDeployment.contracts.privacyPoolClient
  const clientUsdcAddress = fromChainDeployment.cctp.usdc

  if (ctx.signal.aborted) throw new Error('cancelled')

  // RAILGUN_SHIELD is chain-agnostic (plain personal_sign of a constant string), but for UX we
  // still want the wallet on the source client chain so the prompt shows the right network and
  // the subsequent submit-relayer step doesn't have to switch a second time. Same pattern the
  // same-chain shield handler uses with meta.fromChainId.
  await ensureChain(record.meta.fromChainId)
  if (ctx.signal.aborted) throw new Error('cancelled')

  // Same flow as same-chain shield: prompt RAILGUN_SHIELD, derive the per-session key, ask the
  // engine to build the ShieldRequest. Cross-chain doesn't change the off-chain ZK construction —
  // only what we do with the result on-chain.
  const sigHex = await signMessage(wagmiConfig, { message: SHIELD_SIGNATURE_MESSAGE })
  if (ctx.signal.aborted) throw new Error('cancelled')

  const shieldPrivateKey = deriveShieldPrivateKey(sigHex)
  const request = await createShieldRequest(
    railgunAddress,
    record.meta.amount,
    hubUsdcAddress,
    shieldPrivateKey,
  )

  await ctx.upsert(advance(record, 'submit-relayer', {
    shieldRequest: {
      npk: request.npk,
      value: request.value.toString(),
      encryptedBundle: request.encryptedBundle,
      shieldKey: request.shieldKey,
    },
    privacyPoolAddress,
    privacyPoolClientAddress,
    clientUsdcAddress,
    hubUsdcAddress,
  }))
}

async function runSubmitAndBurn(
  record: TxRecord<'shield-xchain'>,
  ctx: Parameters<typeof shieldXchainHandler.run>[1],
): Promise<void> {
  const artifacts = record.artifacts
  const shieldRequest = artifacts.shieldRequest
  const privacyPoolClientAddress = artifacts.privacyPoolClientAddress
  const clientUsdcAddress = artifacts.clientUsdcAddress
  if (!shieldRequest || !privacyPoolClientAddress || !clientUsdcAddress) {
    throw new Error('Shield-xchain artifacts missing — re-run build-proof stage.')
  }

  const ownerCaptured = record.walletContext.evmAddress
  if (!ownerCaptured) {
    throw new Error('Cross-chain deposit requires a connected EVM wallet; none captured at submit time.')
  }
  const owner = ownerCaptured as `0x${string}`

  // The user may have switched networks between build-proof and submit; re-assert before the
  // approve + crossChainShield calls. ensureChain is a no-op when already on target.
  await ensureChain(record.meta.fromChainId)
  if (ctx.signal.aborted) throw new Error('cancelled')

  // 1. Ensure USDC allowance from the user to the PrivacyPoolClient. The client contract
  //    `safeTransferFrom`s the user's tokens; we need the allowance set first. Max-approve to
  //    avoid prompting again on subsequent cross-chain shields from the same chain.
  const allowance = await readContract(wagmiConfig, {
    address: clientUsdcAddress as `0x${string}`,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [owner, privacyPoolClientAddress as `0x${string}`],
  })
  if (ctx.signal.aborted) throw new Error('cancelled')

  if (allowance < record.meta.amount) {
    const approveHash = await writeContract(wagmiConfig, {
      address: clientUsdcAddress as `0x${string}`,
      abi: erc20Abi,
      functionName: 'approve',
      args: [privacyPoolClientAddress as `0x${string}`, maxUint256],
    })
    await waitForTransactionReceipt(wagmiConfig, { hash: approveHash })
    if (ctx.signal.aborted) throw new Error('cancelled')
  }

  // 2. destinationCaller = the HUB's hookRouter, in bytes32 form. Constrains who can call
  //    receiveMessage on the hub MessageTransmitter so only our atomic-delivery path executes.
  const deployments = await loadDeployments()
  const hubHookRouter = deployments.hub.contracts.hookRouter
  const destinationCaller = hubHookRouter && hubHookRouter !== ethers.ZeroAddress
    ? pad(hubHookRouter as `0x${string}`, { size: 32 })
    : `0x${'00'.repeat(32)}` as `0x${string}`

  // 3. maxFee = upper bound CCTP's MessageTransmitter accepts for `feeExecuted`. Iris sets the
  //    actual fee (1–1.3 bps depending on chain); we pass 2× the realistic estimate as headroom.
  //    Computed locally from amount, no relayer round-trip needed (the relayer's gas-cost quote
  //    isn't the relevant value here; CCTP's fast-transfer fee is independent of relayer ops).
  const maxFee = cctpMaxFeeForKind('shield-xchain', record.meta.amount)

  // 4. minFinalityThreshold = FAST (1000) when env says fast mode (Sepolia testing), else 0 which
  //    the contract resolves to STANDARD as the safe default. CCTPHookRouter on the hub knows
  //    how to handle both threshold values.
  const minFinalityThreshold = getNetworkConfig().mode === 'sepolia' ? 1000 : 0

  // 5. Submit the cross-chain shield on the CLIENT chain.
  const calldata = encodeFunctionData({
    abi: PRIVACY_POOL_CLIENT_SHIELD_ABI,
    functionName: 'crossChainShield',
    args: [
      record.meta.amount,
      maxFee,
      minFinalityThreshold,
      shieldRequest.npk as `0x${string}`,
      shieldRequest.encryptedBundle as readonly [`0x${string}`, `0x${string}`, `0x${string}`],
      shieldRequest.shieldKey as `0x${string}`,
      destinationCaller,
      ethers.ZeroAddress as `0x${string}`, // integrator: no fee routing for direct user shields
    ],
  })

  const hash = await sendTransaction(wagmiConfig, {
    to: privacyPoolClientAddress as `0x${string}`,
    data: calldata,
    value: 0n,
    chainId: record.meta.fromChainId,
  })
  if (ctx.signal.aborted) throw new Error('cancelled')

  // Use the client chain's public client to wait for the receipt + extract the CCTP MessageSent
  // event. wagmi's default `waitForTransactionReceipt` is chain-agnostic but we pass chainId for
  // clarity (and so it doesn't accidentally probe the hub).
  const receipt = await waitForTransactionReceipt(wagmiConfig, {
    hash,
    chainId: record.meta.fromChainId,
  })

  const cctpRef = extractCctpMessageFromReceipt({
    logs: receipt.logs,
    messageTransmitterAddress: deployments.clients.find(c => c.chainId === record.meta.fromChainId)!
      .cctp.messageTransmitter as `0x${string}`,
  })
  if (!cctpRef) {
    throw new Error('No CCTP MessageSent log in client tx receipt — cross-chain delivery cannot be tracked.')
  }

  // Snapshot the HUB chain's current head so the delivery scan starts from now, not history.
  const hubClient = getPublicClient(wagmiConfig, { chainId: getNetworkConfig().hub.chainId })
  if (!hubClient) {
    throw new Error('No wagmi public client for hub chain')
  }
  const hubFromBlock = await hubClient.getBlockNumber()

  await ctx.upsert(advance(record, 'client-burn-confirmed', {
    sourceTxHash: hash,
    messageHash: cctpRef.messageHash,
    cctpNonce: cctpRef.nonce,
    destFromBlock: hubFromBlock.toString(),
  }))
}

async function runWaitForDelivery(
  record: TxRecord<'shield-xchain'>,
  ctx: Parameters<typeof shieldXchainHandler.run>[1],
): Promise<void> {
  const deployments = await loadDeployments()
  const hubChainId = getNetworkConfig().hub.chainId
  const hubMessageTransmitter = deployments.hub.cctp.messageTransmitter as `0x${string}`
  // CCTP V2 destination scan: we can't filter on the indexed `nonce` topic. V2's nonce slot is
  // bytes32(0) on outbound MessageSent; the destination contract emits an Iris-assigned
  // `eventNonce` which isn't derivable from the source side. So we drop the topic filter and
  // identify ours by looking inside the messageBody's hookData for a unique-per-tx marker.
  // For shield-xchain that marker is `encryptedBundle[0]` — fresh randomness generated by the
  // Railgun SDK at shield-request time, so unique with overwhelming probability.
  const shieldRequest = record.artifacts.shieldRequest
  if (!shieldRequest?.encryptedBundle?.[0]) {
    throw new Error('Missing shieldRequest.encryptedBundle artifact — cannot identify destination delivery.')
  }
  const uniqueMarker = shieldRequest.encryptedBundle[0].slice(2).toLowerCase()
  const hubClient = getPublicClient(wagmiConfig, { chainId: hubChainId })
  if (!hubClient) {
    throw new Error('No wagmi public client for hub chain')
  }

  let cursor = markWaiting(record)
  await ctx.upsert(cursor)

  let scanFromBlock = record.artifacts.destFromBlock
    ? BigInt(record.artifacts.destFromBlock)
    : 0n
  const maxLogRange = BigInt(getNetworkConfig().maxLogRange)

  const result = await poll<`0x${string}`>(
    async (signal) => {
      if (signal.aborted) return null
      const outcome = await scanCctpDeliveryWindow({
        getBlockNumber: () => hubClient.getBlockNumber(),
        getLogsForRange: (fromBlock, toBlock) => hubClient.getLogs({
          address: hubMessageTransmitter,
          event: MESSAGE_RECEIVED_EVENT,
          fromBlock,
          toBlock,
        }),
        matchPredicate: (log) => {
          const body = log.args.messageBody
          return typeof body === 'string' && body.toLowerCase().includes(uniqueMarker)
        },
        scanFromBlock,
        maxLogRange,
      })
      if (outcome.kind === 'match') return outcome.txHash
      if (outcome.kind === 'no-new-blocks') return null

      scanFromBlock = outcome.nextScanFromBlock
      cursor = patchArtifacts(cursor, { destFromBlock: scanFromBlock.toString() })
      await ctx.upsert(cursor)
      return null
    },
    {
      intervalMs: 3_000,
      jitter: 0.2,
      timeoutMs: 10 * 60_000,
      signal: ctx.signal,
    },
  )

  if (result.status !== 'done') {
    throw new Error(
      result.status === 'aborted'
        ? 'cancelled'
        : 'Timed out waiting for cross-chain delivery — check the hub chain manually.',
    )
  }

  // Walk through the three intermediate stages with brief gaps so the stepper renders each row
  // as "current" rather than flashing through transitions in a single frame. Same pattern as the
  // inverse-direction handler — see its docstring for the visual-delay rationale.
  const STAGE_VISUAL_DELAY_MS = 350
  const skipStages = ['iris-attestation-ready', 'hub-mint-pending', 'hub-mint-confirmed'] as const
  for (let i = 0; i < skipStages.length; i++) {
    const next = skipStages[i]!
    cursor = advance(cursor, next, next === 'hub-mint-confirmed' ? { destTxHash: result.value } : {})
    await ctx.upsert(cursor)
    if (i < skipStages.length - 1) {
      await new Promise<void>(resolve => {
        const t = setTimeout(resolve, STAGE_VISUAL_DELAY_MS)
        ctx.signal.addEventListener('abort', () => { clearTimeout(t); resolve() }, { once: true })
      })
      if (ctx.signal.aborted) return
    }
  }

  // The shield commitment is now on the hub merkle tree — refresh balances so the UI ticks up.
  if (kmIsUnlocked()) {
    void refreshShieldedBalances(kmGetWalletId()).catch(() => {})
  }
}
