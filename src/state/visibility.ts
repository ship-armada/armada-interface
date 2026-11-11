// ABOUTME: The app's view of `document.visibilityState`. All pollers gate on this atom.
// ABOUTME: Only useTabVisible() (hooks/) writes it; useAutoLock's hidden-tab grace timer keeps its own listener.

import { atom } from 'jotai'

export const tabVisibleAtom = atom<boolean>(true)
