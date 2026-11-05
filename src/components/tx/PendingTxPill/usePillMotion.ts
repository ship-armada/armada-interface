// ABOUTME: usePillMotion — the pending pill's display state machine: unfold from the icon circle on appear, crossfade
// ABOUTME: between contents, fold back to the circle and vanish on disappear. Instant under reduced motion. DOM-only.

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'

/** Phase timings (ms) — the CSS in PendingTxPill.module.css runs the matching transitions / keyframes. */
export const PILL_MOTION_MS = {
  /** The icon circle pops in, then the pill widens to its content. */
  unfold: 140,
  /** The previous content fades out over the next. */
  crossfade: 200,
  /** The text fades and the pill narrows back to the icon circle… */
  fold: 140,
  /** …which then scales and fades out. */
  vanish: 100,
} as const

/**
 * circle    — appearing: just the 40px icon circle, text hidden.
 * open      — sized to its content.
 * closing   — narrowing back to the circle, text fading.
 * vanishing — the circle scaling / fading out; unmounts after.
 */
export type PillPhase = 'circle' | 'open' | 'closing' | 'vanishing'

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

/** `key` identifies `content`: a change of key is a change of state (crossfade); null means nothing to show. */
export function usePillMotion<T>(content: T | null, key: string | null): PillMotion<T> {
  const [shown, setShown] = useState<T | null>(null)
  const [leaving, setLeaving] = useState<T | null>(null)
  const [phase, setPhase] = useState<PillPhase>('open')
  const shownRef = useRef<{ content: T; key: string } | null>(null)
  const phaseRef = useRef<PillPhase>('open')
  const phaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const leavingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // The content for the current key, read by the effect (which only re-runs when the key changes).
  const contentRef = useRef(content)
  contentRef.current = content

  // Layout effect, so the circle phase is in place before the first paint of a newly shown pill.
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
      const folding = phaseRef.current === 'closing' || phaseRef.current === 'vanishing'
      if (current === null) {
        // From nothing: pop in as the icon circle, then unfold to the content.
        go('circle')
        phaseTimer.current = setTimeout(() => go('open'), PILL_MOTION_MS.unfold)
      } else if (current.key !== key && !folding) {
        // A different state: the old content fades out over the new while the width eases across.
        setLeaving(current.content)
        if (leavingTimer.current) clearTimeout(leavingTimer.current)
        leavingTimer.current = setTimeout(() => setLeaving(null), PILL_MOTION_MS.crossfade)
        if (phaseRef.current !== 'circle') go('open')
      } else if (folding) {
        go('open')
      }
      shownRef.current = { content: next, key }
      setShown(next)
      return
    }

    // Nothing to show: fold back to the circle, then vanish, then unmount.
    if (current === null || phaseRef.current === 'closing' || phaseRef.current === 'vanishing') return
    clearPhaseTimer()
    go('closing')
    phaseTimer.current = setTimeout(() => {
      go('vanishing')
      phaseTimer.current = setTimeout(() => {
        phaseTimer.current = null
        shownRef.current = null
        setShown(null)
        setLeaving(null)
        go('open')
      }, PILL_MOTION_MS.vanish)
    }, PILL_MOTION_MS.fold)
  }, [key])

  useEffect(
    () => () => {
      if (phaseTimer.current) clearTimeout(phaseTimer.current)
      if (leavingTimer.current) clearTimeout(leavingTimer.current)
    },
    [],
  )

  return { shown, leaving, phase }
}

/** The rendered width (px) of `ref`'s element, kept current with a ResizeObserver; 0 until measured. */
export function useMeasuredWidth(ref: RefObject<HTMLElement | null>, deps: unknown): number {
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(el.getBoundingClientRect().width)
    const observer = new ResizeObserver(() => setWidth(el.getBoundingClientRect().width))
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref, deps])
  return width
}
