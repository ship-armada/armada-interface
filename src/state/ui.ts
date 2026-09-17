// ABOUTME: UI-only atoms — which modal is open, current page intent. No business data.
// ABOUTME: Page-level modal controllers live here so any component can open a flow.

import { atom } from 'jotai'

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

/** Dashboard / action flows that require a connected EVM wallet before opening. */
export type ActionModalKind = Exclude<
  ModalKind,
  null | 'wallet-unlock' | 'wallet-reset' | 'receive' | 'settings'
>

export const openModalAtom = atom<ModalKind>(null)

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
 * Whether balances are hidden across the app. Shared so the dashboard eye toggle and the wallet
 * panel's hide-balance control stay in sync — hiding in one place hides everywhere.
 */
export const balanceHiddenAtom = atom<boolean>(false)
