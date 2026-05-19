// ABOUTME: Onboarding/unlock page-level shell — non-dismissible Modal with FlowHeader chrome around the body content.
// ABOUTME: Used by OnboardingFlow (5-step first-run) and UnlockFlow (single-screen passphrase). Step indicator visibility is controlled by the caller.

import type { ReactNode } from 'react'
import { Modal } from '../ui/Modal'
import { FlowHeader } from '../flow/FlowHeader'
import styles from './OnboardingShell.module.css'

export interface OnboardingShellProps {
  title: string
  /** 1-based index of the current step; ignored when showIndicator=false. */
  currentStep: number
  /** Total step count; ignored when showIndicator=false. */
  totalSteps: number
  /** Whether to render the step indicator beneath the title. Default true. UnlockFlow passes false. */
  showIndicator?: boolean
  children: ReactNode
}

export function OnboardingShell({
  title,
  currentStep,
  totalSteps,
  showIndicator = true,
  children,
}: OnboardingShellProps) {
  // Onboarding/unlock are never user-dismissible — passing dismissible=false hides the close button
  // and ignores ESC + backdrop click. onClose is a no-op for the same reason.
  return (
    <Modal
      open
      onClose={() => {}}
      dismissible={false}
      ariaLabel={title}
      wrapBody={false}
    >
      <FlowHeader
        title={title}
        currentStep={currentStep}
        totalSteps={totalSteps}
        showIndicator={showIndicator}
      />
      <div className={styles.body}>{children}</div>
    </Modal>
  )
}
