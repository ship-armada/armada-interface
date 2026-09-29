// ABOUTME: Recovery round-trip (spec G-6): for each tx kind, the notes / events it leaves on chain run through the SDK's real
// ABOUTME: reconstructHistory → historyEntryToTxRecord, and the recovered figures must equal the recorded ones (txFigures).

import { describe, it, expect, beforeAll } from 'vitest'
import { reconstructHistory, encodeSelfMetadata } from '@armada/sdk'
import type { HistoryEntry } from '@armada/sdk'
import { TransactNote, initPoseidonPromise, OutputType } from '@armada/sdk/core'
import { historyEntryToTxRecord, withConsolidationTxids, type HistoryMapContext } from '@/lib/shielded/history'
import { encodeTxSelfMetadata } from '@/lib/shielded/selfMetadata'
import { txFigures } from '@/lib/fees/txFigures'
import { spendDraft } from '@/lib/tx/spendDraft'
import { selfSendAsMerge } from '@/lib/tx/selfSend'
import { cctpFastFeeForAmount, cctpMaxFeeForKind } from '@/lib/relayer'
import { getNetworkConfig } from '@/config/network'
import type { TxKind, TxRecord } from '@/lib/tx/types'
import { A, F, FOLD, G, P, txRecord } from '@/test/fixtures/txValues'

// The SDK's own history types (TXO, SpentNullifier, …) are internal to its bundle; these mirror the fields
// reconstructHistory reads.
type NoteOrigin = 'shield' | 'transact'
interface Txo {
  tree: number; position: number; tokenHash: string; value: bigint; blockNumber: number; txid: string
  origin: NoteOrigin; memo?: string; shieldFee?: bigint; random: string; notePublicKey: bigint
}

const NK = 987654321n
const OWN_0ZK = '0zk_own'
const BOB_0ZK = '0zk_bob'
const RELAYER_0ZK = '0zk_relayer'
const USDC_HASH = 'aa'.repeat(32)
const SHARES_HASH = 'bb'.repeat(32)
const USDC = '0x00000000000000000000000000000000000000c1' as const
const SHARES = '0x00000000000000000000000000000000000000c2' as const
const ADAPTER = '0x00000000000000000000000000000000000000ad'
const EOA = '0x1234567890abcdef1234567890abcdef12345678'
const TOKEN_DATA = { tokenType: 0, tokenAddress: USDC, tokenSubID: 0n }

/** The chain state a set of txs leaves for this wallet: its notes, the nullifiers of the ones it spent, and events. */
class Chain {
  readonly ownedTxos: Txo[] = []
  readonly spentNullifiers: { tree: number; nullifier: bigint; txid: string; blockNumber: number }[] = []
  readonly unshields: { to: string; tokenData: typeof TOKEN_DATA; amount: bigint; fee: bigint; blockNumber: number; txid: string }[] = []
  readonly sentOutputs: { txid: string; blockNumber: number; tokenHash: string; value: bigint; recipientShieldedAddress: string; outputType: number; memo?: string }[] = []
  readonly shieldRelayerFees = new Map<string, bigint>()
  private position = 0

  /** A note the wallet owns, created in `txid`. */
  note(txid: string, value: bigint, opts: { origin?: NoteOrigin; tokenHash?: string; memo?: string; shieldFee?: bigint } = {}): Txo {
    const txo: Txo = {
      tree: 0, position: this.position++, tokenHash: opts.tokenHash ?? USDC_HASH, value, blockNumber: 10, txid,
      origin: opts.origin ?? 'transact', random: '00'.repeat(16), notePublicKey: 0n,
      ...(opts.memo !== undefined ? { memo: opts.memo } : {}), ...(opts.shieldFee !== undefined ? { shieldFee: opts.shieldFee } : {}),
    }
    this.ownedTxos.push(txo)
    return txo
  }

  /** Earlier-received notes of `values`, spent as the inputs of `txid`. */
  spend(txid: string, values: bigint[], tokenHash = USDC_HASH): void {
    for (const value of values) {
      const input = this.note(`0xfund${this.position}`, value, { tokenHash })
      this.spentNullifiers.push({ tree: 0, nullifier: TransactNote.getNullifier(NK, input.position), txid, blockNumber: 20 })
    }
  }

  /** An output `txid` sent (recovered sender-side): a transfer to a recipient, or the broadcaster's fee note. */
  sent(txid: string, value: bigint, outputType: number, recipient: string): void {
    this.sentOutputs.push({ txid, blockNumber: 20, tokenHash: USDC_HASH, value, recipientShieldedAddress: recipient, outputType })
  }

  unshield(txid: string, to: string, amount: bigint): void {
    this.unshields.push({ to, tokenData: TOKEN_DATA, amount, fee: 0n, blockNumber: 20, txid })
  }

  /** The records history recovery rebuilds for `txid` — through the SDK's real reconstruction and the app's mapper. */
  recover(txid: string, ctx: Partial<HistoryMapContext> = {}): TxRecord[] {
    const entries = reconstructHistory({
      ownedTxos: this.ownedTxos, spentNullifiers: this.spentNullifiers, unshields: this.unshields, sentOutputs: this.sentOutputs,
      shieldRelayerFees: this.shieldRelayerFees, nullifyingKey: NK, shieldedAddress: OWN_0ZK,
      resolveToken: (hash: string) => (hash === USDC_HASH ? USDC : hash === SHARES_HASH ? SHARES : undefined),
      usdcHash: USDC_HASH, yieldAdapterAddress: ADAPTER,
    } as never) as HistoryEntry[]
    const mapCtx = withConsolidationTxids(entries, { hubChainId: getNetworkConfig().hub.chainId, usdcAddress: USDC, ...ctx })
    return entries
      .filter((e) => e.txid === txid)
      .map((e) => historyEntryToTxRecord(e, 'w', mapCtx, 0))
      .filter((r): r is TxRecord => r !== null)
  }
}

/** The one record recovery rebuilds for `txid`. */
function recoveredOne(chain: Chain, txid: string, ctx?: Partial<HistoryMapContext>): TxRecord {
  const records = chain.recover(txid, ctx)
  expect(records).toHaveLength(1)
  return records[0]!
}

const spendInput = { recipient: BOB_0ZK, toChainId: 0, perProofFee: F, protocolFee: 0n, cctpFee: 0n, feeCacheId: '', broadcasterShieldedAddress: RELAYER_0ZK }
const authored = <K extends TxKind>(kind: K, meta: object) => txRecord(kind, meta)

beforeAll(async () => {
  await initPoseidonPromise
})

describe('recovered figures equal the recorded ones (G-6)', () => {
  describe('private send (PS-8, PS-13, PS-14, PS-18, PS-20)', () => {
    it.each([
      ['normal', [15_000_000n], [A], [F]],
      ['split into 2 proofs', [7_000_000n, 7_000_000n], [6_000_000n, 4_000_000n], [F, F]],
      ['fold-in (change folded into the fee — no change note)', [A + F + FOLD], [A], [F + FOLD]],
      ['sweep (dust swept into the change)', [12_000_000n, 100_000n, 200_000n], [A], [F]],
    ])('%s', (_variant, inputs, recipientNotes, feeNotes) => {
      const chain = new Chain()
      const fee = feeNotes.reduce((a, b) => a + b, 0n)
      const change = inputs.reduce((a, b) => a + b, 0n) - A - fee
      chain.spend('0xsend', inputs)
      if (change > 0n) chain.note('0xsend', change)
      for (const value of recipientNotes) chain.sent('0xsend', value, OutputType.Transfer, BOB_0ZK)
      for (const value of feeNotes) chain.sent('0xsend', value, OutputType.BroadcasterFee, RELAYER_0ZK)

      const recorded = authored('transfer-shielded', spendDraft('transfer-shielded', { ...spendInput, amount: A, fee }).meta)
      expect(txFigures(recoveredOne(chain, '0xsend'))).toEqual(txFigures(recorded))
    })

    it('the recipient\'s receipt: every note the send paid, folded into one amount (PS-10, PS-39)', () => {
      const chain = new Chain()
      chain.note('0xpaid', 6_000_000n)
      chain.note('0xpaid', 4_000_000n)
      expect(txFigures(recoveredOne(chain, '0xpaid'))).toEqual({ model: 'received', headline: A })
    })

    it('a send to your own private address reads as the merge Activity shows it (PS-7)', () => {
      const chain = new Chain()
      chain.spend('0xself', [15_000_000n])
      chain.note('0xself', A) // the note sent to yourself comes straight back
      chain.note('0xself', 15_000_000n - A - F)
      chain.sent('0xself', A, OutputType.Transfer, OWN_0ZK)
      chain.sent('0xself', F, OutputType.BroadcasterFee, RELAYER_0ZK)

      const recorded = authored('transfer-shielded', spendDraft('transfer-shielded', { ...spendInput, recipient: OWN_0ZK, amount: A, fee: F }).meta)
      expect(txFigures(recoveredOne(chain, '0xself'))).toEqual(txFigures(selfSendAsMerge(recorded, OWN_0ZK)))
    })
  })

  describe('unshield (UN-1…UN-3)', () => {
    it('on the hub', () => {
      const chain = new Chain()
      chain.spend('0xunshield', [15_000_000n])
      chain.note('0xunshield', 15_000_000n - A - F)
      chain.sent('0xunshield', F, OutputType.BroadcasterFee, RELAYER_0ZK)
      chain.unshield('0xunshield', EOA, A)

      const recorded = authored('unshield-local', spendDraft('unshield-local', { ...spendInput, recipient: EOA, amount: A, fee: F }).meta)
      const recovered = recoveredOne(chain, '0xunshield')
      expect(recovered.kind).toBe('unshield-local')
      expect(txFigures(recovered)).toEqual(txFigures(recorded))
    })

    it('cross-chain: recognised from its hub CCTP message — its Unshield event names the final recipient, not the pool (F2, #72)', () => {
      const chain = new Chain()
      chain.spend('0xexit', [15_000_000n])
      chain.note('0xexit', 15_000_000n - A - F)
      chain.sent('0xexit', F, OutputType.BroadcasterFee, RELAYER_0ZK)
      chain.unshield('0xexit', EOA, A) // TransactModule emits Unshield(finalRecipient, …)
      const dest = getNetworkConfig().clients[0]!
      const xchainByTxid = new Map([['0xexit', {
        destinationDomain: dest.domain,
        // The CCTP BurnMessage's mintRecipient is the destination pool contract, not the user.
        recipient: '0x00000000000000000000000000000000000000de' as const,
        maxFee: cctpMaxFeeForKind('unshield-xchain', A),
      }]])

      const recorded = authored('unshield-xchain', spendDraft('unshield-xchain', {
        ...spendInput, recipient: EOA, toChainId: dest.chainId, amount: A, fee: F, cctpFee: cctpFastFeeForAmount(A),
      }).meta)
      const recovered = recoveredOne(chain, '0xexit', { xchainByTxid })
      expect(recovered).toMatchObject({ kind: 'unshield-xchain', meta: { recipient: EOA, toChainId: dest.chainId } })
      expect(txFigures(recovered)).toEqual(txFigures(recorded))
    })
  })

  describe('vault (YD-1…YD-3, YD-10…YD-12)', () => {
    it('deposit', () => {
      const chain = new Chain()
      chain.spend('0xlend', [15_000_000n])
      chain.note('0xlend', 15_000_000n - A - F)
      chain.sent('0xlend', F, OutputType.BroadcasterFee, RELAYER_0ZK)
      chain.unshield('0xlend', ADAPTER, A)
      chain.note('0xlend', 9_523_809n, { origin: 'shield', tokenHash: SHARES_HASH }) // the minted shares, shielded to us

      const recorded = authored('yield-deposit', { amount: A, broadcasterFeeAmount: F, broadcasterFeePerProof: F, broadcasterShieldedAddress: RELAYER_0ZK })
      expect(txFigures(recoveredOne(chain, '0xlend'))).toEqual(txFigures(recorded))
    })

    it('withdrawal, reconciled to the redeemed gross', () => {
      const chain = new Chain()
      chain.spend('0xredeem', [9_523_809n], SHARES_HASH)
      chain.unshield('0xredeem', ADAPTER, 9_523_809n)
      chain.note('0xredeem', G - F, { origin: 'shield' }) // redeemAndShield re-shields the net to us …
      chain.shieldRelayerFees.set('0xredeem', F) // … and the fee to the relayer

      const recorded = authored('yield-withdraw', { amount: G, shares: 9_523_809n, broadcasterFeeAmount: F, broadcasterShieldedAddress: RELAYER_0ZK, amountIsEstimate: false })
      expect(txFigures(recoveredOne(chain, '0xredeem'))).toEqual(txFigures(recorded))
    })
  })

  describe('shield (SH-1…SH-3)', () => {
    it('gasless: the relayer fee recovered gross, so the deposit total is exact', () => {
      const chain = new Chain()
      chain.note('0xshield', A - F - P, { origin: 'shield', shieldFee: P })
      chain.shieldRelayerFees.set('0xshield', F)

      const recorded = authored('shield', { amount: A, fromChainId: getNetworkConfig().hub.chainId, useGasless: true, feeAmount: F, protocolFee: P })
      expect(txFigures(recoveredOne(chain, '0xshield'))).toEqual(txFigures(recorded))
    })

    it('direct', () => {
      const chain = new Chain()
      chain.note('0xdirect', A - P, { origin: 'shield', shieldFee: P })

      const recorded = authored('shield', { amount: A, fromChainId: getNetworkConfig().hub.chainId, protocolFee: P })
      expect(txFigures(recoveredOne(chain, '0xdirect'))).toEqual(txFigures(recorded))
    })
  })

  describe('merge (MG-1, MG-2)', () => {
    it('a 2-proof USDC merge — its merge tag rides on a change note', () => {
      const chain = new Chain()
      const notes = Array.from({ length: 11 }, () => 1_000_000n)
      chain.spend('0xmerge', notes)
      const merged = 11_000_000n - 2n * F
      chain.note('0xmerge', merged - 3_000_000n, { memo: encodeSelfMetadata(encodeTxSelfMetadata({ consolidation: true })!) })
      chain.note('0xmerge', 3_000_000n)
      chain.sent('0xmerge', F, OutputType.BroadcasterFee, RELAYER_0ZK)
      chain.sent('0xmerge', F, OutputType.BroadcasterFee, RELAYER_0ZK)

      const recorded = authored('consolidate', {
        amount: 0n, tokenAddress: USDC, tokenSymbol: 'USDC', broadcasterFeeAmount: 2n * F, broadcasterFeePerProof: F,
        broadcasterShieldedAddress: RELAYER_0ZK, notesMerged: 11, notesCreated: 2,
      })
      expect(txFigures(recoveredOne(chain, '0xmerge'))).toEqual(txFigures(recorded))
    })

    it('a vault-share merge whose USDC fee was an exact cover — the tag rides only on the share leg (F16, #81)', () => {
      // The fee group covers 2F exactly: no USDC change note, so no tag on the USDC leg — only the merged share note
      // carries it, and that leg is dropped (USDC-only history). The merge is found by its tagged share leg's txid.
      const chain = new Chain()
      const tag = encodeSelfMetadata(encodeTxSelfMetadata({ consolidation: true })!)
      chain.spend('0xsharemerge', [1_000n, 2_000n, 3_000n], SHARES_HASH)
      chain.note('0xsharemerge', 6_000n, { tokenHash: SHARES_HASH, memo: tag })
      chain.spend('0xsharemerge', [2n * F])
      chain.sent('0xsharemerge', F, OutputType.BroadcasterFee, RELAYER_0ZK)
      chain.sent('0xsharemerge', F, OutputType.BroadcasterFee, RELAYER_0ZK)

      const recorded = authored('consolidate', {
        amount: 0n, tokenAddress: SHARES, tokenSymbol: 'Vault shares', broadcasterFeeAmount: 2n * F, broadcasterFeePerProof: F,
        broadcasterShieldedAddress: RELAYER_0ZK, notesMerged: 3, notesCreated: 1,
      })
      const recovered = recoveredOne(chain, '0xsharemerge')
      expect(recovered.kind).toBe('consolidate')
      expect(txFigures(recovered)).toEqual(txFigures(recorded))
    })
  })
})
