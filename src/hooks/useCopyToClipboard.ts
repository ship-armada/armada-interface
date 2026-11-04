// ABOUTME: useCopyToClipboard — copy text to the clipboard and expose a short-lived `copied` flag for "Copied" feedback.
// ABOUTME: Clears its reset timer on unmount; a refused clipboard write leaves `copied` false and resolves false.

import { useCallback, useEffect, useRef, useState } from 'react'

export interface UseCopyToClipboard {
  /** True for `resetMs` after a successful copy. */
  copied: boolean
  /** Copy `text`; resolves true when the clipboard accepted it. */
  copy: (text: string) => Promise<boolean>
}

export function useCopyToClipboard(resetMs = 2000): UseCopyToClipboard {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const copy = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text)
      } catch {
        setCopied(false)
        return false
      }
      setCopied(true)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setCopied(false), resetMs)
      return true
    },
    [resetMs],
  )

  return { copied, copy }
}
