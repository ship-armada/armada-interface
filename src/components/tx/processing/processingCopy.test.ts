// ABOUTME: Tests for processingCopy's progressAnnouncement — the screen-reader line for the current step of the in-flight
// ABOUTME: view ("Submitting transaction. Building proof"), shared by the modal's progress layout and the receipt's stepper.

import { describe, it, expect } from 'vitest'
import { progressAnnouncement, type TxProgressStage } from './processingCopy'

const STAGES: TxProgressStage[] = [
  { id: 'a', label: 'Preparing transaction', subtitle: 'Building zero-knowledge proof' },
  { id: 'b', label: 'Shielding', subtitle: 'Waiting for confirmation', completedLabel: 'Shielded' },
]

describe('progressAnnouncement', () => {
  it('reads the current step and its subtitle', () => {
    expect(progressAnnouncement(STAGES, 0, false)).toBe('Preparing transaction. Building zero-knowledge proof')
  })

  it('reads the completed label alone once the last step is done', () => {
    expect(progressAnnouncement(STAGES, 1, true)).toBe('Shielded')
  })

  it('is empty when there is no such step', () => {
    expect(progressAnnouncement(STAGES, 5, false)).toBe('')
  })
})
