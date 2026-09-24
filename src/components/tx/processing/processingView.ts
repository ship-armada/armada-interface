// ABOUTME: Adapter from a live TxRecord to the processing UI's view model (hero card copy + timeline stages).
// ABOUTME: Drives TxProcessingLayout from our REAL lifecycle stages (lifecycleFor + record state), styled like the mockup.

import { lifecycleFor } from '@/lib/tx/lifecycles'
import type { TxExecutionState, TxKind, TxRecord } from '@/lib/tx/types'
import type { TxProgressCardCopy, TxProgressStage } from './processingCopy'

/** Subtitle for a stage — either static, or split by executionState (`waiting` = a wallet prompt is
 *  open) so a direct-submit prompt and a gasless relay POST on the same stage read correctly. */
type StageSubtitle = string | { active: string; waiting: string }

interface StageCopyEntry {
  label: string
  subtitle: StageSubtitle
  /** Shown on the final stage once the flow completes (else `label` is used). */
  completedLabel?: string
  /** Collapses consecutive stages sharing this key into ONE display row (see `GROUP_COPY`). */
  group?: string
}

/**
 * Copy for collapsed display groups. Consecutive stages tagged with the same `group` render as a
 * single timeline row: `label` is that row's heading; `subtitle` shows while the row is upcoming or
 * done, and is replaced by the LIVE sub-stage's own subtitle while the record sits inside the group
 * (so a single "Bridging" step advances its subheading through the underlying CCTP stages).
 */
const GROUP_COPY: Record<string, { label: string; subtitle: string }> = {
  bridging: { label: 'Bridging', subtitle: 'Moving funds across chains' },
}

/** Resolve a stage's subtitle. The `waiting` variant applies only to the CURRENT stage while the
 *  record is `waiting` (a wallet prompt is open); done/pending rows and all other states use `active`. */
function resolveSubtitle(
  subtitle: StageSubtitle,
  isCurrent: boolean,
  executionState: TxExecutionState,
): string {
  if (typeof subtitle === 'string') return subtitle
  return isCurrent && executionState === 'waiting' ? subtitle.waiting : subtitle.active
}

/**
 * Per-(kind, stage) processing copy. Labels are active-tense ("Shielding") with a `completedLabel`
 * for the final row ("Shielded"); subtitles echo the mockup's supporting line. Stage ids MUST match
 * `lifecycleFor(kind).stages` — every id a kind can reach needs an entry here.
 */
const STAGE_COPY: Record<TxKind, Record<string, StageCopyEntry>> = {
  shield: {
    'build-proof': { label: 'Preparing transaction', subtitle: 'Building zero-knowledge proof' },
    // Direct-submit path: the wallet prompt is open at submit-relayer (`waiting`) → "Confirm in your
    // wallet". Gasless (default): the prompts happened in build-proof, so submit-relayer is just the
    // relay POST (`active`) → "Submitting to the relayer", not a stale "confirm" message.
    'submit-relayer': {
      label: 'Submitting transaction',
      subtitle: { waiting: 'Confirm in your wallet', active: 'Submitting to the relayer' },
    },
    'hub-pending': { label: 'Shielding', subtitle: 'Confirming on chain' },
    'hub-confirmed': { label: 'Shielded', subtitle: 'Confirming on chain', completedLabel: 'Shielded' },
  },
  'shield-xchain': {
    'build-proof': { label: 'Preparing transaction', subtitle: 'Building zero-knowledge proof' },
    'submit-relayer': { label: 'Submitting on source chain', subtitle: 'Confirm in your wallet' },
    'client-burn-confirmed': { label: 'Bridging', subtitle: 'Confirmed on source chain', group: 'bridging' },
    'iris-attestation-pending': { label: 'Bridging', subtitle: 'Waiting for cross-chain confirmation', group: 'bridging' },
    'iris-attestation-ready': { label: 'Bridging', subtitle: 'Cross-chain confirmation ready', group: 'bridging' },
    'hub-mint-pending': { label: 'Shielding', subtitle: 'Delivering to your private balance' },
    'hub-mint-confirmed': { label: 'Shielding', subtitle: 'Confirming on chain', completedLabel: 'Shielded' },
  },
  'unshield-local': {
    'build-proof': { label: 'Preparing transaction', subtitle: 'Building zero-knowledge proof' },
    'submit-relayer': { label: 'Submitting transaction', subtitle: 'Relaying to public chain' },
    // One kind-keyed entry serves both external-send and withdraw (accepted limitation): the mockup
    // splits these by mode. We use the external-send subtitle (neutral — a withdraw also lands in an
    // external wallet) + the unshield completedLabel (accurate for both).
    'hub-pending': { label: 'Unshielding', subtitle: 'Sending USDC to external wallet' },
    'hub-confirmed': { label: 'Unshielded', subtitle: 'Sending USDC to external wallet', completedLabel: 'Unshielded' },
  },
  'unshield-xchain': {
    'build-proof': { label: 'Preparing transaction', subtitle: 'Building zero-knowledge proof' },
    'submit-relayer': { label: 'Submitting transaction', subtitle: 'Relaying to public chain' },
    'hub-burn-confirmed': { label: 'Bridging', subtitle: 'Confirmed on hub', group: 'bridging' },
    'iris-attestation-pending': { label: 'Bridging', subtitle: 'Waiting for cross-chain confirmation', group: 'bridging' },
    'iris-attestation-ready': { label: 'Bridging', subtitle: 'Cross-chain confirmation ready', group: 'bridging' },
    'client-mint-pending': { label: 'Delivering', subtitle: 'Delivering on the destination chain' },
    'client-mint-confirmed': { label: 'Delivering', subtitle: 'Confirming on chain', completedLabel: 'Funds delivered' },
  },
  'transfer-shielded': {
    'build-proof': { label: 'Preparing transaction', subtitle: 'Building zero-knowledge proof' },
    'submit-relayer': { label: 'Submitting transaction', subtitle: 'Relaying privately to recipient' },
    'hub-pending': { label: 'Sending', subtitle: 'Delivering privately to recipient' },
    'hub-confirmed': { label: 'Sent', subtitle: 'Delivering privately to recipient', completedLabel: 'Sent' },
  },
  'transfer-shielded-received': {
    observed: { label: 'Received', subtitle: 'Payment received', completedLabel: 'Received' },
  },
  consolidate: {
    'build-proof': { label: 'Preparing transaction', subtitle: 'Building zero-knowledge proofs' },
    'submit-relayer': { label: 'Submitting transaction', subtitle: 'Relaying privately' },
    'hub-pending': { label: 'Merging notes', subtitle: 'Confirming on chain' },
    'hub-confirmed': { label: 'Notes merged', subtitle: 'Confirming on chain', completedLabel: 'Notes merged' },
  },
  'yield-deposit': {
    'build-proof': { label: 'Preparing transaction', subtitle: 'Building zero-knowledge proof' },
    'submit-relayer': { label: 'Submitting privately', subtitle: 'Relaying to shielded vault' },
    'hub-pending': { label: 'Adding to shielded vault', subtitle: 'USDC is entering the shielded vault' },
    'hub-confirmed': { label: 'Earning', subtitle: 'USDC is entering the shielded vault', completedLabel: 'Earning' },
  },
  'yield-withdraw': {
    'build-proof': { label: 'Preparing transaction', subtitle: 'Building zero-knowledge proof' },
    'submit-relayer': { label: 'Submitting privately', subtitle: 'Relaying to shielded vault' },
    'hub-pending': { label: 'Withdrawing', subtitle: 'USDC is returning to your balance' },
    'hub-confirmed': { label: 'Returned to balance', subtitle: 'USDC is returning to your balance', completedLabel: 'Returned to balance' },
  },
}

/**
 * Reassurance subtitle — shown ONLY once the tx has broadcast on chain (`sourceTxHash` present).
 * Before broadcast, closing the browser tab would abort the tx (useTxResume fails pre-broadcast
 * interruptions), so we don't promise background processing until it's genuinely safe to leave.
 */
const CLOSE_SUBTITLE_LINES = [
  'You can now close this window.',
  "We'll keep processing in the background.",
] as const

/** Generic pre-broadcast subtitle (shown for every kind until the tx is on chain). */
const PREPARING_SUBTITLE = 'Preparing your transaction…'

/** Which Send/Withdraw flow the user is in — needed to disambiguate the shared `unshield-*` kinds. */
export type SendVariant = 'send' | 'withdraw'

type CardBase = Pick<TxProgressCardCopy, 'tag' | 'title' | 'titleLines' | 'titleBreakAfter'>

/**
 * Hero card tag + title per flow. The Send/Withdraw flow shares the `unshield-*` kinds across two
 * user intents — an external send vs a withdraw-to-wallet — so those need `sendVariant` to pick the
 * right framing (mirrors the mockup's `sendProcessingCopyMode`). Every other kind resolves from the
 * kind alone. (`tag` isn't rendered today — the card shows title + subtitle — but is kept for
 * accessible-name fidelity with the mockup.)
 */
function resolveCardBase(record: TxRecord, sendVariant?: SendVariant): CardBase {
  switch (record.kind) {
    case 'shield':
    case 'shield-xchain':
      return {
        tag: 'Shield in progress',
        title: 'Your USDC is being shielded',
        titleLines: ['Your USDC is', 'being shielded'],
      }
    case 'transfer-shielded':
      return {
        tag: 'Private send in progress',
        title: 'Sending your USDC privately',
        titleBreakAfter: 'your',
      }
    case 'transfer-shielded-received':
      return { tag: 'Received', title: 'Payment received' }
    case 'consolidate':
      return {
        tag: 'Merge in progress',
        title: 'Merging your notes',
        titleLines: ['Merging your', 'notes'],
      }
    case 'unshield-local':
    case 'unshield-xchain':
      return sendVariant === 'withdraw'
        ? {
            tag: 'Unshield in progress',
            title: 'Unshielding your USDC',
            titleLines: ['Unshielding your', 'USDC'],
          }
        : {
            tag: 'Send in progress',
            title: 'Unshielding and sending your USDC',
            titleLines: ['Unshielding and sending', 'your USDC'],
          }
    case 'yield-deposit':
      return {
        tag: 'Deposit to shielded vault in progress',
        title: 'Sending USDC to shielded vault',
        titleBreakAfter: 'USDC',
      }
    case 'yield-withdraw':
      return {
        tag: 'Withdraw from shielded vault in progress',
        title: 'Withdraw from shielded vault in progress',
      }
  }
}

export interface ProcessingView {
  cardCopy: TxProgressCardCopy
  stages: TxProgressStage[]
  activeStageIndex: number
  completed: boolean
}

/**
 * Build the processing view model from a live record. Stages come from the record's real lifecycle
 * (not a fixed 3-step demo); `activeStageIndex` tracks `record.stage`, snapping to the final stage
 * once the flow completes.
 */
export function buildProcessingView(
  record: TxRecord,
  opts?: { sendVariant?: SendVariant },
): ProcessingView {
  const lifecycle = lifecycleFor(record.kind)
  const stageIds = lifecycle.stages as ReadonlyArray<string>
  const copyMap = STAGE_COPY[record.kind]

  // The terminal-success stage is NOT drawn as its own row — it's the completed form of the last
  // action row (e.g. "Shielding" → "Shielded"), so the timeline doesn't render a redundant
  // "confirming" + "confirmed" pair. Its `completedLabel` is folded onto the last rendered row.
  // Single-stage kinds (the synthetic `received`) have nothing preceding the terminal, so keep it.
  const terminalStage = lifecycle.terminalSuccess as string
  const renderedIds =
    stageIds.length > 1 ? stageIds.filter((id) => id !== terminalStage) : stageIds
  const foldedCompletedLabel =
    copyMap[terminalStage]?.completedLabel ?? copyMap[terminalStage]?.label

  // Collapse consecutive rendered stages sharing a `group` into one display row (e.g. the three
  // cross-chain "Bridging" stages become a single row). Non-grouped stages each get their own row.
  const rows: { id: string; group?: string; stageIds: string[] }[] = []
  for (const id of renderedIds) {
    const group = copyMap[id]?.group
    const prev = rows[rows.length - 1]
    if (group !== undefined && prev?.group === group) {
      prev.stageIds.push(id)
    } else {
      rows.push({ id: group ?? id, group, stageIds: [id] })
    }
  }

  const stages: TxProgressStage[] = rows.map((row, index) => {
    // The last rendered row carries the folded terminal `completedLabel` so it flips to the done
    // state on completion; earlier rows keep their own (usually none).
    const foldedLabel = index === rows.length - 1 ? foldedCompletedLabel : undefined
    if (row.group !== undefined) {
      // Grouped row: show the LIVE sub-stage's subtitle while the record is inside the group, else
      // the group's neutral subtitle (upcoming / done).
      const groupCopy = GROUP_COPY[row.group]
      const activeSubId = row.stageIds.find((sid) => sid === record.stage)
      const subtitle = activeSubId
        ? resolveSubtitle(copyMap[activeSubId]?.subtitle ?? '', true, record.executionState)
        : groupCopy?.subtitle ?? ''
      return { id: row.id, label: groupCopy?.label ?? row.id, subtitle, completedLabel: foldedLabel }
    }
    const entry = copyMap[row.id]
    return {
      id: row.id,
      label: entry?.label ?? row.id,
      subtitle: entry ? resolveSubtitle(entry.subtitle, row.id === record.stage, record.executionState) : '',
      completedLabel: foldedLabel ?? entry?.completedLabel,
    }
  })

  const completed = record.executionState === 'completed'
  // Active row = the display row containing `record.stage`. On completion the stage is the (unrendered)
  // terminal one → not found → snap to the last rendered row, which carries the folded completedLabel.
  const currentRowIndex = rows.findIndex((row) => row.stageIds.includes(record.stage as string))
  const activeStageIndex = completed
    ? Math.max(0, stages.length - 1)
    : Math.max(0, currentRowIndex)

  // Only promise "safe to close" once the tx has broadcast on chain — before that, leaving the tab
  // would abort it (nothing was submitted yet). Pre-broadcast keeps the neutral per-kind subtitle.
  const broadcast = Boolean(record.artifacts.sourceTxHash)
  const base = resolveCardBase(record, opts?.sendVariant)
  const cardCopy: TxProgressCardCopy = broadcast
    ? { ...base, subtitle: CLOSE_SUBTITLE_LINES.join(' '), subtitleLines: CLOSE_SUBTITLE_LINES }
    : { ...base, subtitle: PREPARING_SUBTITLE }

  return { cardCopy, stages, activeStageIndex, completed }
}
