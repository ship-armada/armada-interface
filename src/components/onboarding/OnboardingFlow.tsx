// ABOUTME: First-run state machine — Welcome → Mnemonic → Confirm → Passphrase → Complete.
// ABOUTME: Generates the mnemonic on mount and holds it in component state. The Complete step is gated by App-level mode (not atom state) so the success panel gets its moment.

import { useMemo, useState } from 'react'
import { OnboardingShell } from './OnboardingShell'
import { WelcomeStep } from './steps/WelcomeStep'
import { MnemonicStep } from './steps/MnemonicStep'
import { ConfirmMnemonicStep } from './steps/ConfirmMnemonicStep'
import { PassphraseStep } from './steps/PassphraseStep'
import { CompleteStep } from './steps/CompleteStep'
import { useShieldedWallet } from '@/hooks/useShieldedWallet'
import { generateMnemonic } from '@/lib/railgun/wallet'

type Step = 'welcome' | 'mnemonic' | 'confirm-mnemonic' | 'passphrase' | 'creating' | 'complete'

const STEP_INDEX: Record<Step, number> = {
  welcome: 1,
  mnemonic: 2,
  'confirm-mnemonic': 3,
  passphrase: 4,
  creating: 4, // visually still on step 4 while createWallet is in flight
  complete: 5,
}

const TOTAL_STEPS = 5

export interface OnboardingFlowProps {
  /** Called when the user clicks Done on the final step. Parent should swap App-level mode to "app". */
  onDone: () => void
}

export function OnboardingFlow({ onDone }: OnboardingFlowProps) {
  const { create } = useShieldedWallet()
  const [step, setStep] = useState<Step>('welcome')
  // Generate once on mount; never regenerate while the user is in the middle of the flow.
  // useMemo (vs useState) makes the dep explicit; the empty deps array locks the value.
  const mnemonic = useMemo(() => generateMnemonic(), [])
  const [creationError, setCreationError] = useState<string | null>(null)

  async function handlePassphraseConfirmed(passphrase: string) {
    setCreationError(null)
    setStep('creating')
    try {
      await create(mnemonic, passphrase)
      setStep('complete')
    } catch (err) {
      // createWallet is stubbed today — surface the error and let the user retry.
      // When lib/railgun is real, this catches actual encryption / persistence failures.
      setCreationError(err instanceof Error ? err.message : 'Wallet creation failed.')
      setStep('passphrase')
    }
  }

  return (
    <OnboardingShell
      title="Set up your account"
      currentStep={STEP_INDEX[step]}
      totalSteps={TOTAL_STEPS}
    >
      {step === 'welcome' && <WelcomeStep onContinue={() => setStep('mnemonic')} />}
      {step === 'mnemonic' && (
        <MnemonicStep
          mnemonic={mnemonic}
          onBack={() => setStep('welcome')}
          onContinue={() => setStep('confirm-mnemonic')}
        />
      )}
      {step === 'confirm-mnemonic' && (
        <ConfirmMnemonicStep
          mnemonic={mnemonic}
          onBack={() => setStep('mnemonic')}
          onConfirmed={() => setStep('passphrase')}
        />
      )}
      {(step === 'passphrase' || step === 'creating') && (
        <>
          <PassphraseStep
            onBack={() => setStep('confirm-mnemonic')}
            onContinue={handlePassphraseConfirmed}
          />
          {creationError ? (
            <div role="alert" style={{ color: 'var(--semantic-color-status-error)', marginTop: 8 }}>
              {creationError}
            </div>
          ) : null}
        </>
      )}
      {step === 'complete' && <CompleteStep onDone={onDone} />}
    </OnboardingShell>
  )
}
