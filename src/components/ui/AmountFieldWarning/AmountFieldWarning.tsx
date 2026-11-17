// ABOUTME: Persistent action-style tooltip for an amount validation error or a recipient-field error.
// ABOUTME: `above` stays over the field. `cover` sits on the fee line, centered on `[data-amount-anchor]`.

import type { ReactNode } from 'react'
import { autoUpdate, useFloating, type Middleware } from '@floating-ui/react'
import tooltipStyles from '@/design/components/Tooltip/Tooltip.module.css'
import styles from './AmountFieldWarning.module.css'

export interface AmountFieldWarningProps {
  /** Id wired to the input's `aria-describedby` so the alert is announced. */
  id: string
  /** Whether the tooltip is shown (an error message is present). */
  visible: boolean
  /** The validation message to display. */
  message: string
  /**
   * `above` floats over the wrapped field. `cover` sits on the wrapped fee line,
   * centered on the amount marked `data-amount-anchor` in the previous sibling.
   */
  placement?: 'above' | 'cover'
  /** The field or fee line the tooltip is anchored to. */
  children: ReactNode
}

/** Matches `--primitives-spacing-1`. Drops the warning off the amount glyphs. */
const COVER_NUDGE_PX = 4

/**
 * Sit on the fee line, shifted down off the amount glyphs, and centered on
 * the amount. The amount is `[data-amount-anchor]` inside the previous sibling.
 */
function coverAnchor(): Middleware {
  return {
    name: 'coverAnchor',
    fn({ elements, rects }) {
      const reference = elements.reference
      const previous =
        reference instanceof HTMLElement ? reference.parentElement?.previousElementSibling : null
      const marked = previous instanceof HTMLElement ? previous.querySelector('[data-amount-anchor]') : null
      const amount = marked instanceof HTMLElement ? marked : previous
      const amountRect = amount instanceof HTMLElement ? amount.getBoundingClientRect() : null
      const referenceRect = reference instanceof HTMLElement ? reference.getBoundingClientRect() : null
      const centeredLeft = amountRect
        ? amountRect.left + amountRect.width / 2 - rects.floating.width / 2
        : null
      const deltaX = centeredLeft !== null && referenceRect ? centeredLeft - referenceRect.left : 0

      return {
        x: rects.reference.x + deltaX,
        y: rects.reference.y + (rects.reference.height - rects.floating.height) / 2 + COVER_NUDGE_PX,
      }
    },
  }
}

export function AmountFieldWarning({
  id,
  visible,
  message,
  placement = 'above',
  children,
}: AmountFieldWarningProps) {
  const cover = placement === 'cover'
  const { refs, floatingStyles, isPositioned } = useFloating({
    open: cover && visible,
    placement: 'bottom-start',
    strategy: 'absolute',
    middleware: [coverAnchor()],
    whileElementsMounted: autoUpdate,
  })

  if (!cover) {
    return (
      <div className={styles.wrapper}>
        {visible ? (
          <div
            id={id}
            className={[tooltipStyles.tooltip, tooltipStyles.enter, tooltipStyles.action, styles.tooltip].join(' ')}
            role="alert"
          >
            <p className={tooltipStyles.actionText}>{message}</p>
          </div>
        ) : null}
        {children}
      </div>
    )
  }

  return (
    <div className={styles.wrapper}>
      {visible ? (
        <div
          id={id}
          ref={refs.setFloating}
          style={{ ...floatingStyles, visibility: isPositioned ? 'visible' : 'hidden' }}
          className={[tooltipStyles.tooltip, isPositioned && tooltipStyles.enter, tooltipStyles.action]
            .filter(Boolean)
            .join(' ')}
          role="alert"
        >
          <p className={tooltipStyles.actionText}>{message}</p>
        </div>
      ) : null}
      <div ref={refs.setReference} className={visible ? styles.covered : undefined}>
        {children}
      </div>
    </div>
  )
}
