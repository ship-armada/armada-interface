# components/debug/

Dev/QA affordances gated behind **debug mode** — permanent (not ripped out), but invisible in normal use.

## Debug mode

- Flag: `state/debug.ts::debugModeAtom` (persisted in `localStorage`, key `armada-interface.debug`).
- Toggle via the **`?debug`** URL param — `?debug` / `?debug=1` / `?debug=true` / `?debug=on` enable; `?debug=0` / `?debug=false` / `?debug=off` disable. `hooks/useDebugSync` (mounted at App root) syncs the param → the persisted flag on load, so a designer/QA enables it once and it sticks.

## Contents

| Component | Purpose |
|---|---|
| `ForceOutcomeSelect` | On the **Send** amount step (only when debug mode is on) — a dropdown that forces the next Send tx to a chosen outcome (`TX_REVERTED` → Failed, `USER_REJECTED` → Cancelled, `POLL_TIMEOUT` → Unknown, …). Writes `devForceOutcomeAtom`; `SendModal` threads it into the submit meta (`meta.devForceError`); the transfer/unshield handler throws that branded error at the start of its run (`lib/tx/devForce.ts::throwIfForcedError`). No chain interaction — nothing is sent (so no explorer link) — but the real record lifecycle runs, so the failed/cancelled/unknown activity row + receipt render exactly as production would. Lets us exercise the failure UI on demand. |

| `TxNoticePreview` | On the **Debug page** (`/debug`, not gated by debug mode) — the tx-notice preview: radios for the notice style (`txNoticeStyleAtom`, the same preference as Settings → "Show transaction updates": floating toasts / the header pill announcing) and sample-notice buttons (Sent / Failed / Received / Unknown — outcomes only; a tx in flight shows in the header pill from real pending txs, so there's no pending sample) that append a stand-in record to `txNoticeFeedAtom`, so each style can be seen without a real tx. A sample's "View" opens nothing (the record isn't stored). |

Production behaviour is untouched when debug mode is off: `devForceError` is never set, and `throwIfForcedError` is a no-op.
