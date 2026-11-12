// ABOUTME: Phone amount steps use the on-screen keypad; wider windows keep the system keyboard.
// ABOUTME: Re-reads on resize. `?keypad=1` forces the keypad and `?keypad=0` forces the field.

import { useMobileLayout } from '@/hooks/useMobileLayout'

export type AmountEntryMode = 'input' | 'keypad'

export function useAmountEntryMode(search = typeof window === 'undefined' ? '' : window.location.search): AmountEntryMode {
  const mobile = useMobileLayout()
  const value = new URLSearchParams(search).get('keypad')
  if (value === '0' || value === 'false') return 'input'
  if (value === '1' || value === 'true') return 'keypad'
  return mobile ? 'keypad' : 'input'
}
