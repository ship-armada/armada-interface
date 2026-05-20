// ABOUTME: SDK-side helpers for transfer-shielded — generateTransferProof + populateProvedTransfer. Direct user-submitted tx (no relayer for v1).
// ABOUTME: Mirrors lib/railgun/unshield.ts in structure; the only differences are the 0zk recipient and two extra SDK args (showSenderAddressToRecipient, memoText).

import { loadHubNetwork } from './network'

type RailgunSdk = typeof import('@railgun-community/wallet')
type SharedModels = typeof import('@railgun-community/shared-models')

async function railgunSdk(): Promise<RailgunSdk> {
  return import('@railgun-community/wallet')
}
async function sharedModels(): Promise<SharedModels> {
  return import('@railgun-community/shared-models')
}

/**
 * Gas details — same as the unshield helper. EIP-1559 (Type2) is required by Railgun SDK for
 * Hardhat, and our patched NetworkName.Hardhat covers both local Anvil and Sepolia.
 */
async function buildGasDetails(): Promise<unknown> {
  const { EVMGasType } = await sharedModels()
  return {
    evmGasType: EVMGasType.Type2,
    gasEstimate: 2_000_000n,
    maxFeePerGas: 2_000_000_000n,
    maxPriorityFeePerGas: 1_000_000_000n,
  }
}

/**
 * Generate the ZK transfer proof for a single 0zk recipient. Caches the proof in engine memory
 * keyed by the inputs; the subsequent `populateProvedTransfer` MUST pass identical args.
 *
 * `showSenderAddressToRecipient: false` keeps the sender's 0zk address hidden from the recipient
 * — privacy default. `memoText: undefined` for v1; a memo field is a future UX add.
 */
export async function generateTransferProofForRecipient(opts: {
  walletId: string
  encryptionKey: string
  tokenAddress: string
  recipient: string
  amount: bigint
  onProgress?: (fraction: number) => void
}): Promise<void> {
  if (!opts.recipient.startsWith('0zk')) {
    throw new Error('generateTransferProofForRecipient: recipient must be a 0zk Railgun address')
  }
  await loadHubNetwork()
  const [{ generateTransferProof }, { TXIDVersion, NetworkName }] = await Promise.all([
    railgunSdk(),
    sharedModels(),
  ])
  await generateTransferProof(
    TXIDVersion.V2_PoseidonMerkle,
    NetworkName.Hardhat,
    opts.walletId,
    opts.encryptionKey,
    false, // showSenderAddressToRecipient — privacy default
    undefined, // memoText — no memo for v1
    [
      {
        tokenAddress: opts.tokenAddress,
        amount: opts.amount,
        recipientAddress: opts.recipient,
      },
    ],
    [], // nftAmountRecipients
    undefined, // broadcasterFeeRecipient — direct user submit, no relayer fee
    true, // sendWithPublicWallet
    undefined, // overallBatchMinGasPrice
    (progress) => opts.onProgress?.(progress / 100),
  )
}

/**
 * Populate the transaction object using the proof cached above. Inputs MUST match the proof call.
 *
 * Returns raw `to` + `data` + `value` — the handler submits via the connected EVM wallet rather
 * than letting the SDK call its own provider (which would use a non-user signer).
 */
export async function populateTransferTransaction(opts: {
  walletId: string
  tokenAddress: string
  recipient: string
  amount: bigint
}): Promise<{ to: `0x${string}`; data: `0x${string}`; value: bigint }> {
  const [{ populateProvedTransfer }, { TXIDVersion, NetworkName }] = await Promise.all([
    railgunSdk(),
    sharedModels(),
  ])
  const gasDetails = await buildGasDetails()
  const result = await populateProvedTransfer(
    TXIDVersion.V2_PoseidonMerkle,
    NetworkName.Hardhat,
    opts.walletId,
    false, // showSenderAddressToRecipient
    undefined, // memoText
    [
      {
        tokenAddress: opts.tokenAddress,
        amount: opts.amount,
        recipientAddress: opts.recipient,
      },
    ],
    [], // nftAmountRecipients
    undefined, // broadcasterFeeRecipient
    true, // sendWithPublicWallet
    undefined, // overallBatchMinGasPrice
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    gasDetails as any,
  )
  const tx = result.transaction
  if (!tx.to || !tx.data) {
    throw new Error('populateTransferTransaction: SDK returned an incomplete transaction')
  }
  return {
    to: tx.to as `0x${string}`,
    data: tx.data as `0x${string}`,
    value: tx.value ? BigInt(tx.value.toString()) : 0n,
  }
}
