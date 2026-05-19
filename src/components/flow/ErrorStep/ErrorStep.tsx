// ABOUTME: Shared error step — circular error icon + headline + supporting message + Try Again + View Details CTAs.
// ABOUTME: Try Again is disabled when onRetry is omitted (signaling the failing stage was not retryable per its TxLifecycle).

import { AlertCircle } from 'lucide-react'
import { FlowFooter } from '../FlowFooter'
import styles from './ErrorStep.module.css'

export interface ErrorStepProps {
  /** Headline shown beneath the icon. Defaults to "Something went wrong". */
  title?: string
  /** Supporting message — from `record.artifacts.error` or the throw site. */
  message?: string
  /** Try Again handler. Omit to disable the button (failing stage is not in lifecycle.retryableStages). */
  onRetry?: () => void
  /** View Details handler — typically expands the TechnicalDetailsDisclosure inside the body. */
  onViewDetails?: () => void
}

export function ErrorStep({
  title = 'Something went wrong',
  message,
  onRetry,
  onViewDetails,
}: ErrorStepProps) {
  return (
    <div className={styles.root}>
      <div className={styles.icon} aria-hidden="true">
        <AlertCircle size={36} />
      </div>
      <div className={styles.title}>{title}</div>
      {message ? <div className={styles.message}>{message}</div> : null}
      <FlowFooter
        className={styles.footer}
        primary={{ label: 'Try again', onClick: onRetry, disabled: !onRetry }}
        secondary={
          onViewDetails ? { label: 'View details', onClick: onViewDetails } : undefined
        }
      />
    </div>
  )
}
