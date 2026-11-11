// ABOUTME: Hover/focus tooltip — centered (short copy) or rich (title, description, bullets). Matches armada-crowdfund.
// ABOUTME: Wrap the trigger (e.g. info icon button); popover is positioned above the trigger.

import { useState, useRef, useId, type ReactNode, type KeyboardEvent } from 'react'
import { autoUpdate, flip, offset, shift, useFloating } from '@floating-ui/react'
import styles from './Tooltip.module.css'

/** Same gap the CSS anchor used: `bottom: calc(100% + 8px)`. */
const TOOLTIP_GAP_PX = 8

interface TooltipSimpleProps {
  variant: 'centered'
  content: string
  children: ReactNode
}

interface TooltipRichProps {
  variant: 'rich'
  /** Optional heading — omit when the trigger's own label already says what it's about. */
  title?: string
  description?: string
  bullets?: string[]
  children: ReactNode
}

export type TooltipProps = TooltipSimpleProps | TooltipRichProps

export function Tooltip(props: TooltipProps) {
  const [visible, setVisible] = useState(false)
  const tooltipId = useId()
  const triggerRef = useRef<HTMLSpanElement | null>(null)

  const show = () => setVisible(true)
  const hide = () => setVisible(false)
  const { refs, floatingStyles, isPositioned } = useFloating({
    open: visible,
    placement: 'top',
    strategy: 'absolute',
    middleware: [offset(TOOLTIP_GAP_PX), flip({ padding: TOOLTIP_GAP_PX }), shift({ padding: TOOLTIP_GAP_PX })],
    whileElementsMounted: autoUpdate,
  })

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      setVisible(false)
      triggerRef.current?.focus()
    }
  }

  return (
    <span
      className={styles.wrapper}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      onKeyDown={handleKeyDown}
      ref={(node) => {
        triggerRef.current = node
        refs.setReference(node)
      }}
      tabIndex={0}
      aria-describedby={visible ? tooltipId : undefined}
    >
      {props.children}

      {visible && (
        <span
          id={tooltipId}
          ref={refs.setFloating}
          style={{ ...floatingStyles, visibility: isPositioned ? 'visible' : 'hidden' }}
          className={[
            styles.tooltip,
            props.variant === 'centered' ? styles.centered : styles.rich,
          ].join(' ')}
          role="tooltip"
        >
          {props.variant === 'centered' && (
            <p className={styles.centeredText}>{props.content}</p>
          )}

          {props.variant === 'rich' && (
            <>
              {props.title ? <p className={styles.title}>{props.title}</p> : null}
              {props.description && (
                <p className={styles.description}>{props.description}</p>
              )}
              {props.bullets && props.bullets.length > 0 && (
                <ul className={styles.bulletList}>
                  {props.bullets.map((b, i) => (
                    <li key={i} className={styles.bulletItem}>
                      <span className={styles.bulletDot} aria-hidden="true" />
                      <span className={styles.bulletText}>{b}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </span>
      )}
    </span>
  )
}
