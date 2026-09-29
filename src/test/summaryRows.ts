// ABOUTME: Reads a rendered summary table by row label — the value shown next to "Fees", "Total", "You received", … —
// ABOUTME: so a test asserts which figure sits in which row, not merely that the text appears somewhere.

import { screen } from '@testing-library/react'

/** The text of the value cell beside the row labelled `label` (the label's next sibling). */
export function summaryRow(label: string): string {
  const value = screen.getByText(label, { exact: true }).nextElementSibling
  if (value === null) throw new Error(`summary row "${label}" has no value cell`)
  return value.textContent ?? ''
}

/** The big numeral under a flow's `<h1>` title (the receipt / confirmation headline amount). */
export function headlineAmount(): string {
  const amount = screen.getByRole('heading', { level: 1 }).nextElementSibling
  if (amount === null) throw new Error('no headline amount beside the title')
  return amount.textContent ?? ''
}
