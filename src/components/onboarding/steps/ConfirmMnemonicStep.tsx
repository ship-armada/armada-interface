// ABOUTME: Step 3 of onboarding — 3-word fill-in confirming the user has the recovery phrase recorded.
// ABOUTME: Word positions are deterministic (3rd / 7th / 11th) so the test is consistent across runs; trims + lowercases input before comparison.

import { useId, useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import { FlowFooter } from '@/components/flow/FlowFooter'
import styles from './ConfirmMnemonicStep.module.css'

export interface ConfirmMnemonicStepProps {
  mnemonic: string
  onBack: () => void
  onConfirmed: () => void
}

/** Positions (1-based) to challenge the user on. Static to give predictable instructions and tests. */
const CHALLENGE_INDICES_1_BASED = [3, 7, 11] as const

export function ConfirmMnemonicStep({ mnemonic, onBack, onConfirmed }: ConfirmMnemonicStepProps) {
  const words = useMemo(() => mnemonic.split(' '), [mnemonic])
  const expected = useMemo(
    () => CHALLENGE_INDICES_1_BASED.map(i => words[i - 1] ?? ''),
    [words],
  )
  const [entered, setEntered] = useState<string[]>(['', '', ''])
  const [error, setError] = useState<string | null>(null)
  const inputIdBase = useId()

  function update(idx: number, value: string) {
    const next = entered.slice()
    next[idx] = value
    setEntered(next)
    setError(null)
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const matches = entered.every((val, i) => val.trim().toLowerCase() === expected[i])
    if (!matches) {
      setError("Those words don't match. Check your recovery phrase and try again.")
      return
    }
    onConfirmed()
  }

  const allFilled = entered.every(v => v.trim().length > 0)

  return (
    <form className={styles.root} onSubmit={handleSubmit}>
      <div className={styles.headline}>Confirm your recovery phrase</div>
      <p className={styles.body}>
        Type the words at the positions below to confirm you've saved your phrase.
      </p>
      <div className={styles.fields}>
        {CHALLENGE_INDICES_1_BASED.map((pos, i) => {
          const id = `${inputIdBase}-${i}`
          return (
            <div key={pos} className={styles.field}>
              <label htmlFor={id} className={styles.label}>
                Word #{pos}
              </label>
              <input
                id={id}
                type="text"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                className={styles.input}
                value={entered[i] ?? ''}
                onChange={(e: ChangeEvent<HTMLInputElement>) => update(i, e.target.value)}
              />
            </div>
          )
        })}
      </div>
      {error ? (
        <div role="alert" className={styles.error}>
          {error}
        </div>
      ) : null}
      <FlowFooter
        className={styles.footer}
        primary={{ label: 'Continue', type: 'submit', disabled: !allFilled }}
        secondary={{ label: 'Back', onClick: onBack }}
      />
    </form>
  )
}
