// ABOUTME: Shared overlay/modal motion timings — open is backdrop then content; close is content then backdrop.
// ABOUTME: OVERLAY_EXIT_MS is the total close time callers wait out before unmounting.

/** Backdrop exit delay after content begins leaving. */
export const OVERLAY_BACKDROP_EXIT_DELAY_MS = 200
/** Backdrop fade-out duration. */
export const OVERLAY_BACKDROP_EXIT_MS = 220

/** Total time to keep the portal mounted after `open` becomes false. */
export const OVERLAY_EXIT_MS = OVERLAY_BACKDROP_EXIT_DELAY_MS + OVERLAY_BACKDROP_EXIT_MS
