// ABOUTME: Tests for config/circuits — the supported-shape key list handed to the SDK's supportedShapes
// ABOUTME: guard, in the SDK's UNPADDED shapeKey format (padded manifest keys would silently never match).

import { describe, it, expect } from 'vitest'
import manifest from './circuits.manifest.json'
import { supportedCircuitShapeKeys } from './circuits'

describe('supportedCircuitShapeKeys', () => {
  const keys = supportedCircuitShapeKeys()

  it('returns one key per committed manifest shape', () => {
    expect(keys).toHaveLength(Object.keys(manifest.shapes).length)
  })

  it('emits the SDK unpadded `NxM` format, not the padded manifest keys', () => {
    // SDK `shapeKey` is `${nullifiers}x${commitments}` with no zero-padding — a padded key like
    // "05x02" would never match, so the guard would silently never fire (the bug we are fixing).
    expect(keys).toContain('5x2')
    expect(keys).toContain('8x4')
    expect(keys).toContain('1x1')
    expect(keys).toContain('4x3')
    expect(keys.every((k) => !/^0\d/.test(k) && !/x0\d/.test(k))).toBe(true)
  })

  it('does NOT contain 5x3 — the shape the release omits (regression for the prod 404)', () => {
    expect(keys).not.toContain('5x3')
  })
})
