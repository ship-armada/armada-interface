// ABOUTME: Barrel export for the account-entry primitives — RestoreModal / RestoreFlow (restore + the compatibility screen), plus OnboardingShell + the dead V1 OnboardingFlow and its steps.
// ABOUTME: App.tsx mounts RestoreModal (sign-in itself is the dashboard's SignInCard); the step components are consumed only by the dead V1 OnboardingFlow.

export { OnboardingShell } from './OnboardingShell'
export type { OnboardingShellProps } from './OnboardingShell'

export { OnboardingFlow } from './OnboardingFlow'
export type { OnboardingFlowProps } from './OnboardingFlow'

export { OnboardingLayout } from '../OnboardingLayout/OnboardingLayout'
export type { OnboardingLayoutProps } from '../OnboardingLayout/OnboardingLayout'

export { RestoreFlow } from './RestoreFlow'
export type { RestoreFlowProps } from './RestoreFlow'

export { RestoreModal } from './RestoreModal'

export { WelcomeStep } from './steps/WelcomeStep'
export type { WelcomeStepProps } from './steps/WelcomeStep'

export { SignEnrollmentStep } from './steps/SignEnrollmentStep'
export type { SignEnrollmentStepProps } from './steps/SignEnrollmentStep'

export { AntiPhishChecksumStep } from './steps/AntiPhishChecksumStep'
export type { AntiPhishChecksumStepProps } from './steps/AntiPhishChecksumStep'

export { BackupPassphraseStep } from './steps/BackupPassphraseStep'
export type { BackupPassphraseStepProps } from './steps/BackupPassphraseStep'

export { ConfirmBackupStep } from './steps/ConfirmBackupStep'
export type { ConfirmBackupStepProps } from './steps/ConfirmBackupStep'

export { CompleteStep } from './steps/CompleteStep'
export type { CompleteStepProps } from './steps/CompleteStep'

export { NonDeterministicSignerScreen } from './NonDeterministicSignerScreen'
export type { NonDeterministicSignerScreenProps } from './NonDeterministicSignerScreen'
