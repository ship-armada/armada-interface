// ABOUTME: Tests for buildProcessingView — maps a live TxRecord to the processing view model.
// ABOUTME: Covers stage mapping from the real lifecycle, active-index tracking, completion, and xchain rows naming their chains.

import { describe, it, expect } from 'vitest'
import { buildProcessingView } from './processingView'
import type { TxKind, TxRecord, TxExecutionState } from '@/lib/tx/types'
import { getChainById, getNetworkConfig } from '@/config/network'

const HUB = getNetworkConfig().hub
const CLIENT_ID = getNetworkConfig().clients[0]?.chainId ?? 0
const CLIENT = getChainById(CLIENT_ID)?.name ?? ''

// buildProcessingView only reads kind/stage/executionState/artifacts (+ a cross-chain record's chain ids from meta); a
// partial cast is sufficient. Cross-chain records go from the first client chain to the hub, or the reverse.
function rec(
  kind: TxKind,
  stage: string,
  executionState: TxExecutionState,
  artifacts: Record<string, unknown> = {},
): TxRecord {
  const meta = kind === 'unshield-xchain' ? { toChainId: CLIENT_ID } : kind === 'shield-xchain' ? { fromChainId: CLIENT_ID } : {}
  return { kind, stage, executionState, artifacts, meta } as unknown as TxRecord
}

describe('buildProcessingView', () => {
  it('maps a shield record to its real lifecycle stages + active index', () => {
    const view = buildProcessingView(rec('shield', 'submit-relayer', 'active'))
    // The terminal `hub-confirmed` stage is folded into the last rendered row (it's not drawn as a
    // separate "confirmed" step); the row order stops at the `hub-pending` action row.
    expect(view.stages.map((s) => s.id)).toEqual([
      'build-proof',
      'submit-relayer',
      'hub-pending',
    ])
    expect(view.activeStageIndex).toBe(1)
    expect(view.completed).toBe(false)
    expect(view.cardCopy.title).toBe('Your USDC is being shielded')
  })

  it('resolves the shield submit-relayer subtitle by state: confirm-in-wallet (direct) vs relayer (gasless)', () => {
    // Direct-submit path — the wallet prompt is open at submit-relayer (`waiting`).
    const direct = buildProcessingView(rec('shield', 'submit-relayer', 'waiting'))
    const directSubmit = direct.stages.find((s) => s.id === 'submit-relayer')
    expect(directSubmit?.subtitle).toBe('Confirm in your wallet')

    // Gasless (default) — prompts happened in build-proof; submit-relayer is just the relay POST.
    const gasless = buildProcessingView(rec('shield', 'submit-relayer', 'active'))
    const gaslessSubmit = gasless.stages.find((s) => s.id === 'submit-relayer')
    expect(gaslessSubmit?.subtitle).toBe('Submitting to the relayer')
  })

  it('surfaces a distinct "Shielding / Confirming on chain" step during the confirmation wait', () => {
    // Post-broadcast, pre-confirmation: the record sits on `hub-pending` for the whole on-chain
    // wait, so the stepper must show the confirming step — not hold on "Submitting transaction".
    const view = buildProcessingView(rec('shield', 'hub-pending', 'active', { sourceTxHash: '0xabc' }))
    const idx = view.stages.findIndex((s) => s.id === 'hub-pending')
    expect(view.activeStageIndex).toBe(idx)
    expect(view.stages[idx]?.label).toBe('Shielding')
    expect(view.stages[idx]?.subtitle).toBe('Confirming on chain')
    expect(view.completed).toBe(false)
  })

  it('picks the send-flow title from the variant for the shared unshield-* kinds', () => {
    const send = buildProcessingView(rec('unshield-local', 'build-proof', 'active'), {
      sendVariant: 'send',
    })
    expect(send.cardCopy.title).toBe('Unshielding and sending your USDC')
    expect(send.cardCopy.titleLines).toEqual(['Unshielding and sending', 'your USDC'])

    const withdraw = buildProcessingView(rec('unshield-local', 'build-proof', 'active'), {
      sendVariant: 'withdraw',
    })
    expect(withdraw.cardCopy.title).toBe('Unshielding your USDC')
    expect(withdraw.cardCopy.titleLines).toEqual(['Unshielding your', 'USDC'])
  })

  it('snaps to the last rendered row and folds the terminal completedLabel onto it when completed', () => {
    const view = buildProcessingView(rec('shield', 'hub-confirmed', 'completed'))
    expect(view.completed).toBe(true)
    // hub-confirmed is folded, so the last rendered row is hub-pending — and it carries the
    // terminal 'Shielded' completedLabel.
    expect(view.stages.some((s) => s.id === 'hub-confirmed')).toBe(false)
    expect(view.activeStageIndex).toBe(view.stages.length - 1)
    expect(view.stages.at(-1)?.id).toBe('hub-pending')
    expect(view.stages.at(-1)?.completedLabel).toBe('Shielded')
  })

  it('collapses the cross-chain bridging stages into one row whose subtitle tracks the live sub-stage', () => {
    const atPending = buildProcessingView(rec('unshield-xchain', 'iris-attestation-pending', 'active'))
    // The three bridging stages (hub-burn-confirmed, iris-*) render as a single "bridging" row.
    expect(atPending.stages.map((s) => s.id)).toEqual([
      'build-proof',
      'submit-relayer',
      'bridging',
      'client-mint-pending',
    ])
    const bridgeIdx = atPending.stages.findIndex((s) => s.id === 'bridging')
    expect(atPending.activeStageIndex).toBe(bridgeIdx)
    // The row names where the USDC is going, and from where.
    expect(atPending.stages[bridgeIdx]?.label).toBe(`Bridging to ${CLIENT}`)
    // While inside the group, the row shows the LIVE sub-stage subtitle...
    expect(atPending.stages[bridgeIdx]?.subtitle).toBe(`Moving your USDC from ${HUB.name} to ${CLIENT}`)

    // ...which says the burn went out just after it confirms, and that it's arriving once Circle has attested.
    const atBurn = buildProcessingView(rec('unshield-xchain', 'hub-burn-confirmed', 'active'))
    expect(atBurn.stages.find((s) => s.id === 'bridging')?.subtitle).toBe(`Sent from ${HUB.name}`)
    const atReady = buildProcessingView(rec('unshield-xchain', 'iris-attestation-ready', 'active'))
    expect(atReady.stages.find((s) => s.id === 'bridging')?.subtitle).toBe(`Arriving on ${CLIENT}`)
  })

  it('shows the neutral bridging subtitle when the group is not the active step', () => {
    // Still submitting — bridging is upcoming, so it shows the group's neutral line, not a sub-stage.
    const view = buildProcessingView(rec('unshield-xchain', 'submit-relayer', 'active'))
    expect(view.stages.find((s) => s.id === 'bridging')?.subtitle).toBe(`Moving your USDC from ${HUB.name} to ${CLIENT}`)
    // The delivery row names the destination too.
    expect(view.stages.find((s) => s.id === 'client-mint-pending')?.subtitle).toBe(`Delivering on ${CLIENT}`)
  })

  it('a cross-chain shield names its source chain while submitting, and bridges to the hub', () => {
    const view = buildProcessingView(rec('shield-xchain', 'submit-relayer', 'active'))
    expect(view.stages.find((s) => s.id === 'submit-relayer')?.label).toBe(`Submitting on ${CLIENT}`)
    expect(view.stages.find((s) => s.id === 'bridging')?.label).toBe(`Bridging to ${HUB.name}`)
    expect(view.stages.find((s) => s.id === 'bridging')?.subtitle).toBe(`Moving your USDC from ${CLIENT} to ${HUB.name}`)
  })

  it('falls back to "the source chain" / "the destination chain" for a chain it doesn\'t know', () => {
    const r = { ...rec('unshield-xchain', 'iris-attestation-pending', 'active'), meta: { toChainId: 999_999 } } as unknown as TxRecord
    const bridging = buildProcessingView(r).stages.find((s) => s.id === 'bridging')
    expect(bridging?.label).toBe('Bridging to the destination chain')
    expect(bridging?.subtitle).toBe(`Moving your USDC from ${HUB.name} to the destination chain`)
  })

  it('falls back to index 0 for an unknown stage', () => {
    const view = buildProcessingView(rec('transfer-shielded', 'not-a-stage', 'pending'))
    expect(view.activeStageIndex).toBe(0)
  })

  it('says what is safe to close: the modal always; the browser tab only once the tx has broadcast', () => {
    // Pre-broadcast: closing the modal is fine, but leaving the tab would stop the tx (nothing sent yet).
    const pre = buildProcessingView(rec('shield', 'build-proof', 'active'))
    expect(pre.cardCopy.subtitleLines).toEqual(['You can close this.', 'Keep this tab open until it\u2019s submitted.'])
    expect(pre.cardCopy.subtitle).toBe('You can close this. Keep this tab open until it\u2019s submitted.')

    // Broadcast (sourceTxHash present): the tab can go too — it resumes on the next sign-in.
    const post = buildProcessingView(
      rec('shield', 'hub-confirmed', 'active', { sourceTxHash: '0xabc' }),
    )
    expect(post.cardCopy.subtitleLines).toEqual(['You can close this tab.', "We'll finish in the background."])
  })

  it('times the active row from its first stage stamp, with that stage\'s estimate', () => {
    const r = { ...rec('unshield-local', 'hub-pending', 'waiting'), stageEnteredAt: { 'build-proof': 1, 'hub-pending': 5_000 } } as unknown as TxRecord
    expect(buildProcessingView(r).timing).toEqual({ startedAt: 5_000, usualMs: 15_000, slowMs: 45_000, safeInTransit: false, broadcast: false })
  })

  it('times a grouped "Bridging" row from the group\'s first stamp, and marks the USDC as in transit', () => {
    const r = {
      ...rec('unshield-xchain', 'iris-attestation-pending', 'waiting', { sourceTxHash: '0xabc' }),
      stageEnteredAt: { 'hub-burn-confirmed': 7_000, 'iris-attestation-pending': 7_500 },
    } as unknown as TxRecord
    expect(buildProcessingView(r).timing).toEqual({ startedAt: 7_000, usualMs: 30_000, slowMs: 75_000, safeInTransit: true, broadcast: true })
  })

  it('has no timing once completed, without a stamp, or on a row with no estimate', () => {
    const stamped = { 'build-proof': 0, 'submit-relayer': 1_000, 'hub-pending': 2_000 }
    expect(buildProcessingView({ ...rec('unshield-local', 'hub-confirmed', 'completed'), stageEnteredAt: stamped } as unknown as TxRecord).timing).toBeNull()
    expect(buildProcessingView(rec('unshield-local', 'hub-pending', 'waiting')).timing).toBeNull()
    expect(buildProcessingView({ ...rec('unshield-local', 'submit-relayer', 'active'), stageEnteredAt: stamped } as unknown as TxRecord).timing).toBeNull()
  })

  it('exposes the proof\'s progress while a spend builds its proof — not for a shield (its build-proof is wallet prompts)', () => {
    const proving = { ...rec('transfer-shielded', 'build-proof', 'active', { proofProgress: 0.5 }), updatedAt: 9_000 } as unknown as TxRecord
    expect(buildProcessingView(proving).proof).toEqual({ real: 0.5, proofs: 1, since: 9_000 })
    expect(buildProcessingView(rec('shield', 'build-proof', 'active')).proof).toBeNull()
    expect(buildProcessingView(rec('transfer-shielded', 'submit-relayer', 'active')).proof).toBeNull()
  })
})

