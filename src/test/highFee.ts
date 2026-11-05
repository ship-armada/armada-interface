// ABOUTME: Test helper — ticks Review's "I understand the fees…" box when the high-fee warning asks for it (fees over 25% of
// ABOUTME: the amount), so a flow test about something else can confirm with the fixture's small amounts and quoted fees.

import { fireEvent, screen } from '@testing-library/react'

export function acknowledgeHighFee(): void {
  const tick = screen.queryByRole('checkbox', { name: /I understand the fees are more than a quarter/ })
  if (tick && !(tick as HTMLInputElement).checked) fireEvent.click(tick)
}
