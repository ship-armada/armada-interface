// ABOUTME: usePillMotion — the pending pill's display state machine: unfold from the 40px circle on appear, crossfade
// ABOUTME: between contents, fold back and fade out on disappear — each one continuous movement. Instant under reduced motion.

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'

/** Phase timings (ms) — the CSS in PendingTxPill.module.css runs the matching transitions / keyframes. */
export const PILL_MOTION_MS = {
  /** The previous content fades out over the next. */
  crossfade: 200,
  /** The pill narrows back to the 40px circle while it fades out; unmounts after. */
  close: 220,
} as const

/**
 * entering — rendered once at 40px and transparent, then switched to `open` before paint, so the CSS transition runs
 *            from it: the width unfolds and the whole pill fades in together.
 * open     — sized to its content.
 * closing  — narrowing back to 40px while fading out; unmounts after.
 */
export type PillPhase = 'entering' | 'open' | 'closing'

export interface PillMotion<T> {
  /**
   * The last content shown, kept while the pill folds away so the exit has something to show. Render `content ?? shown`:
   * live content whenever there is some (so callbacks stay fresh), this snapshot only during the exit.
   */
  shown: T | null
  /** The previous content, fading out over `shown` during a crossfade. */
  leaving: T | null
  phase: PillPhase
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * `key` identifies `content`: a change of key is a change of state (crossfade); null means nothing to show. `shellRef`
 * is the pill's outer element — read once to commit the entering style before it opens.
 */
export function usePillMotion<T>(
  content: T | null,
  key: string | null,
  shellRef: RefObject<HTMLElement | null>,
): PillMotion<T> {
  const [shown, setShown] = useState<T | null>(null)
  const [leaving, setLeaving] = useState<T | null>(null)
  // Rests in `entering` while nothing is shown, so the first frame of the next appearance is already the entering style.
  const [phase, setPhase] = useState<PillPhase>('entering')
  const shownRef = useRef<{ content: T; key: string } | null>(null)
  const phaseRef = useRef<PillPhase>('entering')
  const phaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const leavingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // The content for the current key, read by the effect (which only re-runs when the key changes).
  const contentRef = useRef(content)
  contentRef.current = content

  // Layout effect, so the phase is settled before the first paint of a newly shown pill.
  useLayoutEffect(() => {
    const go = (next: PillPhase) => {
      phaseRef.current = next
      setPhase(next)
    }
    const clearPhaseTimer = () => {
      if (phaseTimer.current) clearTimeout(phaseTimer.current)
      phaseTimer.current = null
    }
    const current = shownRef.current
    const next = contentRef.current

    if (prefersReducedMotion()) {
      shownRef.current = next !== null && key !== null ? { content: next, key } : null
      setShown(next)
      setLeaving(null)
      go('open')
      return
    }

    if (next !== null && key !== null) {
      clearPhaseTimer()
      const folding = phaseRef.current === 'closing'
      if (current === null) {
        // From nothing: the entering style is already in place (the resting phase); the effect below opens it.
        go('entering')
      } else if (current.key !== key && !folding) {
        // A different state: the old content fades out over the new while the width eases across.
        setLeaving(current.content)
        if (leavingTimer.current) clearTimeout(leavingTimer.current)
        leavingTimer.current = setTimeout(() => setLeaving(null), PILL_MOTION_MS.crossfade)
      } else if (folding) {
        go('open')
      }
      shownRef.current = { content: next, key }
      setShown(next)
      return
    }

    // Nothing to show: fold back and fade out in one movement, then unmount.
    if (current === null || phaseRef.current === 'closing') return
    clearPhaseTimer()
    go('closing')
    phaseTimer.current = setTimeout(() => {
      phaseTimer.current = null
      shownRef.current = null
      setShown(null)
      setLeaving(null)
      go('entering')
    }, PILL_MOTION_MS.close)
  }, [key])

  // Entering → open within the same frame. Reading the shell's layout makes the browser apply the entering style
  // (40px, transparent) first, so switching to open transitions from it instead of jumping straight to the end.
  // Re-run on a key change too: the pill rests in `entering`, so an appearance doesn't change the phase.
  useLayoutEffect(() => {
    const shell = shellRef.current
    if (phase !== 'entering' || !shell) return
    void shell.offsetWidth
    phaseRef.current = 'open'
    setPhase('open')
  }, [phase, key, shellRef])

  useEffect(
    () => () => {
      if (phaseTimer.current) clearTimeout(phaseTimer.current)
      if (leavingTimer.current) clearTimeout(leavingTimer.current)
    },
    [],
  )

  return { shown, leaving, phase }
}

/**
 * The layout width (px, rounded up) of `ref`'s element, kept current with a ResizeObserver; 0 until measured. Layout
 * width, not the on-screen box (`getBoundingClientRect`), so a transform running on an ancestor can't shrink it.
 */
export function useMeasuredWidth(ref: RefObject<HTMLElement | null>, deps: unknown): number {
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(el.offsetWidth)
    const observer = new ResizeObserver((entries) => {
      const size = entries[0]?.borderBoxSize[0]?.inlineSize
      setWidth(size !== undefined ? Math.ceil(size) : el.offsetWidth)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref, deps])
  return width
}
