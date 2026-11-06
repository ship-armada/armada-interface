# components/request/

The "Request USDC via link" flow — compose a payment request and share a link that drops the payer into a prefilled Send. Opened via `setOpenModal('request')` (the dashboard **Request** action).

## Contents

| Component | Purpose |
|---|---|
| `RequestModal` | Orchestrator on `FlowShell` (steps `Receive → Share link`). Owns amount/expiry/note state; builds the link on Create via `lib/payViaLink.buildPayViaLinkUrl` from the active wallet's 0zk address. |
| `RequestReceiveScreen` | Compose step — amount + `Link expires` SegmentedControl + optional note. The amount field keeps forward-typing states ("0", ".", "0.") so sub-one amounts are typeable, and reads a typed comma as the decimal point (`utils/amountInput::sanitizeAmountEdit`); "Create link" is enabled only for a positive amount and advances to the link screen. |
| `RequestLinkScreen` | Link step — the amount ("Any amount" when none), a QR of the link (`payViaLink/PaymentLinkQrCode`, the landing's plate: frost / solid white in dark), the generated URL (middle-truncated) + Copy, and **Share** beside it where the device has a share sheet (`navigator.share`, mostly phones; desktop keeps Copy only) — the message is "Here’s my Armada payment link:" + the link, naming no amount or note (they'd sit readable in the chat history; the payer sees them on the landing). A dismissed sheet is ignored. No auto-copy on create. Plus the wired-ready **Link revoked** variant. |

## What's real vs. deferred

- **Real:** amount / expiry / note / request id / the shareable `/pay-via-link` URL (with our origin + the real 0zk address). The payer path (landing → Send prefill) is in `pages/PayViaLinkLanding` + `hooks/usePayViaLinkIntent`.
- **Disabled placeholder — Revoke.** A session-local flag can't stop a payer who already has the link; true revocation needs shared backend state. The Revoke trigger is disabled + marked "coming soon". The `revoked` variant screen is built and rendered when `RequestLinkScreen`'s `revoked` prop is true — nothing sets it yet.
- **Dropped:** per-request "paid" tracking + the mockup's 60s mock auto-settle + fake tx hash. Received payments surface through the normal activity/receipt path (chunk 6b), not a request-specific signal — matching a payment back to a request would need memo-on-send tagging (not wired).

## Recent Activity integration

Creating a link persists a `RequestLinkRecord` (encrypted, per-wallet — `lib/shielded/requestLinks.ts`, hydrated via `useRequestLinks` into `requestLinksAtom`). The dashboard merges these into the activity list (`buildActivityItems`) as neutral **"Payment link created"** rows (`LinkIcon`, no +/- amount, expiry in the subtitle, a "Requests" filter chip). Clicking a row sets `requestShareIntentAtom` + opens this modal, which re-opens **directly on the Share step** seeded from the stored link. Created links are local-only (not chain-recoverable); "Clear local history" wipes them.

## Note

`ReceiveDialog` (plain 0zk address + copy, `openModalAtom='receive'`) currently has **no entry point** — the Request flow is the only receive affordance on the dashboard. The component + `'receive'` modal kind are retained but dormant until a raw-address path is (re)introduced.
