// ABOUTME: Tests for noticeCopy — the one-line title of a tx notice (toast / header pill) per kind and tone, with the
// ABOUTME: amount dropped while balances are hidden, and an unshield to the user's own wallet reading as an unshield.

import { describe, it, expect } from 'vitest'
import type { TxKind } from '@/lib/tx/types'
import type { TxNoticeTone } from '@/lib/tx/notices'
import { txNoticeTitle } from './noticeCopy'
import { txRecord } from '@/test/fixtures/txValues'

const OWN_EVM = '0x1111111111111111111111111111111111111111'
const OTHER_EVM = '0x2222222222222222222222222222222222222222'

function title(kind: TxKind, tone: TxNoticeTone, meta: object = {}, hideAmounts = false) {
  return txNoticeTitle(txRecord(kind, { amount: 5_000_000n, ...meta }), tone, { hideAmounts, ownEvmAddress: OWN_EVM })
}

describe('txNoticeTitle', () => {
  it.each<[TxKind, TxNoticeTone, object, string]>([
    ['shield', 'pending', {}, 'Shielding 5.00 USDC…'],
    ['shield-xchain', 'success', {}, 'Shielded 5.00 USDC'],
    ['shield', 'failure', {}, 'Shield failed'],
    ['transfer-shielded', 'pending', {}, 'Sending 5.00 USDC…'],
    ['transfer-shielded', 'success', {}, 'Sent 5.00 USDC'],
    ['transfer-shielded', 'uncertain', {}, "Couldn't confirm the send"],
    ['unshield-local', 'success', { recipient: OTHER_EVM }, 'Sent 5.00 USDC'],
    ['unshield-xchain', 'success', { recipient: OWN_EVM }, 'Unshielded 5.00 USDC'],
    ['unshield-local', 'failure', { recipient: OWN_EVM }, 'Unshield failed'],
    ['transfer-shielded-received', 'received', {}, 'Received 5.00 USDC'],
    ['yield-deposit', 'success', {}, 'Added 5.00 USDC to the vault'],
    ['yield-withdraw', 'pending', {}, 'Withdrawing 5.00 USDC from the vault…'],
    ['yield-withdraw', 'failure', {}, 'Vault withdrawal failed'],
    ['consolidate', 'success', { broadcasterFeeAmount: 10_000n }, 'Notes merged'],
    ['consolidate', 'uncertain', { broadcasterFeeAmount: 10_000n }, "Couldn't confirm the merge"],
  ])('%s / %s %o → %s', (kind, tone, meta, expected) => {
    expect(title(kind, tone, meta)).toBe(expected)
  })

  it('leaves the amount out while balances are hidden', () => {
    expect(title('transfer-shielded-received', 'received', {}, true)).toBe('Received USDC')
    expect(title('yield-deposit', 'pending', {}, true)).toBe('Adding USDC to the vault…')
  })
})
