// ABOUTME: Settings → Export recovery secret. Two modes — encrypted backup file (default) + raw hex (secondary, opt-in).
// ABOUTME: All paths require an unlocked session; the dialog clears state on close so revealed material never outlives it.

import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { Download, Eye, KeyRound } from 'lucide-react'
import { Modal, Tabs } from '@/components/ui'
import { FlowFooter } from '@/components/flow/FlowFooter'
import { useShieldedWallet } from '@/hooks/useShieldedWallet'
import { getRootSecret } from '@/lib/railgun/keyManager'
import styles from './RecoverySecretExportDialog.module.css'

export interface RecoverySecretExportDialogProps {
  open: boolean
  onClose: () => void
}

type Mode = 'file' | 'hex'

const MODES: ReadonlyArray<{ id: Mode; label: string }> = [
  { id: 'file', label: 'Backup file' },
  { id: 'hex', label: 'Show hex' },
]

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

export function RecoverySecretExportDialog({ open, onClose }: RecoverySecretExportDialogProps) {
  const { exportBackup } = useShieldedWallet()
  const [mode, setMode] = useState<Mode>('file')

  // File mode state
  const [passphrase, setPassphrase] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [downloaded, setDownloaded] = useState(false)

  // Hex mode state
  const [revealedHex, setRevealedHex] = useState<string | null>(null)
  const [hexError, setHexError] = useState<string | null>(null)

  // Reset state on close — never retain revealed material beyond the dialog's lifetime.
  useEffect(() => {
    if (open) return
    setMode('file')
    setPassphrase('')
    setError(null)
    setSubmitting(false)
    setDownloaded(false)
    setRevealedHex(null)
    setHexError(null)
  }, [open])

  async function handleFileSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!passphrase) return
    setError(null)
    setSubmitting(true)
    try {
      const blob = await exportBackup(passphrase)
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
      setPassphrase('')
      setDownloaded(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed.')
    } finally {
      setSubmitting(false)
    }
  }

  function handleRevealHex() {
    setHexError(null)
    try {
      // Read directly from keyManager — we don't proxy through the hook because there's no
      // good reason to route this through useShieldedWallet's atom plumbing. The keyManager
      // throws when the wallet is locked.
      const rs = getRootSecret()
      setRevealedHex(bytesToHex(rs))
    } catch (err) {
      setHexError(err instanceof Error ? err.message : 'Could not reveal recovery secret.')
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Export recovery secret" wrapBody>
      <div className={styles.root}>
        <Tabs items={MODES} selected={mode} onSelect={setMode} ariaLabel="Export mode" />

        {mode === 'file' && (
          <form className={styles.section} onSubmit={handleFileSubmit}>
            <div className={styles.icon} aria-hidden="true">
              <KeyRound size={32} />
            </div>
            <p className={styles.body}>
              Choose a passphrase. We'll encrypt your recovery secret into a downloadable file you
              can store offline. You need both the file and this passphrase to restore.
            </p>
            <div className={styles.field}>
              <label htmlFor="export-passphrase" className={styles.label}>
                Passphrase
              </label>
              <input
                id="export-passphrase"
                type="password"
                autoComplete="new-password"
                autoFocus
                className={styles.input}
                value={passphrase}
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  setPassphrase(e.target.value)
                  setError(null)
                  setDownloaded(false)
                }}
              />
            </div>
            {error ? (
              <div role="alert" className={styles.error}>{error}</div>
            ) : null}
            {downloaded ? (
              <div className={styles.success}>
                <Download size={16} aria-hidden="true" /> Backup downloaded. Keep this file safe.
              </div>
            ) : null}
            <FlowFooter
              className={styles.footer}
              primary={{
                label: submitting ? 'Encrypting…' : downloaded ? 'Download again' : 'Download backup',
                type: 'submit',
                disabled: !passphrase || submitting,
              }}
              secondary={{ label: downloaded ? 'Done' : 'Cancel', onClick: onClose }}
            />
          </form>
        )}

        {mode === 'hex' && (
          <div className={styles.section}>
            <div className={styles.icon} aria-hidden="true">
              <Eye size={32} />
            </div>
            <p className={styles.body}>
              The raw recovery secret is 64 hexadecimal characters. Anyone with this value can spend
              your private balance — never paste it into a website you don't fully trust.
            </p>
            {hexError ? (
              <div role="alert" className={styles.error}>{hexError}</div>
            ) : null}
            {revealedHex ? (
              <div className={styles.hex} aria-label="Recovery secret (hex)">
                {revealedHex}
              </div>
            ) : null}
            <FlowFooter
              className={styles.footer}
              primary={
                revealedHex
                  ? { label: 'Done', onClick: onClose }
                  : { label: 'Reveal hex', onClick: handleRevealHex }
              }
              secondary={revealedHex ? undefined : { label: 'Cancel', onClick: onClose }}
            />
          </div>
        )}
      </div>
    </Modal>
  )
}
