# components/

UI components. **Dumb when possible.** State comes from hooks + atoms; effects belong in hooks.

## Hard rules

- **No `ethers` imports.** If you need to call a contract, write a hook.
- **No `@railgun-community/*` imports.** Same reason.
- **No `useEffect` with side effects beyond DOM concerns.** If you find yourself fetching/polling/timing in a component, move the logic to a hook.
- **No typography Tailwind classes.** `text-xs`/`font-medium`/`tracking-*`/`leading-*`/`uppercase` are forbidden. Use the body baseline (15 px Geist 1.5) or a `@/design` primitive that owns its own typography.
- **Layout Tailwind classes are fine.** `flex`, `grid`, `mx-auto`, `pt-20`, color tokens (`text-foreground`, `bg-card`) — those are layout/color, not typography.

## Current contents

| File / dir | Purpose |
|---|---|
| `AppLayout.tsx` | Fixed-inset header (logo link home; no nav) + body wrap with the banner overlay (`SyncBanner` off the dashboard, `HistoryRecoveryBanner`). The header's right group holds the network badge, theme toggle, settings gear, the pending-tx pill (`tx/PendingTxPill`: one pending tx opens its receipt, several the All activity panel) and the wallet pill |
| `AppErrorBoundary.tsx` | Top-level error boundary (outside the providers) — a render error anywhere surfaces a recoverable card instead of a white screen; funnels to Sentry via telemetry |
| `SingleTabGate/` | Full-screen "Armada is open in another tab" screen — shown when a second tab opens (`anotherTabActiveAtom`: set at boot by `lib/tx/executor.ts` when another tab holds the executor lock, and by `sdk-read.ts::ensureInstance` on `StorageConflictError` as a backstop). Rendered as App's first early-return; Reload CTA re-inits once the other tab is closed |
| `WalletConnector.tsx` | Header wallet control — RainbowKit render-prop: the `@/design` `WalletButton` while connecting, a secondary `Button` for "Connect Wallet" / "Wrong network", and `WalletMenu` once connected |
| `WalletMenu/` | Wallet side-panel (pill → slide-out) — address, hide toggle, actions, and USDC balances. Since a shield is per-chain (#8), the balance defaults to a combined **Total** row ("N networks") that **expands** to a per-chain breakdown (one row per chain holding USDC; `buildWalletChainBalances`); a single-chain wallet shows that one row with no toggle. Chain-agnostic "Shield your USDC" opens the modal whose Network picker handles selection |
| `RelayerStatusBanner/` | Banner shown when the relayer is unreachable / degraded |
| `ui/` | App-local primitives (AppToaster, AddressText, AddressReveal, FullAddress, CopyAddressButton, CopyableAddress, AmountFieldWarning, Card, Modal, ChainSelect, SectionHeader, Tabs, SegmentedControl, Tooltip, InfoTip, FeeBreakdownTooltip, GasBalanceNotice, ThemeToggle, WalletProviderIcon, `chainIcons`) — see `ui/CLAUDE.md` |
| `flow/` | `FlowShell` (the live modal chrome, wrapping vendored `FlowModalOverlay + ModalShell + ModalStepSwitch`) + `useFlowExit` + `ErrorStep` + `ProgressStep` + the step types / helpers (`overlayFlow.ts`); `FlowFooter` is used by `ErrorStep`, the settings dialogs and `RestoreFlow` — see `flow/CLAUDE.md` |
| `deposit/` | Shared flow primitives — `DepositAmountCard` (amount + chain + fee caption + % pills; the balance row's "· X pending" / "· X arriving" suffixes), `DepositReviewSummary` — reused across shield/send/earn |
| `tx/` | `processing/` (TxProgressCard + timeline), the pending pill, notices (toast / icon / copy), `TxCancelButton`, `FeeInfo`, `DeliveryTxLink`, `stageCopy` titles — see `tx/CLAUDE.md` |
| `dashboard/` | BalanceSpot (the one balance-spot card: SignInCard → SyncCard → BalanceCard faces) + numerals + RecentActivityList (+ ActivityAllPanel / receipts) + DepositTooltip (centered card stack) — see `dashboard/CLAUDE.md` |
| `shield/` | ShieldModal + steps (deposit; same-chain + cross-chain) — see `shield/CLAUDE.md` |
| `payments/` | SendModal — the Send flow (the recipient address picks the kind: a 0zk → private transfer, a 0x → same-chain or cross-chain unshield). Unshielding to your own wallet is the Unshield tab of `shield/ShieldModal`, not a Send variant. Also seeds recipient/amount from a pay-via-link `paymentIntentAtom` on open — see `payments/CLAUDE.md` |
| `yield/` | EarnModal + steps (Add / Withdraw tabs) — see `yield/CLAUDE.md` |
| `request/` | RequestModal — the "Request USDC via link" flow (compose amount/expiry/note → generated link screen). Revoke is disabled ("coming soon"); the Link-revoked variant is built but unreachable until backend-backed revocation lands |
| `payViaLink/` | `PaymentLinkQrCode` — QR of a pay-via-link URL (`qrcode.react`). Shared by the payer landing (`pages/PayViaLinkLanding`) and the requester's link screen (`request/RequestLinkScreen`) |
| `history/` | `HistoryRecoveryBanner` — shown only when a chain-history recovery scan failed: "Couldn't recover activity from chain" + Retry (mounted in AppLayout). Nothing while a scan runs — Settings' "Scanning…" and the refilling list show it |
| `sync/` | `SyncBanner` (the initial-sync strip on routes other than the dashboard; the dashboard shows `dashboard/SyncCard`) + `isInitialSyncGated` (no SDK balance yet). A failed sync says "Your funds are safe on chain" (only loading them here failed) with Try again; once a retry has failed too (`syncRetryEpochAtom` > 0), the card adds "Still not loading? Check your connection…" and both add "Get help on Discord" (`config/support`) |
| `onboarding/` | `RestoreModal` + `RestoreFlow` (restore from a backup file / recovery secret, and the compatibility screen for a wallet that can't use sign-in — sign-in itself is inline on `dashboard/SignInCard`) + `NonDeterministicSignerScreen` — see `onboarding/CLAUDE.md` |
| `settings/` | SettingsModal + RecoverySecretExportDialog, ResetWalletDialog, ClearHistoryDialog — see `settings/CLAUDE.md` |
| `debug/` | Debug-mode / Debug-page tools — `ForceOutcomeSelect` (Send step), `TxTimings`, `TxNoticePreview` — see `debug/CLAUDE.md` |

## When you add a component

- Co-locate `.tsx` + `.module.css` if you need CSS Modules (mockup pattern).
- Add ABOUTME header.
- If the component needs data, take props. Don't reach into atoms inside a leaf component — pull at the page or modal level and prop-drill (or use a hook at the appropriate level).
- For modals, push open/close state into `openModalAtom` in `state/ui.ts`. The modal trigger button calls `setOpenModal('shield')`; the modal component reads `openModalAtom === 'shield'` to decide whether to render.
