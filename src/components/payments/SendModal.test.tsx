// ABOUTME: Tests for SendModal orchestrator — send flow: address-driven kind selection + the recipient→amount→review→progress flow.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { SendModal } from './SendModal'
import { mergeIntentAtom, openModalAtom, paymentIntentAtom } from '@/state/ui'
import {
  activeShieldedWalletIdAtom,
  evmAddressAtom,
  shieldedUsdcAtom,
  shieldedUsdcSpendableAtom,
} from '@/state/wallet'
import { feeQuoteAtom, feeQuoteFetchedAtAtom } from '@/state/fees'
import { getChainById } from '@/config/network'
import { withTestQueryClient } from '@/test-utils/queryClient'
import { txListAtom } from '@/state/tx'
import type { TxRecord } from '@/lib/tx/types'

// useDisplayFees + useGasBalanceWarning hit wagmi hooks that require a WagmiProvider; these
// tests don't mount one. Stub with neutral defaults so the modal renders.
// This tab is the executor leader (single-tab test env) so useTx.submit isn't refused (P1-26).
// Healthy, resolved relayer so the submit gate (useRelayerSubmitBlock) never blocks Confirm.
vi.mock('@/hooks/useRelayerHealth', () => ({
  useRelayerHealth: () => ({
    isConfigured: true, isUnreachable: false, isChecking: false, isIndexerStalled: false,
    data: { status: 'healthy' }, refetch: vi.fn(),
  }),
}))

vi.mock('@/lib/tx/executor', async (importActual) => ({
  ...await importActual<typeof import('@/lib/tx/executor')>(),
  getIsLeader: () => true,
}))

// SendModal reads the connected wallet's connector via wagmi's useAccount to brand the recipient
// row glyph; these tests don't mount a WagmiProvider, so stub it with a MetaMask connector.
vi.mock('wagmi', async (importOriginal) => ({
  ...await importOriginal<typeof import('wagmi')>(),
  useAccount: () => ({ connector: { name: 'MetaMask' } }),
}))

vi.mock('@/hooks/useDisplayFees', () => ({
  useDisplayFees: () => ({
    fees: {
      protocolFee: 0n,
      gasFee: 0n,
      nativeGas: null,
      totalFee: 0n,
      feeInclusive: false,
    },
    isLoading: false,
  }),
}))
vi.mock('@/hooks/useGasBalanceWarning', () => ({
  useGasBalanceWarning: () => ({
    show: false,
    nativeSymbol: 'ETH',
    formattedBalance: null,
  }),
}))

// Submit always refetches a fresh quote (fee-refresh fix). Mock useFees so refresh() resolves the
// fake quote deterministically (the real refresh() hits fetchFees → network, unreachable in jsdom).
const hoistedFees = vi.hoisted(() => ({
  quote: {
    cacheId: 'test-cache',
    expiresAt: 0,
    chainId: 31337,
    broadcasterShieldedAddress: '0zk' + 'a'.repeat(64),
    fees: { transfer: '0', unshield: '0', crossContract: '0', crossChainShield: '0', crossChainUnshield: '0', shield: '0', shieldXchain: '0' },
  },
}))
vi.mock('@/hooks/useFees', () => ({
  useFees: () => ({
    quote: hoistedFees.quote,
    isStale: false,
    isUnavailable: false,
    refresh: vi.fn(async () => hoistedFees.quote),
  }),
  FEES_QUERY_KEY: ['fees'],
}))

// A private send is priced by planning it through the SDK (review-time split fee). The SDK can't load in
// jsdom, so stub the pricing hook with a controllable plan; each test sets what the planner "found".
const hoistedPlan = vi.hoisted(() => {
  const defaults = () => ({
    fee: 0n as bigint | null,
    proofs: 1 as number | null,
    maxInput: null as bigint | null,
    error: null as string | null,
    remedy: null as 'merge-notes' | null,
    pending: false,
    priceAt: vi.fn(async () => 0n),
    invalidate: vi.fn(async () => {}),
  })
  return { defaults, plan: defaults() }
})
vi.mock('@/hooks/useTransferFeePlan', () => ({ useTransferFeePlan: () => hoistedPlan.plan }))

// Public (0x) sends are unshields, dry-run at review for fragmentation; each test sets the outcome.
const hoistedCheck = vi.hoisted(() => ({ result: { error: null as string | null, remedy: null as 'merge-notes' | null, pending: false, blockReason: null as string | null } }))
vi.mock('@/hooks/useSpendCheck', () => ({ useSpendCheck: () => hoistedCheck.result }))

// The private-send submit path strict-validates the 0zk recipient via the SDK
// (validateShieldedAddressStrict → dynamic import), which crashes jsdom at load. Keep the sync
// validators real; stub only the strict async check to pass for the test's fake 0zk fixture.
vi.mock('@/lib/address', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/address')>()),
  validateShieldedAddressStrict: vi.fn(async () => true),
}))

// Phase 7: tx/storage requires an unlocked keyManager (encrypted writes). UI tests don't drive
// onboarding; mock storage to no-op. Storage encryption is covered in lib/tx/storage.test.ts.
vi.mock('@/lib/tx/storage', () => ({
  putTxIfFresh: vi.fn(async () => true),
  putTx: vi.fn(async () => {}),
  deleteTx: vi.fn(async () => {}),
  loadAllTx: vi.fn(async () => []),
}))

const VALID_EVM = '0x1234567890abcdef1234567890abcdef12345678'
const VALID_0ZK = '0zk' + 'a'.repeat(40)

const FAKE_QUOTE = {
  cacheId: 'test-cache',
  expiresAt: Date.now() + 5 * 60_000,
  chainId: 31337,
  // Shape-valid 0zk for the submit-time isShieldedAddress() broadcaster-address check.
  broadcasterShieldedAddress: '0zk' + 'a'.repeat(64),
  fees: { transfer: '0', unshield: '0', crossContract: '0', crossChainShield: '0', crossChainUnshield: '0', shield: '0', shieldXchain: '0' },
}

function renderModal(opts?: {
  open?: 'payment' | false
  shielded?: bigint
  evm?: string
  intent?: { recipient: string; amount?: string }
}) {
  const store = createStore()
  if (opts?.open) store.set(openModalAtom, opts.open)
  if (opts?.intent) store.set(paymentIntentAtom, opts.intent)
  if (opts?.shielded !== undefined) {
    store.set(shieldedUsdcAtom, opts.shielded)
    store.set(shieldedUsdcSpendableAtom, opts.shielded) // no pending in tests → spendable == total
  }
  if (opts?.evm) store.set(evmAddressAtom, opts.evm)
  // useTx.submit() refuses to write a record without an active shielded walletId (Phase 6
  // scoping invariant). Seed a placeholder so the Confirm flow doesn't trip the guard.
  store.set(activeShieldedWalletIdAtom, 'rg-test')
  store.set(feeQuoteAtom, FAKE_QUOTE)
  // staleAtom treats a quote with no fetch timestamp as stale (350e084), which would send
  // Confirm down the real refresh()/fetchFees path — unreachable in jsdom. A fresh
  // fetchedAt keeps the seeded FAKE_QUOTE inside the 4-minute freshness window.
  store.set(feeQuoteFetchedAtAtom, Date.now())
  render(withTestQueryClient(
    <Provider store={store}>
      <SendModal />
    </Provider>,
  ))
  return store
}

/** Advance the recipient step: type an address, (optionally) pick a chain via the popover, click Continue. */
function completeRecipientStep(recipient: string, chainValue?: string) {
  fireEvent.change(screen.getByLabelText('Recipient address'), { target: { value: recipient } })
  if (chainValue !== undefined) {
    // Open the styled chain popover and click the option whose label matches the chainId.
    fireEvent.click(screen.getByLabelText('Destination chain'))
    const name = getChainById(Number(chainValue))?.name ?? chainValue
    fireEvent.click(screen.getByRole('option', { name }))
  }
  fireEvent.click(screen.getByRole('button', { name: /Continue/ }))
}

describe('<SendModal>', () => {
  beforeEach(() => {
    hoistedPlan.plan = hoistedPlan.defaults()
    hoistedCheck.result = { error: null, remedy: null, pending: false, blockReason: null }
  })

  it('a public send holds Confirm while its notes are being checked', () => {
    hoistedCheck.result = { error: null, remedy: null, pending: true, blockReason: 'Checking your notes…' }
    renderModal({ open: 'payment', shielded: 10_000_000n })
    completeRecipientStep(VALID_EVM, '31337')
    fireEvent.change(screen.getByLabelText('Send amount'), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: /Review/ }))
    expect(screen.getByText('Checking your notes…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Confirm send/ })).toBeDisabled()
  })

  it('a public send the wallet is too fragmented for offers "Merge notes" at review, before anything is sent', () => {
    hoistedCheck.result = { error: 'Your balance is spread across too many small notes for this transaction. Merge your notes, then try again.', remedy: 'merge-notes', pending: false, blockReason: 'Your balance is spread across too many small notes for this transaction. Merge your notes, then try again.' }
    const store = renderModal({ open: 'payment', shielded: 10_000_000n })
    completeRecipientStep(VALID_EVM, '31337')
    fireEvent.change(screen.getByLabelText('Send amount'), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: /Review/ }))
    expect(screen.getByText(/Merge your notes, then try again/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Confirm send/ })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Merge notes' }))
    expect(store.get(openModalAtom)).toBe('merge')
    expect(store.get(mergeIntentAtom)).toEqual({
      token: 'usdc',
      blocked: { kind: 'unshield-local', amount: 3_000_000n, perProofFee: 0n },
    })
  })

  it('renders nothing when no send/withdraw modal is open', () => {
    renderModal({ open: false })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens the send variant on the recipient step with the "Send" title', () => {
    renderModal({ open: 'payment', shielded: 10_000_000n })
    expect(screen.getByRole('dialog', { name: 'Send' })).toBeInTheDocument()
    expect(screen.getByLabelText('Recipient address')).toBeInTheDocument()
  })

  it('opens directly on Review from a pay-via-link intent and consumes it', () => {
    const store = renderModal({
      open: 'payment',
      shielded: 10_000_000n,
      intent: { recipient: VALID_0ZK, amount: '25' },
    })
    // Recipient + amount are both known, so the flow jumps past the recipient/amount steps.
    expect(screen.getByRole('heading', { name: 'Review your USDC shielded transfer' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm send' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Recipient address')).toBeNull()
    // The intent is consumed on open so it can't re-fire.
    expect(store.get(paymentIntentAtom)).toBeNull()
  })

  it('lands on the amount step for an amount-less pay-via-link intent', () => {
    renderModal({
      open: 'payment',
      shielded: 10_000_000n,
      intent: { recipient: VALID_0ZK },
    })
    // No amount to review yet — the amount step is shown (recipient already seeded).
    expect(screen.queryByLabelText('Recipient address')).toBeNull()
    expect(screen.getByLabelText('Send amount')).toBeInTheDocument()
  })

  it('Continue enables only once the recipient is a valid address', () => {
    renderModal({ open: 'payment', shielded: 10_000_000n })
    // Empty + invalid: the CTA is always present but disabled + labeled "Enter address".
    expect(screen.getByRole('button', { name: /Enter address/ })).toHaveAttribute('aria-disabled', 'true')
    fireEvent.change(screen.getByLabelText('Recipient address'), { target: { value: 'not-an-address' } })
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Enter address/ })).toHaveAttribute('aria-disabled', 'true')
    fireEvent.change(screen.getByLabelText('Recipient address'), { target: { value: VALID_0ZK } })
    expect(screen.getByRole('button', { name: /^Continue$/ })).not.toBeDisabled()
  })

  it('a 0zk recipient hides the chain selector (private transfer)', () => {
    renderModal({ open: 'payment', shielded: 10_000_000n })
    fireEvent.change(screen.getByLabelText('Recipient address'), { target: { value: VALID_0ZK } })
    expect(screen.queryByLabelText('Destination chain')).toBeNull()
  })

  it('a 0x recipient reveals the chain selector (public transfer)', () => {
    renderModal({ open: 'payment', shielded: 10_000_000n })
    fireEvent.change(screen.getByLabelText('Recipient address'), { target: { value: VALID_EVM } })
    expect(screen.getByLabelText('Destination chain')).toBeInTheDocument()
  })

  it('0zk recipient → transfer-shielded: review shows the "Private" privacy row + no network row', () => {
    renderModal({ open: 'payment', shielded: 10_000_000n })
    completeRecipientStep(VALID_0ZK)
    fireEvent.change(screen.getByLabelText('Send amount'), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: /Review/ }))
    expect(screen.getByText('Private transfer.')).toBeInTheDocument()
    expect(screen.queryByText('Network')).toBeNull()
  })

  it('0x recipient to hub → unshield-local: review shows the "Public" privacy row + hub network', () => {
    renderModal({ open: 'payment', shielded: 10_000_000n })
    completeRecipientStep(VALID_EVM, '31337')
    fireEvent.change(screen.getByLabelText('Send amount'), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: /Review/ }))
    expect(screen.getByText('Public transfer.')).toBeInTheDocument()
    expect(screen.getByText(/Anvil Hub/)).toBeInTheDocument()
  })

  it('0x recipient to a client chain → unshield-xchain: review shows the client network name', () => {
    renderModal({ open: 'payment', shielded: 10_000_000n })
    completeRecipientStep(VALID_EVM, '31338')
    fireEvent.change(screen.getByLabelText('Send amount'), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: /Review/ }))
    expect(screen.getByText(/Anvil Client A/)).toBeInTheDocument()
  })

  it('transfer-shielded Confirm advances to the progress step', async () => {
    renderModal({ open: 'payment', shielded: 10_000_000n })
    completeRecipientStep(VALID_0ZK)
    fireEvent.change(screen.getByLabelText('Send amount'), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: /Review/ }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Confirm send/ }))
    })
    await waitFor(() => {
      expect(screen.getByText('Preparing transaction')).toBeInTheDocument()
    })
  })

  it('unshield-local Confirm advances to the progress step', async () => {
    renderModal({ open: 'payment', shielded: 10_000_000n })
    completeRecipientStep(VALID_EVM, '31337')
    fireEvent.change(screen.getByLabelText('Send amount'), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: /Review/ }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Confirm send/ }))
    })
    await waitFor(() => {
      expect(screen.getByText('Preparing transaction')).toBeInTheDocument()
    })
  })

  it('unshield-xchain Confirm advances to the progress step', async () => {
    renderModal({ open: 'payment', shielded: 10_000_000n })
    completeRecipientStep(VALID_EVM, '31338')
    fireEvent.change(screen.getByLabelText('Send amount'), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: /Review/ }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Confirm send/ }))
    })
    await waitFor(() => {
      expect(screen.getByText('Preparing transaction')).toBeInTheDocument()
    })
  })

  it('the close button closes the modal', () => {
    const store = renderModal({ open: 'payment', shielded: 10_000_000n })
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(store.get(openModalAtom)).toBeNull()
  })

  it('Back on the amount step returns to the recipient step', () => {
    renderModal({ open: 'payment', shielded: 10_000_000n })
    completeRecipientStep(VALID_0ZK)
    // On the amount step now — go Back.
    fireEvent.click(screen.getByRole('button', { name: /Back/ }))
    // Recipient input retains the address (shown middle-truncated when blurred; full value in `title`).
    expect(screen.getByLabelText('Recipient address')).toHaveAttribute('title', VALID_0ZK)
  })

  // The former `withdraw` variant (unshield to your own wallet) moved to the Shield/Unshield tabbed
  // modal — see ShieldModal.test.tsx's Unshield-tab coverage. SendModal is send-only now.

  describe('private send — split fee priced at review', () => {
    function reviewPrivateSend(amount = '3') {
      const store = renderModal({ open: 'payment', shielded: 10_000_000n })
      completeRecipientStep(VALID_0ZK)
      fireEvent.change(screen.getByLabelText('Send amount'), { target: { value: amount } })
      fireEvent.click(screen.getByRole('button', { name: /Review/ }))
      return store
    }

    it('shows the planned split fee in the total, with no extra explanation', () => {
      hoistedPlan.plan = { ...hoistedPlan.defaults(), fee: 40_000n, proofs: 2 }
      reviewPrivateSend()
      // 3 USDC + 0.04 fee (two proofs at 0.02) is what leaves the balance — the fee speaks for itself.
      expect(screen.getByText(/3\.04/)).toBeInTheDocument()
      expect(screen.queryByText(/proofs/)).toBeNull()
    })

    it('holds Confirm while the fee is still being worked out', () => {
      hoistedPlan.plan = { ...hoistedPlan.defaults(), fee: null, proofs: null, pending: true }
      reviewPrivateSend()
      expect(screen.getByText(/Working out the fee/)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Confirm send/ })).toBeDisabled()
    })

    it('blocks Confirm with the planner\'s reason when the send can\'t be made', () => {
      hoistedPlan.plan = { ...hoistedPlan.defaults(), fee: null, proofs: null, error: 'Send a smaller amount for now.' }
      reviewPrivateSend()
      expect(screen.getByText('Send a smaller amount for now.')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Confirm send/ })).toBeDisabled()
    })

    it('offers "Merge notes" when the planner says the wallet is too fragmented, carrying the blocked send', () => {
      hoistedPlan.plan = { ...hoistedPlan.defaults(), fee: null, proofs: null, error: 'Merge your notes, then try again.', remedy: 'merge-notes' }
      const store = reviewPrivateSend()
      fireEvent.click(screen.getByRole('button', { name: 'Merge notes' }))
      expect(store.get(openModalAtom)).toBe('merge')
      expect(store.get(mergeIntentAtom)).toEqual({
        token: 'usdc',
        blocked: { kind: 'transfer-shielded', amount: 3_000_000n, recipient: VALID_0ZK, perProofFee: 0n },
      })
    })

    it('offers "Merge notes" on the error screen when the send failed for fragmentation', async () => {
      const store = reviewPrivateSend()
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Confirm send/ }))
      })
      await waitFor(() => expect(screen.getByText('Preparing transaction')).toBeInTheDocument())
      // The handler failed the build: too fragmented, fixable by merging.
      act(() => {
        store.set(txListAtom, store.get(txListAtom).map((r) =>
          r.kind === 'transfer-shielded'
            ? ({ ...r, executionState: 'failed', artifacts: { ...r.artifacts, error: { code: 'PRE_FLIGHT_REVERT', message: 'Merge your notes, then try again.', remedy: 'merge-notes' } } } as TxRecord)
            : r,
        ))
      })
      fireEvent.click(await screen.findByRole('button', { name: 'Merge notes' }))
      expect(store.get(openModalAtom)).toBe('merge')
      expect(store.get(mergeIntentAtom)?.blocked?.kind).toBe('transfer-shielded')
    })

    it('offers the fee-aware Max from the plan', () => {
      hoistedPlan.plan = { ...hoistedPlan.defaults(), maxInput: 9_960_000n }
      renderModal({ open: 'payment', shielded: 10_000_000n })
      completeRecipientStep(VALID_0ZK)
      fireEvent.click(screen.getByRole('button', { name: /Max/ }))
      expect(screen.getByLabelText('Send amount')).toHaveValue('9.96')
    })

    it('submits the reviewed total and the per-proof fee it was priced at', async () => {
      hoistedPlan.plan = { ...hoistedPlan.defaults(), fee: 0n, proofs: 1, priceAt: vi.fn(async () => 0n) }
      const store = reviewPrivateSend()
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Confirm send/ }))
      })
      await waitFor(() => expect(screen.getByText('Preparing transaction')).toBeInTheDocument())
      const record = store.get(txListAtom).find((r) => r.kind === 'transfer-shielded') as TxRecord<'transfer-shielded'>
      expect(record.meta.broadcasterFeeAmount).toBe(0n)
      expect(record.meta.broadcasterFeePerProof).toBe(0n)
      expect(hoistedPlan.plan.priceAt).toHaveBeenCalledOnce()
    })

    it('returns to Review with the fee-updated banner when the fee re-priced at submit differs', async () => {
      hoistedPlan.plan = { ...hoistedPlan.defaults(), fee: 0n, proofs: 1, priceAt: vi.fn(async () => 20_000n) }
      const store = reviewPrivateSend()
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Confirm send/ }))
      })
      expect(screen.getByText(/fee changed/)).toBeInTheDocument()
      expect(hoistedPlan.plan.invalidate).toHaveBeenCalledOnce()
      // Nothing was submitted.
      expect(store.get(txListAtom).some((r) => r.kind === 'transfer-shielded')).toBe(false)
    })
  })
})
