// ABOUTME: Step 4 of onboarding — choose a passphrase that will encrypt the mnemonic + key material at rest.
// ABOUTME: Enforces minimum length and matching confirmation; surfaces inline errors and disables Continue until valid.

import { useId, useState, type ChangeEvent, type FormEvent } from 'react'
import { FlowFooter } from '@/components/flow/FlowFooter'
import styles from './PassphraseStep.module.css'

export interface PassphraseStepProps {
  onBack: () => void
  onContinue: (passphrase: string) => void
  /** Minimum acceptable passphrase length. Default 8. */
  minLength?: number
}

export function PassphraseStep({ onBack, onContinue, minLength = 8 }: PassphraseStepProps) {
  const [passphrase, setPassphrase] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const idBase = useId()

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (passphrase.length < minLength) {
      setError(`Passphrase must be at least ${minLength} characters.`)
      return
    }
    if (passphrase !== confirm) {
      setError("Passphrases don't match.")
      return
    }
    onContinue(passphrase)
  }

  const canSubmit = passphrase.length >= minLength && passphrase === confirm

  return (
    <form className={styles.root} onSubmit={handleSubmit}>
      <div className={styles.headline}>Set a passphrase</div>
      <p className={styles.body}>
        Your passphrase encrypts your recovery phrase on this device. We can't reset it for
        you — choose something you'll remember.
      </p>
      <div className={styles.field}>
        <label htmlFor={`${idBase}-pass`} className={styles.label}>
          Passphrase
        </label>
        <input
          id={`${idBase}-pass`}
          type="password"
          autoComplete="new-password"
          className={styles.input}
          value={passphrase}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            setPassphrase(e.target.value)
            setError(null)
          }}
        />
      </div>
      <div className={styles.field}>
        <label htmlFor={`${idBase}-confirm`} className={styles.label}>
          Confirm passphrase
        </label>
        <input
          id={`${idBase}-confirm`}
          type="password"
          autoComplete="new-password"
          className={styles.input}
          value={confirm}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            setConfirm(e.target.value)
            setError(null)
          }}
        />
      </div>
      {error ? (
        <div role="alert" className={styles.error}>
          {error}
        </div>
      ) : null}
      <FlowFooter
        className={styles.footer}
        primary={{ label: 'Continue', type: 'submit', disabled: !canSubmit }}
        secondary={{ label: 'Back', onClick: onBack }}
      />
    </form>
  )
}
