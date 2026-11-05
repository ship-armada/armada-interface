// ABOUTME: The one-line title of a tx notice — what the toast / header pill says when a tx the user isn't watching
// ABOUTME: moves on ("Sent 5.00 USDC", "Shield failed"). Per kind and tone; drops the amount while balances are hidden.

import type { TxKind, TxRecord } from '@/lib/tx/types'
import type { TxNoticeTone } from '@/lib/tx/notices'
import { txHeadline } from '@/lib/fees/txFigures'
import { formatUsdcAmount } from '@/lib/format'
import { isWithdrawToSelf } from '@/components/dashboard/txActivityAdapter'

export interface TxNoticeCopyOptions {
  /** Balances are hidden app-wide — say "USDC" instead of the amount. */
  hideAmounts: boolean
  /** The connected EVM wallet — an unshield to it reads as "Unshielded", to anyone else as "Sent". */
  ownEvmAddress?: string | null
}

/** Per-action copy; `a` is the amount ("5.00 USDC", or "USDC" while hidden). */
interface ActionCopy {
  pending: (a: string) => string
  success: (a: string) => string
  failure: string
  /** The action as a noun, for "Couldn't confirm the …". */
  noun: string
}

const SHIELD: ActionCopy = {
  pending: (a) => `Shielding ${a}…`,
  success: (a) => `Shielded ${a}`,
  failure: 'Shield failed',
  noun: 'shield',
}

const SEND: ActionCopy = {
  pending: (a) => `Sending ${a}…`,
  success: (a) => `Sent ${a}`,
  failure: 'Send failed',
  noun: 'send',
}

const UNSHIELD: ActionCopy = {
  pending: (a) => `Unshielding ${a}…`,
  success: (a) => `Unshielded ${a}`,
  failure: 'Unshield failed',
  noun: 'unshield',
}

const COPY: Record<Exclude<TxKind, 'unshield-local' | 'unshield-xchain'>, ActionCopy> = {
  shield: SHIELD,
  'shield-xchain': SHIELD,
  'transfer-shielded': SEND,
  // Only ever "received"; the other tones are never raised for it (it's never in flight on this device).
  'transfer-shielded-received': {
    pending: (a) => `Receiving ${a}…`,
    success: (a) => `Received ${a}`,
    failure: 'Payment failed',
    noun: 'payment',
  },
  'yield-deposit': {
    pending: (a) => `Adding ${a} to the vault…`,
    success: (a) => `Added ${a} to the vault`,
    failure: 'Vault deposit failed',
    noun: 'vault deposit',
  },
  'yield-withdraw': {
    pending: (a) => `Withdrawing ${a} from the vault…`,
    success: (a) => `Withdrew ${a} from the vault`,
    failure: 'Vault withdrawal failed',
    noun: 'vault withdrawal',
  },
  // A merge moves no value, so its copy names no amount.
  consolidate: {
    pending: () => 'Merging notes…',
    success: () => 'Notes merged',
    failure: 'Merge failed',
    noun: 'merge',
  },
}

function actionCopy(record: TxRecord, ownEvmAddress: string | null | undefined): ActionCopy {
  if (record.kind === 'unshield-local' || record.kind === 'unshield-xchain') {
    // Send-to-someone and withdraw-to-self are the same on-chain op; the recipient tells them apart.
    const recipient = (record.meta as { recipient?: string }).recipient
    return isWithdrawToSelf(recipient, ownEvmAddress) ? UNSHIELD : SEND
  }
  return COPY[record.kind]
}

export function txNoticeTitle(record: TxRecord, tone: TxNoticeTone, options: TxNoticeCopyOptions): string {
  const copy = actionCopy(record, options.ownEvmAddress)
  const amount = options.hideAmounts ? 'USDC' : `${formatUsdcAmount(txHeadline(record))} USDC`
  switch (tone) {
    case 'pending':
      return copy.pending(amount)
    case 'success':
    case 'received':
      return copy.success(amount)
    case 'failure':
      return copy.failure
    case 'uncertain':
      return `Couldn't confirm the ${copy.noun}`
  }
}
