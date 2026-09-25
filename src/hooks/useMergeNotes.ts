// ABOUTME: useMergeNotes — opens the "Merge notes" (note consolidation) modal with an intent, and builds the
// ABOUTME: "Merge notes" remedy a blocked flow's error screen offers when its spend failed for fragmentation.

import { useCallback } from 'react'
import { useSetAtom } from 'jotai'
import { mergeIntentAtom, openModalAtom } from '@/state/ui'
import { mergeIntentFromRecord, type MergeIntent } from '@/lib/shielded/merge-intent'
import type { TxRecord } from '@/lib/tx/types'

export function useMergeNotes() {
  const setIntent = useSetAtom(mergeIntentAtom)
  const setOpenModal = useSetAtom(openModalAtom)

  /** Open the merge modal for `intent` (replaces whichever flow is open — only one modal shows at a time). */
  const openMerge = useCallback(
    (intent: MergeIntent) => {
      setIntent(intent)
      setOpenModal('merge')
    },
    [setIntent, setOpenModal],
  )

  /**
   * The error screen's "Merge notes" action for a failed record, or undefined when merging wouldn't help
   * (only errors the classifier tagged `remedy: 'merge-notes'` — the wallet was too fragmented).
   */
  const remedyFor = useCallback(
    (record: TxRecord | null | undefined): { label: string; onClick: () => void } | undefined => {
      if (record?.artifacts.error?.remedy !== 'merge-notes') return undefined
      const intent = mergeIntentFromRecord(record)
      if (intent === null) return undefined
      return { label: 'Merge notes', onClick: () => openMerge(intent) }
    },
    [openMerge],
  )

  return { openMerge, remedyFor }
}
