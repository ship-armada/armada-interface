// ABOUTME: Tests for prefersReducedMotion — reads the prefers-reduced-motion media query.
// ABOUTME: The test setup's matchMedia stub reports reduced motion; a stand-in reports it off.

import { describe, it, expect, afterEach } from 'vitest'
import { prefersReducedMotion } from './motion'

const realMatchMedia = window.matchMedia

afterEach(() => {
  window.matchMedia = realMatchMedia
})

describe('prefersReducedMotion', () => {
  it('follows the media query', () => {
    expect(prefersReducedMotion()).toBe(true)
    window.matchMedia = (query: string) => ({ matches: false, media: query }) as unknown as MediaQueryList
    expect(prefersReducedMotion()).toBe(false)
  })
})
