// ABOUTME: Hover/focus tooltip with centered, rich, and action variants.
// ABOUTME: Ported from the armada-app design mockup.
import { useEffect, useId, useRef, useState } from 'react'
import { autoUpdate, flip, offset, shift, useFloating, type Placement } from '@floating-ui/react'
import { useFineHover } from '@/hooks/useFineHover'
import styles from './Tooltip.module.css'

/** Same gap the CSS anchor used: `bottom: calc(100% + 8px)`. */
const TOOLTIP_GAP_PX = 8

interface TooltipSimpleProps {
  variant: 'centered'
  content: string
  children: React.ReactNode
  /** Preferred side. Defaults to above the trigger. */
  placement?: Placement
  /** On a coarse pointer, a tap opens the tip and leaves it open until a tap outside. */
  pinOnClick?: boolean
  /** Announce content changes. Used when the tip is also the action confirmation. */
  announce?: boolean
  /** When set, the tip is shown exactly while this is true. */
  open?: boolean
}

interface TooltipRichProps {
  variant: 'rich'
  title: string
  description?: string
  bullets?: string[]
  children: React.ReactNode
}

interface TooltipActionProps {
  variant: 'action'
  content: string
  children: React.ReactNode
}

type TooltipProps = TooltipSimpleProps | TooltipRichProps | TooltipActionProps

export default function Tooltip(props: TooltipProps) {
  const tooltipId = useId()
  const triggerRef = useRef<HTMLDivElement | null>(null)
  const isAction = props.variant === 'action'
  const pinOnClick = props.variant === 'centered' && props.pinOnClick
  const announce = props.variant === 'centered' && props.announce
  const controlledOpen = props.variant === 'centered' && props.open !== undefined
  const fineHover = useFineHover()
  const [uncontrolledVisible, setUncontrolledVisible] = useState(false)
  const visible = controlledOpen ? Boolean(props.open) : uncontrolledVisible

  const show = () => setUncontrolledVisible(true)
  const hide = () => setUncontrolledVisible(false)
  const placement = props.variant === 'centered' && props.placement ? props.placement : 'top'
  const { refs, floatingStyles, isPositioned, placement: resolvedPlacement } = useFloating({
    open: visible,
    placement,
    strategy: 'absolute',
    middleware: [
      offset(TOOLTIP_GAP_PX),
      flip({
        padding: TOOLTIP_GAP_PX,
        // A phone tip that prefers below the icon should stay below if it can.
        ...(placement === 'bottom-end' ? { fallbackPlacements: ['bottom', 'top-end'] as const } : {}),
      }),
      shift({ padding: TOOLTIP_GAP_PX }),
    ],
    whileElementsMounted: autoUpdate,
  })

  useEffect(() => {
    if (controlledOpen || fineHover || !visible) return

    function onPointerDown(event: PointerEvent) {
      const root = triggerRef.current
      if (!root) return
      if (event.target instanceof Node && root.contains(event.target)) return
      setUncontrolledVisible(false)
    }

    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [controlledOpen, fineHover, visible])

  const [side, align = 'center'] = resolvedPlacement.split('-')

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setUncontrolledVisible(false)
      triggerRef.current?.focus()
    }
  }

  return (
    <div
      className={styles.wrapper}
      onMouseEnter={!controlledOpen && fineHover ? show : undefined}
      onMouseLeave={!controlledOpen && fineHover ? hide : undefined}
      onClick={
        !controlledOpen && !fineHover
          ? () => setUncontrolledVisible((open) => (pinOnClick ? true : !open))
          : undefined
      }
      onFocus={!controlledOpen && fineHover && !isAction ? show : undefined}
      onBlur={!controlledOpen && fineHover && !isAction ? hide : undefined}
      onFocusCapture={!controlledOpen && fineHover && isAction ? show : undefined}
      onBlurCapture={!controlledOpen && fineHover && isAction ? hide : undefined}
      onKeyDown={isAction ? undefined : handleKeyDown}
      ref={(node) => {
        triggerRef.current = node
        const anchor = node?.querySelector('[data-tooltip-anchor]')
        refs.setReference(anchor ?? node)
      }}
      aria-describedby={visible && !isAction ? tooltipId : undefined}
    >
      {props.children}

      {visible && (
        <div
          id={tooltipId}
          ref={refs.setFloating}
          style={{ ...floatingStyles, visibility: isPositioned ? 'visible' : 'hidden' }}
          className={[
            styles.tooltip,
            styles.tail,
            isPositioned && styles.enter,
            props.variant === 'centered' && styles.centered,
            props.variant === 'rich' && styles.rich,
            props.variant === 'action' && styles.action,
          ]
            .filter(Boolean)
            .join(' ')}
          role="tooltip"
          aria-live={announce ? 'polite' : undefined}
          data-side={side}
          data-align={align}
        >
          {props.variant === 'centered' && (
            <p className={styles.centeredText}>{props.content}</p>
          )}

          {props.variant === 'action' && (
            <p className={styles.actionText}>{props.content}</p>
          )}

          {props.variant === 'rich' && (
            <>
              <p className={styles.title}>{props.title}</p>
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
        </div>
      )}
    </div>
  )
}
