// ABOUTME: Reset wallet dialog — destructive double-confirm (typed acknowledgement + explicit button), then calls useShieldedWallet().reset().
// ABOUTME: After a successful reset, the wallet atoms clear and the App.tsx guard will route the user to onboarding on next mount.

import { useEffect, useState, type ChangeEvent } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Modal } from '@/components/ui'
import { FlowFooter } from '@/components/flow/FlowFooter'
import { useShieldedWallet } from '@/hooks/useShieldedWallet'
import styles from './ResetWalletDialog.module.css'

const REQUIRED_PHRASE = 'reset'

export interface ResetWalletDialogProps {
  open: boolean
  onClose: () => void
}

export function ResetWalletDialog({ open, onClose }: ResetWalletDialogProps) {
  const { reset } = useShieldedWallet()
  const [typed, setTyped] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) return
    setTyped('')
    setError(null)
    setSubmitting(false)
  }, [open])

  async function handleReset() {
    setError(null)
    setSubmitting(true)
    try {
      await reset()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed.')
    } finally {
      setSubmitting(false)
    }
  }

  const canReset = typed.trim().toLowerCase() === REQUIRED_PHRASE

  return (
    <Modal open={open} onClose={onClose} title="Reset private wallet" wrapBody>
      <div className={styles.root}>
        <div className={styles.icon} aria-hidden="true">
          <AlertTriangle size={32} />
        </div>
        <p className={styles.body}>
          This deletes your encrypted recovery phrase and key material from this device. You'll
          need to import or create a new account afterwards. Anything not also kept in your written
          recovery phrase will be lost permanently.
        </p>
        <div className={styles.field}>
          <label htmlFor="reset-confirm" className={styles.label}>
            Type <span className={styles.phrase}>{REQUIRED_PHRASE}</span> to confirm
          </label>
          <input
            id="reset-confirm"
            type="text"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className={styles.input}
            value={typed}
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              setTyped(e.target.value)
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
            label: submitting ? 'Resetting…' : 'Reset wallet',
            onClick: handleReset,
            disabled: !canReset || submitting,
          }}
          secondary={{ label: 'Cancel', onClick: onClose }}
        />
      </div>
    </Modal>
  )
}
