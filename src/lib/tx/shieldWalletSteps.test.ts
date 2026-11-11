// ABOUTME: Tests for shieldWalletSteps / shieldWalletInteractionsComplete — the shield's wallet checklist rows: Approve (exact
// ABOUTME: amount, omitted when the allowance covers it) + Submit, or gasless Authorize + Sign, with each row's status and why.

import { describe, it, expect } from 'vitest'
import { shieldWalletInteractionsComplete, shieldWalletSteps } from './shieldWalletSteps'
import type { TxRecord } from './types'

const base: TxRecord<'shield'> = {
  id: '01JX',
  kind: 'shield',
  executionState: 'active',
  stage: 'build-proof',
  stagesCompleted: [],
  updatedSeq: 1,
  createdAt: 0,
  updatedAt: 0,
  meta: { amount: 5_000_000n, feeCacheId: 'fc-1', fromChainId: 31337 },
  artifacts: {},
  walletContext: {
    evmAddress: '0xabc',
    shieldedWalletId: 'rg-1',
    sourceChainId: 31337,
  },
}

describe('shieldWalletSteps', () => {
  it('renders Approve + Submit rows before a record exists', () => {
    // WHY: build-proof now runs silently (ephemeral shieldPrivateKey, no wallet prompt) — the
    // pre-record snapshot starts with Approve pending, not an "Authorize" placeholder.
    const steps = shieldWalletSteps(null, 5_000_000n)
    expect(steps.map(s => s.label)).toEqual([
      'Approve 5.00 USDC',
      'Submit 5.00 USDC shield',
    ])
  })

  it('labels the approval with the amount — the handler approves exactly it, never unlimited (4E; was F26, #83)', () => {
    // WHY: the row has to describe what the wallet prompt asks for, which is now exactly the shield amount.
    const steps = shieldWalletSteps(null, 5_000_000n)
    expect(steps[0]!.label).toBe('Approve 5.00 USDC')
  })

  it('omits approve row when allowance was sufficient', () => {
    const record: TxRecord<'shield'> = {
      ...base,
      stage: 'submit-relayer',
      stagesCompleted: ['build-proof'],
      artifacts: { approveSkipped: true },
    }
    const steps = shieldWalletSteps(record, 5_000_000n)
    expect(steps.map(s => s.label)).toEqual(['Submit 5.00 USDC shield'])
    expect(steps[0]!.status).toBe('loading')
  })

  it('gasless: authorize + sign rows, both done once build-proof captures the signatures (S-M4)', () => {
    const building: TxRecord<'shield'> = {
      ...base,
      meta: { ...base.meta, useGasless: true },
      stage: 'build-proof',
      stagesCompleted: [],
    }
    const buildingSteps = shieldWalletSteps(building, 5_000_000n)
    expect(buildingSteps.map(s => s.label)).toEqual(['Authorize 5.00 USDC', 'Sign shield transaction'])
    expect(buildingSteps.map(s => s.status)).toEqual(['loading', 'pending'])

    // Intermediate: permit signed (permitSigned artifact) but ShieldIntent still pending —
    // Authorize flips to done, Sign becomes the live prompt (S-M4b).
    const permitSigned: TxRecord<'shield'> = {
      ...building,
      artifacts: { ...building.artifacts, permitSigned: true },
    }
    expect(shieldWalletSteps(permitSigned, 5_000_000n).map(s => s.status)).toEqual(['done', 'loading'])

    const signed: TxRecord<'shield'> = {
      ...building,
      stage: 'submit-relayer',
      stagesCompleted: ['build-proof'],
    }
    expect(shieldWalletSteps(signed, 5_000_000n).map(s => s.status)).toEqual(['done', 'done'])
  })

  it('wallet interactions incomplete until authorize, approve, and deposit submit', () => {
    const mid: TxRecord<'shield'> = {
      ...base,
      stage: 'submit-relayer',
      stagesCompleted: ['build-proof'],
      artifacts: { sourceTxHash: '0xabc' as `0x${string}` },
    }
    expect(shieldWalletInteractionsComplete(mid)).toBe(false)

    const done: TxRecord<'shield'> = {
      ...mid,
      artifacts: {
        sourceTxHash: '0xabc' as `0x${string}`,
        approveTxHash: '0xdef' as `0x${string}`,
      },
    }
    expect(shieldWalletInteractionsComplete(done)).toBe(true)
  })

  it('gasless: complete once build-proof captures the permit (no wallet prompt at submit)', () => {
    const beforeSign: TxRecord<'shield'> = {
      ...base,
      meta: { ...base.meta, useGasless: true },
      stage: 'build-proof',
      stagesCompleted: [],
    }
    expect(shieldWalletInteractionsComplete(beforeSign)).toBe(false)

    // Permit signed → build-proof done. The relayer broadcasts the submit (no further prompt), so
    // wallet interactions are complete even without a sourceTxHash yet.
    const signed: TxRecord<'shield'> = {
      ...beforeSign,
      stage: 'submit-relayer',
      stagesCompleted: ['build-proof'],
    }
    expect(shieldWalletInteractionsComplete(signed)).toBe(true)
  })

  it('tells "in your wallet" from "confirming on chain" for the approval (4B)', () => {
    const prompting = { ...base, stage: 'submit-relayer', executionState: 'waiting', stagesCompleted: ['build-proof'] } as TxRecord<'shield'>
    expect(shieldWalletSteps(prompting, 5_000_000n)[0]).toMatchObject({ status: 'loading', detail: 'In your wallet' })

    const sent = { ...prompting, executionState: 'active', artifacts: { approveSubmittedHash: '0xa' } } as unknown as TxRecord<'shield'>
    expect(shieldWalletSteps(sent, 5_000_000n)[0]).toMatchObject({ status: 'confirming', detail: 'Confirming on chain' })
    // The shield prompt hasn't opened yet while the approval confirms.
    expect(shieldWalletSteps(sent, 5_000_000n)[1]).toMatchObject({ status: 'pending' })

    const confirmed = { ...sent, artifacts: { approveSubmittedHash: '0xa', approveTxHash: '0xa' } } as unknown as TxRecord<'shield'>
    expect(shieldWalletSteps(confirmed, 5_000_000n)[0]).toMatchObject({ status: 'done' })
  })

  it('a gasless prompt reads "In your wallet" while open (4B)', () => {
    const gasless = { ...base, meta: { ...base.meta, useGasless: true } } as TxRecord<'shield'>
    expect(shieldWalletSteps(gasless, 5_000_000n)[0]).toMatchObject({ status: 'loading', detail: 'In your wallet' })
  })

  it('the active row says why the wallet is asking — exactly what each prompt does (4C)', () => {
    const gasless = { ...base, meta: { ...base.meta, useGasless: true } } as TxRecord<'shield'>
    expect(shieldWalletSteps(gasless, 5_000_000n)[0]?.why).toBe('Lets Armada\u2019s shield contract take exactly 5.00 USDC for this shield. No gas.')
    const permitted = { ...gasless, artifacts: { permitSigned: true } } as unknown as TxRecord<'shield'>
    expect(shieldWalletSteps(permitted, 5_000_000n)[1]?.why).toBe('Locks in where your USDC goes, so the relayer can submit it but not change it. No gas.')
    // Only the active row explains itself.
    expect(shieldWalletSteps(permitted, 5_000_000n)[0]?.why).toBeUndefined()

    const prompting = { ...base, stage: 'submit-relayer', executionState: 'waiting', stagesCompleted: ['build-proof'] } as TxRecord<'shield'>
    expect(shieldWalletSteps(prompting, 5_000_000n)[0]?.why).toBe('Lets Armada\u2019s contract take exactly 5.00 USDC from your wallet.')
    const shieldPrompt = { ...prompting, artifacts: { approveSkipped: true } } as unknown as TxRecord<'shield'>
    expect(shieldWalletSteps(shieldPrompt, 5_000_000n)[0]?.why).toBe('Sends 5.00 USDC to the privacy pool. You pay the network gas.')
    const xchainPrompt = { ...shieldPrompt, kind: 'shield-xchain' } as unknown as TxRecord<'shield-xchain'>
    expect(shieldWalletSteps(xchainPrompt, 5_000_000n)[0]?.why).toBe('Sends 5.00 USDC across chains to the privacy pool. You pay the network gas.')
  })
})

