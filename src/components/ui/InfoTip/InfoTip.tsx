// ABOUTME: InfoTip — a small muted ⓘ that shows a short explanation on hover / focus (tap on touch), beside a label or
// ABOUTME: figure. The general form of tx/FeeInfo's trigger; the copy comes from the caller (usually a lib constant).

import { InformationCircleIcon } from '@heroicons/react/24/outline'
import { Tooltip } from '@/components/ui/Tooltip'
import styles from './InfoTip.module.css'

export interface InfoTipProps {
  /** The explanation shown in the tooltip. */
  text: string
  /** The trigger's accessible name ("About this rate"). */
  label: string
  className?: string
}

export function InfoTip({ text, label, className }: InfoTipProps) {
  return (
    <span className={[styles.anchor, className].filter(Boolean).join(' ')}>
      <Tooltip variant="rich" description={text}>
        <button type="button" className={styles.trigger} aria-label={label}>
          <InformationCircleIcon className={styles.icon} aria-hidden />
        </button>
      </Tooltip>
    </span>
  )
}
