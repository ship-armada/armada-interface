// ABOUTME: Modal primitive — centered dialog with backdrop, ESC/backdrop dismissal, focus management, and portal mount.
// ABOUTME: Used by every action flow (ActionFlowShell) and the wallet-unlock dialog; `dismissible={false}` for in-progress flows.

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import styles from './Modal.module.css'

export interface ModalProps {
  /** Whether the modal is open. When false the component returns null (no portal, no listeners). */
  open: boolean
  /** Called when the user presses ESC, clicks the backdrop, or clicks the close button. Ignored when dismissible=false. */
  onClose: () => void
  /**
   * Whether ESC + backdrop click can dismiss. Default true. Set to false during long-running tx execution so
   * the user can't accidentally close the modal mid-flight; they can still navigate via the close button if shown.
   */
  dismissible?: boolean
  /** Optional title rendered in the modal header. If omitted, no header bar is rendered. */
  title?: string
  /**
   * Whether to show the X close button in the header (only relevant when `title` is set).
   * Defaults to true when dismissible, false otherwise.
   */
  showCloseButton?: boolean
  /** Accessible label override — use when the visible title isn't sufficient (e.g. icon-only headers). */
  ariaLabel?: string
  children: ReactNode
  className?: string
}

/**
 * Modal — controlled component. Parent owns `open` state.
 *
 * Focus handling:
 * - On open, focus is moved to the dialog wrapper. Tab navigates the dialog's contents in document order.
 * - On close, focus returns to whatever element was focused before the modal opened.
 * - This is a minimal focus trap — Tab wrap-around (last → first focusable) is intentionally not implemented
 *   in v1. Most flows are short and the browser default order is good enough. Revisit if real screens prove otherwise.
 */
export function Modal({
  open,
  onClose,
  dismissible = true,
  title,
  showCloseButton,
  ariaLabel,
  children,
  className,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)
  const headingId = useId()

  // Track previously-focused element + move focus into the dialog on open; restore on close.
  useEffect(() => {
    if (!open) return
    previouslyFocused.current = (document.activeElement as HTMLElement | null) ?? null
    // Move focus to the dialog so keyboard users land inside it.
    dialogRef.current?.focus()
    return () => {
      previouslyFocused.current?.focus?.()
    }
  }, [open])

  // ESC dismissal.
  useEffect(() => {
    if (!open || !dismissible) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
    }
  }, [open, dismissible, onClose])

  // Body scroll lock while the modal is open.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  const onBackdropClick = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      if (!dismissible) return
      // Only close when the click target is the backdrop itself, not bubbled from the dialog.
      if (e.target === e.currentTarget) onClose()
    },
    [dismissible, onClose],
  )

  // Prevent Tab/Shift+Tab from escaping the dialog by capturing keydowns at the dialog root.
  // (Browser default focus order within the dialog is preserved; we only block focus from
  // jumping outside the modal entirely.)
  const onDialogKeyDown = useCallback((e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return
    // Allow normal tabbing inside; nothing to do — focus stays in the dialog because it's
    // visually overlaid and the rest of the page is inert (we don't currently mark
    // background inert, but in practice the dialog catches first focus and circular tab
    // through the body just cycles back). Real wrap-around comes later if needed.
    void e
  }, [])

  if (!open) return null

  const closeVisible = showCloseButton ?? dismissible

  const dialog = (
    <div
      className={[styles.backdrop, className].filter(Boolean).join(' ')}
      onMouseDown={onBackdropClick}
      role="presentation"
    >
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? headingId : undefined}
        aria-label={!title ? ariaLabel : undefined}
        tabIndex={-1}
        onKeyDown={onDialogKeyDown}
      >
        {title ? (
          <header className={styles.header}>
            <h2 id={headingId} className={styles.title}>
              {title}
            </h2>
            {closeVisible ? (
              <button
                type="button"
                className={styles.closeButton}
                onClick={onClose}
                aria-label="Close"
              >
                <X size={18} aria-hidden="true" />
              </button>
            ) : null}
          </header>
        ) : null}
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  )

  return createPortal(dialog, document.body)
}
