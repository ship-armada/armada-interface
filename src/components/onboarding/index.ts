// ABOUTME: Barrel export for onboarding/unlock primitives — OnboardingShell, OnboardingFlow, UnlockFlow, plus the per-step components.
// ABOUTME: App.tsx imports OnboardingFlow + UnlockFlow; step components are mostly internal to OnboardingFlow.

export { OnboardingShell } from './OnboardingShell'
export type { OnboardingShellProps } from './OnboardingShell'

export { OnboardingFlow } from './OnboardingFlow'
export type { OnboardingFlowProps } from './OnboardingFlow'

export { UnlockFlow } from './UnlockFlow'
export type { UnlockFlowProps } from './UnlockFlow'

export { WelcomeStep } from './steps/WelcomeStep'
export type { WelcomeStepProps } from './steps/WelcomeStep'

export { MnemonicStep } from './steps/MnemonicStep'
export type { MnemonicStepProps } from './steps/MnemonicStep'

export { ConfirmMnemonicStep } from './steps/ConfirmMnemonicStep'
export type { ConfirmMnemonicStepProps } from './steps/ConfirmMnemonicStep'

export { PassphraseStep } from './steps/PassphraseStep'
export type { PassphraseStepProps } from './steps/PassphraseStep'

export { CompleteStep } from './steps/CompleteStep'
export type { CompleteStepProps } from './steps/CompleteStep'
