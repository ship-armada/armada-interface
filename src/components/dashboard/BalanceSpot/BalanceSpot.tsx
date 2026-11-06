// ABOUTME: BalanceSpot — the one card the dashboard's balance spot keeps from sign-in through sync to the balance: it owns the card
// ABOUTME: surface, morphs its height and cross-fades the faces on the forward steps, and holds the Armada mark sign-in and sync share.

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { ArmadaSymbol } from '@/design'
import { useDashboardBackground } from '@/hooks/useDashboardBackground'
import { prefersReducedMotion } from '@/utils/motion'
import styles from './BalanceSpot.module.css'

export type BalanceSpotFace = 'sign-in' | 'sync' | 'balance'

export interface BalanceSpotProps {
  /** Which face is showing; `children` is that face's content (SignInCard / SyncCard / BalanceCard). */
  face: BalanceSpotFace
  /** Show the shared Armada mark — on the sign-in face and while syncing, where both faces leave a ring-sized space for it. */
  showMark: boolean
  children: ReactNode
}

/** The mark's size — the same as it was inside the sync ring (SyncCard's ring box is sized around it). */
const MARK_SIZE = 108

/** The faces' cross-fade (BalanceSpot.module.css .faceLeaving / .faceEntering); the outgoing face is dropped after it. */
export const FACE_FADE_MS = 350

/** The forward steps cross-fade: signing in, and the balance arriving. Anything else (a lock) swaps at once. */
function crossFades(from: BalanceSpotFace, to: BalanceSpotFace): boolean {
  return from !== 'balance' && to !== 'sign-in' && from !== to
}

export function BalanceSpot({ face, showMark, children }: BalanceSpotProps) {
  const [background] = useDashboardBackground()
  const [shownFace, setShownFace] = useState(face)
  // The outgoing face, kept on top of the incoming one while it fades out (the same element, so its instance survives).
  const [leaving, setLeaving] = useState<{ face: BalanceSpotFace; node: ReactNode } | null>(null)
  // The card's height while it morphs to the new face's: `from` held for one frame, then `to` with a transition.
  const [morph, setMorph] = useState<{ from: number; to: number | null } | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const faceRef = useRef<HTMLDivElement>(null)
  const lastChildren = useRef<ReactNode>(children)
  const cardHeight = useRef(0)

  // A face change is handled during render, so the outgoing face's element stays in the tree in the same commit.
  if (shownFace !== face) {
    const animate = crossFades(shownFace, face) && !prefersReducedMotion()
    setLeaving(animate ? { face: shownFace, node: lastChildren.current } : null)
    setMorph(animate ? { from: cardHeight.current, to: null } : null)
    setShownFace(face)
  }

  useEffect(() => {
    lastChildren.current = children
  })

  // Drop the outgoing face once its fade is done.
  useEffect(() => {
    if (leaving === null) return
    const timer = window.setTimeout(() => setLeaving(null), FACE_FADE_MS)
    return () => window.clearTimeout(timer)
  }, [leaving])

  // The card's settled height, as the starting point of the next morph.
  useEffect(() => {
    const card = cardRef.current
    if (!card) return
    const observer = new ResizeObserver(() => {
      if (morph === null) cardHeight.current = card.offsetHeight
    })
    observer.observe(card)
    cardHeight.current = card.offsetHeight
    return () => observer.disconnect()
  }, [morph])

  // Morph: after the old height has been laid out, move to the new face's height (and follow it if it grows meanwhile).
  useLayoutEffect(() => {
    if (morph === null) return
    const target = faceRef.current
    if (!target) return
    if (morph.to === null) {
      const frame = requestAnimationFrame(() => setMorph((m) => (m ? { ...m, to: target.offsetHeight } : m)))
      return () => cancelAnimationFrame(frame)
    }
    const observer = new ResizeObserver(() => {
      setMorph((m) => (m && m.to !== target.offsetHeight ? { ...m, to: target.offsetHeight } : m))
    })
    observer.observe(target)
    // Back to a natural height even if a transition never ends (e.g. the target height didn't change).
    const settle = window.setTimeout(() => setMorph(null), 600)
    return () => {
      observer.disconnect()
      window.clearTimeout(settle)
    }
  }, [morph])

  const height = morph ? `${morph.to ?? morph.from}px` : undefined

  return (
    <div
      ref={cardRef}
      className={[
        styles.card,
        background === 'solid' ? styles.cardSolid : '',
        morph?.to != null ? styles.cardMorphing : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={height ? { height } : undefined}
      onTransitionEnd={(event) => {
        if (event.target === event.currentTarget && event.propertyName === 'height') setMorph(null)
      }}
    >
      <div className={styles.mark} data-balance-spot-mark data-shown={showMark} aria-hidden>
        <ArmadaSymbol size={MARK_SIZE} />
      </div>
      {leaving ? (
        <div
          key={leaving.face}
          className={`${styles.face} ${styles.faceLeaving}`}
          aria-hidden
          inert
        >
          {leaving.node}
        </div>
      ) : null}
      <div key={face} ref={faceRef} className={[styles.face, leaving ? styles.faceEntering : ''].filter(Boolean).join(' ')}>
        {children}
      </div>
    </div>
  )
}
