// ABOUTME: Mnemonic export dialog — passphrase gate then displays the decrypted phrase. Clears state on close.
// ABOUTME: Used by Settings → Export recovery phrase. The plaintext mnemonic lives in dialog-local state only.

import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { Eye, KeyRound } from 'lucide-react'
import { Modal } from '@/components/ui'
import { FlowFooter } from '@/components/flow/FlowFooter'
import { useShieldedWallet } from '@/hooks/useShieldedWallet'
import styles from './MnemonicExportDialog.module.css'

export interface MnemonicExportDialogProps {
  open: boolean
  onClose: () => void
}

type Phase = 'gate' | 'reveal'

export function MnemonicExportDialog({ open, onClose }: MnemonicExportDialogProps) {
  const { exportPhrase } = useShieldedWallet()
  const [phase, setPhase] = useState<Phase>('gate')
  const [passphrase, setPassphrase] = useState('')
  const [phrase, setPhrase] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Reset state on close — never retain the plaintext mnemonic beyond the dialog's lifetime.
  useEffect(() => {
    if (open) return
    setPhase('gate')
    setPassphrase('')
    setPhrase(null)
    setError(null)
    setSubmitting(false)
  }, [open])

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!passphrase) return
    setError(null)
    setSubmitting(true)
    try {
      const result = await exportPhrase(passphrase)
      setPhrase(result)
      setPassphrase('') // clear from memory once we've used it
      setPhase('reveal')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Export recovery phrase" wrapBody>
      {phase === 'gate' ? (
        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.icon} aria-hidden="true">
            <KeyRound size={32} />
          </div>
          <p className={styles.body}>
            Enter your passphrase to reveal your recovery phrase. Keep it secret — anyone with these
            12 words can spend your private balance.
          </p>
          <div className={styles.field}>
            <label htmlFor="export-passphrase" className={styles.label}>
              Passphrase
            </label>
            <input
              id="export-passphrase"
              type="password"
              autoComplete="current-password"
              autoFocus
              className={styles.input}
              value={passphrase}
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                setPassphrase(e.target.value)
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
            primary={{
              label: submitting ? 'Decrypting…' : 'Reveal',
              type: 'submit',
              disabled: !passphrase || submitting,
            }}
            secondary={{ label: 'Cancel', onClick: onClose }}
          />
        </form>
      ) : (
        <div className={styles.reveal}>
          <div className={styles.iconReveal} aria-hidden="true">
            <Eye size={32} />
          </div>
          <p className={styles.body}>
            Write these 12 words down and store them somewhere safe. Don't paste them anywhere
            online; the dialog will clear them when you close it.
          </p>
          <ol className={styles.grid} aria-label="Recovery phrase">
            {(phrase ?? '').split(' ').map((word, i) => (
              <li key={i} className={styles.wordRow}>
                <span className={styles.wordIndex}>{i + 1}</span>
                <span className={styles.word}>{word}</span>
              </li>
            ))}
          </ol>
          <FlowFooter
            className={styles.footer}
            primary={{ label: 'Done', onClick: onClose }}
          />
        </div>
      )}
    </Modal>
  )
}
