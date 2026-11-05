// ABOUTME: prefersReducedMotion — whether the user asked the OS for reduced motion, for components whose exit timing lives
// ABOUTME: in JS (they skip the animation and its delay). CSS-only motion uses the media query directly.

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
