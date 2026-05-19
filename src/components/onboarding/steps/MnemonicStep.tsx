// ABOUTME: Step 2 of onboarding — displays the freshly-generated 12-word mnemonic with Copy + "I've saved it" controls.
// ABOUTME: Words are rendered in a numbered grid; clipboard copy is opt-in (clears on step exit per lib/railgun/CLAUDE.md guidance).

import { useState } from 'react'
import { ClipboardCopy, Check } from 'lucide-react'
import { FlowFooter } from '@/components/flow/FlowFooter'
import styles from './MnemonicStep.module.css'

export interface MnemonicStepProps {
  mnemonic: string
  onBack: () => void
  onContinue: () => void
}

export function MnemonicStep({ mnemonic, onBack, onContinue }: MnemonicStepProps) {
  const [copied, setCopied] = useState(false)
  const words = mnemonic.split(' ')

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(mnemonic)
      setCopied(true)
      // Brief positive feedback; the mnemonic stays on-screen so the user can still hand-copy.
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API can fail in iframes / insecure contexts. Silent — user can still read the words.
    }
  }

  return (
    <div className={styles.root}>
      <div className={styles.headline}>Save your recovery phrase</div>
      <p className={styles.body}>
        This 12-word phrase is the only way to restore your account. Write it down and keep it
        somewhere safe — Armada never stores it on a server.
      </p>
      <ol className={styles.grid} aria-label="Recovery phrase">
        {words.map((word, i) => (
          <li key={i} className={styles.wordRow}>
            <span className={styles.wordIndex}>{i + 1}</span>
            <span className={styles.word}>{word}</span>
          </li>
        ))}
      </ol>
      <button
        type="button"
        className={styles.copyBtn}
        onClick={handleCopy}
        aria-label="Copy recovery phrase"
      >
        {copied ? <Check size={14} aria-hidden="true" /> : <ClipboardCopy size={14} aria-hidden="true" />}
        <span>{copied ? 'Copied' : 'Copy to clipboard'}</span>
      </button>
      <FlowFooter
        className={styles.footer}
        primary={{ label: "I've saved it", onClick: onContinue }}
        secondary={{ label: 'Back', onClick: onBack }}
      />
    </div>
  )
}
