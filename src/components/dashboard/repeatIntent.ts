// ABOUTME: The Activity receipt's "do it again" — builds the prefill (RepeatIntent) a record repeats as, its button label
// ABOUTME: ("Send again", "Shield again", …) and the modal it opens. Offered only once a tx is settled, failed or cancelled.

import { formatUnits } from 'viem'
import { getNetworkConfig } from '@/config/network'
import { txOutcome } from '@/lib/tx/outcome'
import type { TxRecord } from '@/lib/tx/types'
import type { ActionModalKind, RepeatIntent } from '@/state/ui'
import { isWithdrawToSelf } from './txActivityAdapter'

/** A raw 6-decimal USDC amount as the amount field takes it: "5.5", not "5.500000". */
function amountInput(amount: bigint): string {
  return formatUnits(amount, 6)
}

/**
 * The prefill a record repeats as, or null when it offers no "do it again". Only for a settled, failed or cancelled tx —
 * never one still pending or with an unknown outcome, which may yet go through (repeating it could pay twice). A received
 * payment and a merge have nothing to repeat. A public send to the user's own wallet repeats as an unshield, as Activity
 * labels it (`isWithdrawToSelf`).
 */
export function repeatIntentFor(record: TxRecord, ownWallet: string | null | undefined): RepeatIntent | null {
  const outcome = txOutcome(record)
  if (outcome !== 'settled' && outcome !== 'failed' && outcome !== 'cancelled') return null
  const amount = amountInput((record.meta as { amount: bigint }).amount)
  const hubChainId = getNetworkConfig().hub.chainId
  switch (record.kind) {
    case 'transfer-shielded': {
      const { recipient } = (record as TxRecord<'transfer-shielded'>).meta
      return { flow: 'send', recipient, amount, destChainId: hubChainId }
    }
    case 'unshield-local':
    case 'unshield-xchain': {
      const { recipient } = (record as TxRecord<'unshield-local' | 'unshield-xchain'>).meta
      const destChainId =
        record.kind === 'unshield-xchain' ? (record as TxRecord<'unshield-xchain'>).meta.toChainId : hubChainId
      return isWithdrawToSelf(recipient, ownWallet)
        ? { flow: 'unshield', amount, toChainId: destChainId }
        : { flow: 'send', recipient, amount, destChainId }
    }
    case 'shield':
    case 'shield-xchain':
      return { flow: 'shield', amount, fromChainId: (record as TxRecord<'shield' | 'shield-xchain'>).meta.fromChainId }
    case 'yield-deposit':
      return { flow: 'earn', direction: 'add', amount }
    case 'yield-withdraw':
      return { flow: 'earn', direction: 'withdraw', amount }
    case 'transfer-shielded-received':
    case 'consolidate':
      return null
  }
}

/** The receipt's button label for an intent. */
export function repeatLabel(intent: RepeatIntent): string {
  switch (intent.flow) {
    case 'send':
      return 'Send again'
    case 'unshield':
      return 'Unshield again'
    case 'shield':
      return 'Shield again'
    case 'earn':
      return intent.direction === 'add' ? 'Deposit again' : 'Withdraw again'
  }
}

/** The modal (and so the tab) an intent opens. */
export function repeatModalFor(intent: RepeatIntent): ActionModalKind {
  switch (intent.flow) {
    case 'send':
      return 'payment'
    case 'unshield':
      return 'unshield'
    case 'shield':
      return 'shield'
    case 'earn':
      return intent.direction === 'add' ? 'yield-deposit' : 'yield-withdraw'
  }
}
