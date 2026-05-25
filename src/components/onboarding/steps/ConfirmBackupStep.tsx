// ABOUTME: Onboarding step — verifies the user can re-import their backup file by decrypting it locally and matching its checksum to the live one.
// ABOUTME: Pure dry-run: never touches keyManager, never calls SDK. Pass on success; surface decrypt failures inline.

import { useId, useState, type ChangeEvent, type FormEvent } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { FlowFooter } from '@/components/flow/FlowFooter'
import {
  antiPhishChecksumBytes,
  decryptBackup,
  formatChecksumDisplay,
  parseBackupBlob,
} from '@/lib/crypto/kdf'
import styles from './PassphraseStep.module.css'

export interface ConfirmBackupStepProps {
  /** The user's live anti-phish checksum from the just-enrolled wallet; we match against this. */
  expectedChecksum: string
  onBack: () => void
  onConfirmed: () => void
}

export function ConfirmBackupStep({ expectedChecksum, onBack, onConfirmed }: ConfirmBackupStepProps) {
  const [file, setFile] = useState<File | null>(null)
  const [passphrase, setPassphrase] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [verified, setVerified] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const idBase = useId()

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!file || !passphrase) return
    setError(null)
    setVerifying(true)
    setVerified(false)
    let rootSecret: Uint8Array | null = null
    try {
      const text = await file.text()
      let parsed: unknown
      try {
        parsed = JSON.parse(text)
      } catch {
        throw new Error('Backup file is not valid JSON.')
      }
      const blob = parseBackupBlob(parsed)
      const payload = decryptBackup(blob, passphrase)
      rootSecret = payload.rootSecret
      const checksum = formatChecksumDisplay(antiPhishChecksumBytes(rootSecret))
      if (checksum !== expectedChecksum) {
        throw new Error(
          `Backup checksum (${checksum}) does not match your live wallet (${expectedChecksum}). ` +
            'Did you upload the right file?',
        )
      }
      setVerified(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed.')
    } finally {
      // Zero out the recovered root_secret — it's a local-only verification copy; the keyManager
      // already holds the authoritative reference.
      if (rootSecret) rootSecret.fill(0)
      setVerifying(false)
    }
  }

  return (
    <form className={styles.root} onSubmit={handleSubmit}>
      <div className={styles.headline}>Confirm your backup</div>
      <p className={styles.body}>
        Re-upload the backup file you just downloaded and enter the passphrase you set. This
        confirms you can restore your account — your account isn't activated until this succeeds.
      </p>
      <div className={styles.field}>
        <label htmlFor={`${idBase}-file`} className={styles.label}>
          Backup file
        </label>
        <input
          id={`${idBase}-file`}
          type="file"
          accept="application/json,.json"
          className={styles.input}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            setFile(e.target.files?.[0] ?? null)
            setError(null)
            setVerified(false)
          }}
        />
      </div>
      <div className={styles.field}>
        <label htmlFor={`${idBase}-pass`} className={styles.label}>
          Passphrase
        </label>
        <input
          id={`${idBase}-pass`}
          type="password"
          autoComplete="current-password"
          className={styles.input}
          value={passphrase}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            setPassphrase(e.target.value)
            setError(null)
            setVerified(false)
          }}
        />
      </div>
      {error ? (
        <div role="alert" className={styles.error}>{error}</div>
      ) : null}
      {verified ? (
        <div style={{ color: 'var(--semantic-color-status-success)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <CheckCircle2 size={16} aria-hidden="true" /> Backup verified — checksum matches.
        </div>
      ) : null}
      <FlowFooter
        className={styles.footer}
        primary={
          verified
            ? { label: 'Continue', type: 'button', onClick: onConfirmed }
            : {
                label: verifying ? 'Verifying…' : 'Verify backup',
                type: 'submit',
                disabled: !file || !passphrase || verifying,
              }
        }
        secondary={{ label: 'Back', onClick: onBack, disabled: verifying }}
      />
    </form>
  )
}
