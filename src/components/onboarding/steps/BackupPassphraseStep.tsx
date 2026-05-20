// ABOUTME: Onboarding step — passphrase entry that encrypts root_secret into a downloadable JSON backup blob.
// ABOUTME: After Download, advances on Continue; before Download the Continue CTA is disabled so the user can't skip the backup.

import { useId, useState, type ChangeEvent, type FormEvent } from 'react'
import { Download } from 'lucide-react'
import { FlowFooter } from '@/components/flow/FlowFooter'
import type { BackupBlob } from '@/lib/crypto/kdf'
import styles from './PassphraseStep.module.css'

export interface BackupPassphraseStepProps {
  /** Called when the user submits a valid passphrase. Returns the encrypted backup blob. */
  onCreateBackup: (passphrase: string) => Promise<BackupBlob>
  onBack: () => void
  onContinue: () => void
  /** Minimum acceptable passphrase length. Default 8 (matches kdf.ts::encryptRootSecret). */
  minLength?: number
}

export function BackupPassphraseStep({
  onCreateBackup,
  onBack,
  onContinue,
  minLength = 8,
}: BackupPassphraseStepProps) {
  const [passphrase, setPassphrase] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [downloaded, setDownloaded] = useState(false)
  const idBase = useId()

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (passphrase.length < minLength) {
      setError(`Passphrase must be at least ${minLength} characters.`)
      return
    }
    if (passphrase !== confirm) {
      setError("Passphrases don't match.")
      return
    }
    setError(null)
    setDownloading(true)
    try {
      const blob = await onCreateBackup(passphrase)
      // Build + trigger a browser download. We use a Blob + object URL rather than a data URL so
      // the JSON contents never end up in the URL bar / history.
      const json = JSON.stringify(blob, null, 2)
      const fileBlob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(fileBlob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'armada-backup.json'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      setDownloaded(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Backup creation failed.')
    } finally {
      setDownloading(false)
    }
  }

  const passphrasesMatch = passphrase.length >= minLength && passphrase === confirm

  return (
    <form className={styles.root} onSubmit={handleSubmit}>
      <div className={styles.headline}>Create your backup</div>
      <p className={styles.body}>
        Choose a passphrase to encrypt a backup of your recovery secret. You'll need this passphrase
        and the downloaded file together to restore your account.
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
            setDownloaded(false)
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
            setDownloaded(false)
          }}
        />
      </div>
      {error ? (
        <div role="alert" className={styles.error}>
          {error}
        </div>
      ) : null}
      {downloaded ? (
        <div style={{ color: 'var(--semantic-color-status-success)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Download size={16} aria-hidden="true" /> Backup downloaded. Keep this file safe.
        </div>
      ) : null}
      <FlowFooter
        className={styles.footer}
        primary={
          downloaded
            ? { label: 'Continue', type: 'button', onClick: onContinue }
            : {
                label: downloading ? 'Encrypting…' : 'Download backup',
                type: 'submit',
                disabled: !passphrasesMatch || downloading,
              }
        }
        secondary={{ label: 'Back', onClick: onBack, disabled: downloading }}
      />
    </form>
  )
}
