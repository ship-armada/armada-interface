// ABOUTME: Portion menu on the balance — 25%, 50%, 75%, and Max — opened by hover or tap.
// ABOUTME: Pointer opens leave the amount field focused; choosing a portion applies it and closes.
import { useRef, useState, type ReactNode } from 'react'
import {
  autoUpdate,
  flip,
  FloatingFocusManager,
  FloatingPortal,
  offset,
  safePolygon,
  shift,
  useClick,
  useDismiss,
  useFloating,
  useHover,
  useInteractions,
  useListNavigation,
  useRole,
} from '@floating-ui/react'
import { useFineHover } from '@/hooks/useFineHover'
import { useMobileLayout } from '@/hooks/useMobileLayout'
import styles from './BalancePercentMenu.module.css'

function MenuFrame({ portal, children }: { portal: boolean; children: ReactNode }) {
  if (!portal) return children
  return <FloatingPortal>{children}</FloatingPortal>
}

const OPTIONS = [
  { label: '25%', ratio: 0.25, name: '25% of balance' },
  { label: '50%', ratio: 0.5, name: '50% of balance' },
  { label: '75%', ratio: 0.75, name: '75% of balance' },
  { label: 'Max', ratio: 1, name: 'Maximum' },
] as const

export interface BalancePercentMenuProps {
  /** Visible balance control: mark and amount. */
  children: ReactNode
  /** Accessible name for the balance control. */
  label: string
  className?: string
  /** `1` is the maximum the field can take. Smaller ratios are portions of the balance. */
  onPick: (ratio: number) => void
}

export function BalancePercentMenu({
  children,
  label,
  className,
  onPick,
}: BalancePercentMenuProps) {
  const fineHover = useFineHover()
  const mobile = useMobileLayout()
  const [open, setOpen] = useState(false)
  const [suspendFocus, setSuspendFocus] = useState(false)
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const listRef = useRef<Array<HTMLButtonElement | null>>([])
  const placement = mobile ? 'top-start' : 'top'

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: (next, _event, reason) => {
      setSuspendFocus(next && (reason === 'hover' || reason === 'safe-polygon'))
      setOpen(next)
    },
    placement,
    strategy: mobile ? 'absolute' : 'fixed',
    middleware: [
      offset(6),
      flip({ fallbackPlacements: [placement] }),
      shift(
        mobile
          ? { padding: 8 }
          : { padding: 8, boundary: document.body },
      ),
    ],
    whileElementsMounted: autoUpdate,
  })

  const hover = useHover(context, {
    enabled: fineHover,
    move: false,
    handleClose: safePolygon(),
    delay: { open: 40, close: 80 },
  })
  const click = useClick(context, {
    toggle: true,
    ignoreMouse: fineHover,
  })
  const dismiss = useDismiss(context)
  const role = useRole(context, { role: 'menu' })
  const listNav = useListNavigation(context, {
    listRef,
    activeIndex,
    onNavigate: setActiveIndex,
    loop: true,
    orientation: 'both',
    focusItemOnOpen: 'auto',
    focusItemOnHover: false,
  })
  const { getReferenceProps, getFloatingProps, getItemProps } = useInteractions([
    hover,
    click,
    dismiss,
    role,
    listNav,
  ])

  return (
    <span className={styles.anchor}>
      <button
        ref={refs.setReference}
        type="button"
        className={className}
        {...getReferenceProps({
          'aria-label': label,
          onMouseDown(event) {
            event.preventDefault()
          },
        })}
      >
        <span ref={refs.setPositionReference} className={styles.cluster}>
          {children}
        </span>
      </button>
      {open ? (
        <MenuFrame portal={!mobile}>
          <FloatingFocusManager
            context={context}
            modal={false}
            initialFocus={-1}
            returnFocus={false}
            closeOnFocusOut={false}
            disabled={suspendFocus}
          >
            <div
              ref={refs.setFloating}
              className={styles.menu}
              style={floatingStyles}
              {...getFloatingProps({
                'aria-label': 'Portion of balance',
              })}
            >
              {OPTIONS.map((option, index) => (
                <button
                  key={option.label}
                  ref={(node) => {
                    listRef.current[index] = node
                  }}
                  type="button"
                  role="menuitem"
                  className={styles.option}
                  aria-label={option.name}
                  {...getItemProps({
                    onMouseDown(event) {
                      event.preventDefault()
                    },
                    onClick() {
                      onPick(option.ratio)
                      setOpen(false)
                    },
                    onKeyDown(event) {
                      if (event.key !== 'Enter' && event.key !== ' ') return
                      event.preventDefault()
                      onPick(option.ratio)
                      setOpen(false)
                    },
                  })}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </FloatingFocusManager>
        </MenuFrame>
      ) : null}
    </span>
  )
}
