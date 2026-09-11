// ABOUTME: Tests for buildProcessingView — maps a live TxRecord to the processing view model.
// ABOUTME: Covers stage mapping from the real lifecycle, active-index tracking, completion, and xchain granularity.

import { describe, it, expect } from 'vitest'
import { buildProcessingView } from './processingView'
import type { TxKind, TxRecord, TxExecutionState } from '@/lib/tx/types'

// buildProcessingView only reads kind/stage/executionState/artifacts; a partial cast is sufficient.
function rec(
  kind: TxKind,
  stage: string,
  executionState: TxExecutionState,
  artifacts: Record<string, unknown> = {},
): TxRecord {
  return { kind, stage, executionState, artifacts } as unknown as TxRecord
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
    expect(atPending.stages[bridgeIdx]?.label).toBe('Bridging')
    // While inside the group, the row shows the LIVE sub-stage subtitle...
    expect(atPending.stages[bridgeIdx]?.subtitle).toBe('Waiting for cross-chain confirmation')

    // ...and it advances as the underlying stage moves on.
    const atReady = buildProcessingView(rec('unshield-xchain', 'iris-attestation-ready', 'active'))
    expect(atReady.stages.find((s) => s.id === 'bridging')?.subtitle).toBe('Cross-chain confirmation ready')
  })

  it('shows the neutral bridging subtitle when the group is not the active step', () => {
    // Still submitting — bridging is upcoming, so it shows the group's neutral line, not a sub-stage.
    const view = buildProcessingView(rec('unshield-xchain', 'submit-relayer', 'active'))
    expect(view.stages.find((s) => s.id === 'bridging')?.subtitle).toBe('Moving funds across chains')
  })

  it('falls back to index 0 for an unknown stage', () => {
    const view = buildProcessingView(rec('transfer-shielded', 'not-a-stage', 'pending'))
    expect(view.activeStageIndex).toBe(0)
  })

  it('shows the safe-to-close reassurance only once the tx has broadcast', () => {
    // Pre-broadcast: generic "Preparing…" subtitle, no "you can close" promise.
    const pre = buildProcessingView(rec('shield', 'build-proof', 'active'))
    expect(pre.cardCopy.subtitleLines).toBeUndefined()
    expect(pre.cardCopy.subtitle).toBe('Preparing your transaction…')

    // Broadcast (sourceTxHash present): the reassurance appears.
    const post = buildProcessingView(
      rec('shield', 'hub-confirmed', 'active', { sourceTxHash: '0xabc' }),
    )
    expect(post.cardCopy.subtitleLines).toEqual([
      'You can now close this window.',
      "We'll keep processing in the background.",
    ])
  })
})
