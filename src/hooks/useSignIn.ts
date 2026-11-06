// ABOUTME: useSignIn — the dashboard sign-in card's inline sign-in: one shared attempt (submitting / error in atoms), which on
// ABOUTME: success clears the lock reason and opens any flow queued while locked; an unsupported wallet goes to the restore modal.

import { useCallback } from 'react'
import { useAtomValue, useStore } from 'jotai'
import { useShieldedWallet } from '@/hooks/useShieldedWallet'
import { isNonDeterministicSignerError } from '@/lib/crypto/determinism'
import { normalizeEnrollmentError } from '@/lib/shielded/enrollmentErrors'
import { lockReasonAtom, openModalAtom, restoreEntryAtom, signInResumeAtom, signInStatusAtom } from '@/state/ui'

/**
 * `start()` asks the wallet for the sign-in signature (first visit and returning alike — `signIn()` derives or re-derives
 * the same identity). The card and `useOpenActionModal` share one attempt: a start while one is pending is ignored.
 */
export function useSignIn() {
  const { signIn } = useShieldedWallet()
  const store = useStore()
  const { submitting, error } = useAtomValue(signInStatusAtom)

  const start = useCallback(async () => {
    if (store.get(signInStatusAtom).submitting) return
    store.set(signInStatusAtom, { submitting: true, error: null })
    try {
      await signIn()
      store.set(signInStatusAtom, { submitting: false, error: null })
      store.set(lockReasonAtom, null)
      // Straight into the flow requested while locked; else stay on the dashboard.
      const next = store.get(signInResumeAtom)
      store.set(signInResumeAtom, null)
      if (next) store.set(openModalAtom, next)
    } catch (err) {
      // Smart-account / non-RFC-6979 wallets can't use sign-in: the compatibility screen, whose way on is restoring.
      if (isNonDeterministicSignerError(err)) {
        store.set(signInStatusAtom, { submitting: false, error: null })
        store.set(restoreEntryAtom, { view: 'signer-error', reason: err.reason })
        store.set(openModalAtom, 'restore')
        return
      }
      store.set(signInStatusAtom, { submitting: false, error: normalizeEnrollmentError(err).message })
    }
  }, [signIn, store])

  return { start, submitting, error }
}
