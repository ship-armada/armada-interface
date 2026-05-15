// ABOUTME: Single source of truth for `document.visibilityState`. All pollers gate on this atom.
// ABOUTME: useTabVisible() (hooks/) attaches the listener exactly once; everywhere else only reads.

import { atom } from 'jotai'

export const tabVisibleAtom = atom<boolean>(true)
