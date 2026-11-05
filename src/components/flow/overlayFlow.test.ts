// ABOUTME: Tests for overlayFlow's step helpers — showsSubmittedTx, the steps on which a flow modal is showing the tx it
// ABOUTME: submitted (so that tx raises no toast / header notice while the modal is open on it).

import { describe, it, expect } from 'vitest'
import { showsSubmittedTx } from './overlayFlow'

describe('showsSubmittedTx', () => {
  it.each([
    ['recipient', false],
    ['wallet', false],
    ['input', false],
    ['review', false],
    ['progress', true],
    ['complete', true],
    ['error', true],
  ])('%s → %s', (step, expected) => {
    expect(showsSubmittedTx(step)).toBe(expected)
  })
})
