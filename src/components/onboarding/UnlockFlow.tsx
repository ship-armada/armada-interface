// ABOUTME: Returning-user unlock — three modes (paste root_secret hex, upload backup file, re-sign with EVM wallet) gated by Tabs.
// ABOUTME: All three modes resolve to a re-unlocked keyManager via useShieldedWallet; the caller's `onUnlocked` then advances the App-level guard.

import { useId, useState, type ChangeEvent, type FormEvent } from 'react'
import { Lock } from 'lucide-react'
import { OnboardingShell } from './OnboardingShell'
import { FlowFooter } from '@/components/flow/FlowFooter'
import { Tabs } from '@/components/ui'
import { useShieldedWallet } from '@/hooks/useShieldedWallet'
import styles from './UnlockFlow.module.css'

export interface UnlockFlowProps {
  /** Called when unlock succeeds. Parent flips App-level mode to "app". */
  onUnlocked: () => void
}

type Mode = 'paste' | 'backup' | 'sign'

const MODES: ReadonlyArray<{ id: Mode; label: string }> = [
  { id: 'paste', label: 'Paste secret' },
  { id: 'backup', label: 'Backup file' },
  { id: 'sign', label: 'Sign again' },
]

export function UnlockFlow({ onUnlocked }: UnlockFlowProps) {
  const { unlockByPaste, unlockByBackup, enroll } = useShieldedWallet()
  const [mode, setMode] = useState<Mode>('paste')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Per-mode form state. Kept separate so switching tabs doesn't carry data across modes
  // (especially the paste field — we don't want a hex secret lingering in the file-mode tab).
  const [pasteValue, setPasteValue] = useState('')
  const [backupFile, setBackupFile] = useState<File | null>(null)
  const [backupPassphrase, setBackupPassphrase] = useState('')

  const pasteInputId = useId()
  const backupFileId = useId()
  const backupPassphraseId = useId()

  function switchMode(next: Mode) {
    if (next === mode) return
    setMode(next)
    setError(null)
    // Clear the in-progress field of the mode we're leaving so secrets don't sit in DOM state.
    if (mode === 'paste') setPasteValue('')
    if (mode === 'backup') {
      setBackupFile(null)
      setBackupPassphrase('')
    }
  }

  async function handlePasteSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!pasteValue) return
    setError(null)
    setSubmitting(true)
    try {
      await unlockByPaste(pasteValue)
      setPasteValue('') // drop the hex from React state once we've consumed it
      onUnlocked()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unlock failed.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleBackupSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!backupFile || !backupPassphrase) return
    setError(null)
    setSubmitting(true)
    try {
      await unlockByBackup(backupFile, backupPassphrase)
      setBackupFile(null)
      setBackupPassphrase('')
      onUnlocked()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unlock failed.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSignAgain() {
    setError(null)
    setSubmitting(true)
    try {
      await enroll()
      onUnlocked()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unlock failed.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <OnboardingShell title="Unlock your account" currentStep={1} totalSteps={1} showIndicator={false}>
      <div className={styles.root}>
        <div className={styles.icon} aria-hidden="true">
          <Lock size={32} />
        </div>
        <Tabs items={MODES} selected={mode} onSelect={switchMode} ariaLabel="Unlock method" />

        {mode === 'paste' && (
          <form className={styles.root} onSubmit={handlePasteSubmit}>
            <p className={styles.body}>
              Paste your 64-character recovery secret to restore this account.
            </p>
            <div className={styles.field}>
              <label htmlFor={pasteInputId} className={styles.label}>
                Recovery secret (hex)
              </label>
              <input
                id={pasteInputId}
                type="password"
                autoComplete="off"
                autoFocus
                spellCheck={false}
                className={styles.input}
                value={pasteValue}
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  setPasteValue(e.target.value)
                  setError(null)
                }}
              />
            </div>
            {error ? (
              <div role="alert" className={styles.error}>{error}</div>
            ) : null}
            <FlowFooter
              className={styles.footer}
              primary={{
                label: submitting ? 'Unlocking…' : 'Unlock',
                type: 'submit',
                disabled: !pasteValue || submitting,
              }}
            />
          </form>
        )}

        {mode === 'backup' && (
          <form className={styles.root} onSubmit={handleBackupSubmit}>
            <p className={styles.body}>
              Choose a backup file from Settings → Export and enter the passphrase you set.
            </p>
            <div className={styles.field}>
              <label htmlFor={backupFileId} className={styles.label}>
                Backup file
              </label>
              <input
                id={backupFileId}
                type="file"
                accept="application/json,.json"
                className={styles.input}
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  setBackupFile(e.target.files?.[0] ?? null)
                  setError(null)
                }}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor={backupPassphraseId} className={styles.label}>
                Passphrase
              </label>
              <input
                id={backupPassphraseId}
                type="password"
                autoComplete="current-password"
                className={styles.input}
                value={backupPassphrase}
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  setBackupPassphrase(e.target.value)
                  setError(null)
                }}
              />
            </div>
            {error ? (
              <div role="alert" className={styles.error}>{error}</div>
            ) : null}
            <FlowFooter
              className={styles.footer}
              primary={{
                label: submitting ? 'Unlocking…' : 'Unlock',
                type: 'submit',
                disabled: !backupFile || !backupPassphrase || submitting,
              }}
            />
          </form>
        )}

        {mode === 'sign' && (
          <div className={styles.root}>
            <p className={styles.body}>
              Re-signing only restores access if your wallet produces deterministic signatures
              (most don't). If the checksum from your signature doesn't match the one saved for
              this device, you'll be asked to use Paste secret or Backup file instead.
            </p>
            {error ? (
              <div role="alert" className={styles.error}>{error}</div>
            ) : null}
            <FlowFooter
              className={styles.footer}
              primary={{
                label: submitting ? 'Waiting for signature…' : 'Sign to unlock',
                onClick: handleSignAgain,
                disabled: submitting,
              }}
            />
          </div>
        )}
      </div>
    </OnboardingShell>
  )
}
