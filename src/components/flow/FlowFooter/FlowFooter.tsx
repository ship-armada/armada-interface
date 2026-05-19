// ABOUTME: ActionFlowShell footer — primary CTA on the right, optional secondary (Back/Cancel) on the left.
// ABOUTME: Wraps @armada/ui Button; consumers describe actions via label/onClick/disabled, footer composes the layout.

import { Button } from '@armada/ui'
import styles from './FlowFooter.module.css'

export interface FlowAction {
  label: string
  onClick?: () => void
  disabled?: boolean
  /** Force the trailing arrow icon on/off. Primary defaults true; secondary defaults false. */
  showIcon?: boolean
  /** Button kind for the underlying @armada/ui Button. Primary defaults `primary`; secondary defaults `secondary`. */
  type?: 'button' | 'submit'
}

export interface FlowFooterProps {
  primary: FlowAction
  secondary?: FlowAction
  className?: string
}

export function FlowFooter({ primary, secondary, className }: FlowFooterProps) {
  const cls = [styles.root, className].filter(Boolean).join(' ')
  return (
    <footer className={cls}>
      <div className={styles.left}>
        {secondary ? (
          <Button
            variant="secondary"
            size="md"
            label={secondary.label}
            showIcon={secondary.showIcon ?? false}
            disabled={secondary.disabled}
            onClick={secondary.onClick}
            type={secondary.type ?? 'button'}
          />
        ) : null}
      </div>
      <div className={styles.right}>
        <Button
          variant="primary"
          size="md"
          label={primary.label}
          showIcon={primary.showIcon ?? true}
          disabled={primary.disabled}
          onClick={primary.onClick}
          type={primary.type ?? 'button'}
        />
      </div>
    </footer>
  )
}
