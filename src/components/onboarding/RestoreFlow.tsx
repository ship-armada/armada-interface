// ABOUTME: RestoreFlow — restore the shielded wallet from an encrypted backup file or a pasted recovery secret, and the
// ABOUTME: compatibility screen for a wallet that can't use sign-in (a non-deterministic signer), whose way on is restoring.

import { useId, useState, type ChangeEvent, type FormEvent } from 'react'
import { useDisconnect } from 'wagmi'
import { Button, Text } from '@/design'
import { FlowFooter } from '@/components/flow/FlowFooter'
import { Tooltip } from '@/components/ui'
import { useShieldedWallet } from '@/hooks/useShieldedWallet'
import type { NonDeterministicSignerErrorReason } from '@/lib/crypto/determinism'
import { NonDeterministicSignerScreen } from './NonDeterministicSignerScreen'
import styles from './RestoreFlow.module.css'

export interface RestoreFlowProps {
  /** Where it opens: the restore form, or the compatibility screen after sign-in failed the determinism check. */
  initialView?: 'restore' | 'signer-error'
  /** Why the determinism check failed — for the compatibility screen. */
  signerErrorReason?: NonDeterministicSignerErrorReason
  /** Called when a restore succeeds (the modal closes, continuing into any queued flow). */
  onUnlocked: () => void
  /** Back to the dashboard's sign-in card ("Back to sign in", or "Try a different wallet" after disconnecting). */
  onClose: () => void
}

type View = 'restore' | 'signer-error'
type RestoreMode = 'backup' | 'paste'

/** Example only — 64 hex chars, matches restore validation shape. */
const PASTE_SECRET_PLACEHOLDER =
  '09fa2bfde60ba3f291c8b7e0c4d8e1f2a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0'

const PASTE_HEADS_UP =
  'Pasting the raw secret triggers a full chain rescan to recover your balances. This can take a few minutes. For faster restores in the future, use the encrypted Backup file instead — and re-export a fresh backup from Settings once this scan completes.'

const SIGNER_INCOMPATIBLE_BANNER =
  "Sign-in didn't work for this wallet. Use your encrypted backup file or your recovery secret instead."

export function RestoreFlow({
  initialView = 'restore',
  signerErrorReason = 'first-sign-mismatch',
  onUnlocked,
  onClose,
}: RestoreFlowProps) {
  const { unlockByPaste, unlockByBackup } = useShieldedWallet()
  const { disconnect } = useDisconnect()

  const [view, setView] = useState<View>(initialView)
  const [restoreMode, setRestoreMode] = useState<RestoreMode>('backup')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Set when the user reaches restore via the signer-incompatible screen — surfaces a banner so
  // they remember why sign-in was unavailable while picking a recovery path.
  const [signerIncompatible, setSignerIncompatible] = useState(false)

  // Per-mode form state, kept separate so switching restore methods doesn't carry a hex secret
  // into the file tab (or vice-versa).
  const [pasteValue, setPasteValue] = useState('')
  const [pasteFromClipboard, setPasteFromClipboard] = useState(false)
  const [backupFile, setBackupFile] = useState<File | null>(null)
  const [backupPassphrase, setBackupPassphrase] = useState('')

  const pasteInputId = useId()
  const backupFileId = useId()
  const backupPassphraseId = useId()

  function goRestore(mode: RestoreMode = 'backup') {
    setError(null)
    setRestoreMode(mode)
    setView('restore')
  }

  function switchRestoreMode(next: RestoreMode) {
    if (next === restoreMode) return
    setRestoreMode(next)
    setError(null)
    // Clear the field of the mode we're leaving so secrets don't sit in DOM state.
    if (next === 'backup') setPasteValue('')
    if (next === 'paste') {
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
      setPasteValue('') // drop the hex from React state once consumed
      onUnlocked()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Restore failed.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handlePasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText()
      setPasteValue(text.trim())
      setError(null)
      setPasteFromClipboard(true)
      window.setTimeout(() => setPasteFromClipboard(false), 1200)
    } catch {
      // Clipboard read can fail in iframes or insecure contexts.
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
      setError(err instanceof Error ? err.message : 'Restore failed.')
    } finally {
      setSubmitting(false)
    }
  }

  if (view === 'signer-error') {
    return (
      <NonDeterministicSignerScreen
        reason={signerErrorReason}
        onUseRecovery={() => {
          setSignerIncompatible(true)
          goRestore('backup')
        }}
        onTryDifferentWallet={() => {
          disconnect()
          onClose()
        }}
      />
    )
  }

  return (
    <div className={styles.flow}>
      <section className={styles.shell} aria-label="Restore your account">
        <Text variant="display-xl" as="h1" className={styles.title}>
          Restore wallet
        </Text>
        {signerIncompatible ? (
          <div role="status" className={styles.banner}>
            {SIGNER_INCOMPATIBLE_BANNER}
          </div>
        ) : null}

        {restoreMode === 'backup' ? (
          <form className={styles.modeForm} onSubmit={handleBackupSubmit}>
            <div className={styles.modeFormFields}>
              <p className={styles.body}>
                Choose a backup file you exported from Settings → Export and enter its passphrase.
              </p>
              <div className={styles.field}>
                <label htmlFor={backupFileId} className={styles.label}>
                  Backup file
                </label>
                <div className={styles.fileInputArea}>
                  <input
                    id={backupFileId}
                    type="file"
                    accept="application/json,.json"
                    className={styles.fileInput}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => {
                      setBackupFile(e.target.files?.[0] ?? null)
                      setError(null)
                    }}
                  />
                  <span className={styles.fileInputDisplay}>{backupFile?.name ?? ''}</span>
                </div>
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
                <div role="alert" className={styles.error}>
                  {error}
                </div>
              ) : null}
            </div>
            <FlowFooter
              className={styles.footer}
              layout="stack"
              primary={{
                label: submitting ? 'Restoring…' : 'Restore',
                type: 'submit',
                // Backup passphrases are always ≥8 (export floor); a shorter entry can't be valid.
                disabled: !backupFile || backupPassphrase.length < 8,
                loading: submitting,
                showIcon: false,
              }}
            />
          </form>
        ) : (
          <form className={styles.modeForm} onSubmit={handlePasteSubmit}>
            <div className={styles.modeFormFields}>
              <p className={styles.body}>
                Paste your 64-character recovery secret.{' '}
                <Tooltip
                  variant="rich"
                  title="About pasting your recovery secret"
                  description={PASTE_HEADS_UP}
                >
                  <button
                    type="button"
                    className={styles.infoTrigger}
                    aria-label="About pasting your recovery secret"
                  >
                    <svg className={styles.infoIcon} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                      <path
                        fillRule="evenodd"
                        clipRule="evenodd"
                        d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm8.706-1.442c1.146-.573 2.437.463 2.126 1.706l-.709 2.836.042-.02a.75.75 0 0 1 .67 1.34l-.04.022c-1.147.573-2.438-.463-2.127-1.706l.71-2.836-.042.02a.75.75 0 1 1-.671-1.34l.041-.022ZM12 9a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z"
                      />
                    </svg>
                  </button>
                </Tooltip>
              </p>
              <div className={styles.secretField}>
                <textarea
                  id={pasteInputId}
                  rows={2}
                  autoComplete="off"
                  autoFocus
                  spellCheck={false}
                  className={styles.secretInput}
                  placeholder={PASTE_SECRET_PLACEHOLDER}
                  aria-label="Recovery secret (64 hexadecimal characters)"
                  value={pasteValue}
                  disabled={submitting}
                  onChange={(e: ChangeEvent<HTMLTextAreaElement>) => {
                    setPasteValue(e.target.value)
                    setError(null)
                  }}
                />
                <div className={styles.pasteBtnWrap}>
                  <Button
                    variant="secondary"
                    size="sm"
                    label={pasteFromClipboard ? 'Pasted' : 'Paste'}
                    showIcon={false}
                    disabled={submitting}
                    onClick={handlePasteFromClipboard}
                  />
                </div>
              </div>
              {error ? (
                <div role="alert" className={styles.error}>
                  {error}
                </div>
              ) : null}
            </div>
            <FlowFooter
              className={styles.footer}
              layout="stack"
              primary={{
                label: submitting ? 'Restoring…' : 'Restore',
                type: 'submit',
                disabled: !pasteValue,
                loading: submitting,
                showIcon: false,
              }}
            />
          </form>
        )}

        <button
          type="button"
          className={styles.textLink}
          onClick={() => switchRestoreMode(restoreMode === 'backup' ? 'paste' : 'backup')}
        >
          {restoreMode === 'backup'
            ? 'Paste a recovery secret instead'
            : 'Use a backup file instead'}
        </button>
        <button type="button" className={styles.textLink} onClick={onClose}>
          Back to sign in
        </button>
      </section>
    </div>
  )
}
