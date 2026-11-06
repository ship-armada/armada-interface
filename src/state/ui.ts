// ABOUTME: UI-only atoms — which modal is open, current page intent. No business data.
// ABOUTME: Page-level modal controllers live here so any component can open a flow.

import { atom } from 'jotai'
import type { NonDeterministicSignerErrorReason } from '@/lib/crypto/determinism'
import type { MergeIntent } from '@/lib/shielded/merge-intent'

export type ModalKind =
  | null
  | 'shield'
  | 'unshield'
  | 'yield-deposit'
  | 'yield-withdraw'
  | 'payment'
  | 'receive'
  | 'request'
  | 'settings'
  | 'wallet-unlock'
  | 'wallet-reset'
  | 'merge'
  | 'restore'

/** Dashboard / action flows that require a connected EVM wallet before opening. */
export type ActionModalKind = Exclude<
  ModalKind,
  null | 'wallet-unlock' | 'wallet-reset' | 'receive' | 'settings' | 'merge' | 'restore'
>

export const openModalAtom = atom<ModalKind>(null)

/**
 * The flow to open once sign-in succeeds — set when an action is requested while locked (`useOpenActionModal`), so
 * sign-in (`useSignIn`) continues into it instead of leaving the user on the dashboard. null = just sign in.
 */
export const signInResumeAtom = atom<ActionModalKind | null>(null)

/** True while waiting for a wallet to connect before signing in (or opening a flow) — set when an action is tapped
 *  with no wallet connected; `useOpenActionModal` carries on once it connects. */
export const signInAwaitingConnectAtom = atom(false)

/** Why the wallet last locked — shown on the sign-in card ("Locked after 15 minutes of inactivity"). Cleared on unlock. */
export type LockReason = 'idle' | 'hidden' | 'manual'

export const lockReasonAtom = atom<LockReason | null>(null)

/** The sign-in attempt shown on the dashboard's sign-in card — shared so the card and `useOpenActionModal` drive one
 *  attempt (`useSignIn`). */
export interface SignInStatus {
  submitting: boolean
  error: string | null
}

export const signInStatusAtom = atom<SignInStatus>({ submitting: false, error: null })

/** What the restore modal opens on: the restore form, or the unsupported-wallet screen after sign-in failed the
 *  determinism check (whose main way on is restoring). */
export type RestoreEntry = { view: 'restore' } | { view: 'signer-error'; reason: NonDeterministicSignerErrorReason }

export const restoreEntryAtom = atom<RestoreEntry>({ view: 'restore' })

/**
 * Set when the `@armada/sdk` read instance can't open the shielded scan DB because another live
 * instance in this origin (a second tab) already holds it — the SDK enforces one instance per origin
 * to avoid corrupting scan state. Drives the full-screen `SingleTabGate`. Sticky for the session:
 * clearing it wouldn't help since the SDK won't re-acquire the storage lock without a fresh init
 * (the user reloads once the other tab is closed).
 */
export const anotherTabActiveAtom = atom(false)

/**
 * Pending payment-request hand-off from a `/pay-via-link` landing to the Send flow. When set, the
 * app opens the `payment` modal and `SendModal` seeds the recipient (+ amount) from it, then clears
 * it. Carries no funds/keys — just a prefill intent.
 */
export interface PaymentIntent {
  recipient: string
  amount?: string
}

export const paymentIntentAtom = atom<PaymentIntent | null>(null)

/**
 * "Do it again" hand-off from an Activity receipt to the flow it repeats. When set, the receipt opens that flow's modal
 * (`components/dashboard/repeatIntent::repeatModalFor`) and the modal seeds its amount step from it — the recipient /
 * chain / vault direction and the amount, still editable — then clears it. Carries no funds/keys — just a prefill.
 */
export type RepeatIntent =
  | { flow: 'send'; recipient: string; amount: string; destChainId: number }
  | { flow: 'unshield'; amount: string; toChainId: number }
  | { flow: 'shield'; amount: string; fromChainId: number }
  | { flow: 'earn'; direction: 'add' | 'withdraw'; amount: string }

export const repeatIntentAtom = atom<RepeatIntent | null>(null)

/**
 * What the `merge` modal opens with: the token to merge and, when a spend was blocked by fragmentation,
 * that spend (so the preview can say whether one merge unblocks it). Set by whoever opens the modal —
 * a blocked flow's "Merge notes" button or Settings. Carries no funds/keys — just a prefill intent.
 */
export const mergeIntentAtom = atom<MergeIntent | null>(null)

/**
 * Whether balances are hidden across the app. Shared so the dashboard eye toggle and the wallet
 * panel's hide-balance control stay in sync — hiding in one place hides everywhere.
 */
export const balanceHiddenAtom = atom<boolean>(false)

/**
 * The Dashboard's "All activity" side panel. App-level so the header's pending pill (and a tx notice) can open it from
 * anywhere.
 */
export const activityPanelOpenAtom = atom<boolean>(false)

/**
 * The tx record whose Activity receipt is open (null = closed). App-level so a tx notice or the pending pill can open
 * a receipt directly.
 */
export const receiptTxIdAtom = atom<string | null>(null)
