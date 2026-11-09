# components/ui/

App-local UI primitives. Layered **above** the vendored design system in `src/design` (imported as `@/design` — Button, Text, WalletButton, WalletPillMenu, ArmadaLogo, ArmadaSymbol) and **below** feature components (BalanceHero, ShieldModal, etc.).

These primitives are NOT in `src/design` because they aren't yet stable enough to fold into the design layer. Move a primitive into `src/design` once its shape is settled.

## Current contents

| Primitive | Purpose |
|---|---|
| `AddressText` | Counterparty address display — the fixed prefix ("0zk1" / "0x") then the verifiable head + tail (0zk: 8 + 6, 0x: 4 + 4), as plain text in the row's own style, full address in the `title`. Split rules in `lib/address::splitAddressForDisplay` (plain-text twin: `shortAddress`). Used wherever a send/receive counterparty is shown (Review/receipt To + From, recent recipients, the recipient step's paste preview, the payer landing, a received payment's From). |
| `AppToaster` | The app's one toast container (sonner, bottom-right), mounted in `main.tsx`. Sonner runs `unstyled` with our CSS Module classes, so toasts use the design tokens and follow the light/dark theme (sonner's own theme is not used). Call sites keep using sonner's `toast()`. |
| `AddressReveal` | Controlled (`expanded` / `onToggle`): `AddressText` as a show/hide toggle for the full address (`aria-expanded`), plus a `CopyAddressButton`. It doesn't render the full address itself — the caller puts a `FullAddress` in its own full-width row. On the send review / receipt "To" row (`payments/TransferReviewSummary`). |
| `CopyAddressButton` | Icon button that copies the FULL address (`hooks/useCopyToClipboard`) and shows a check briefly ("Copy address" / "Address copied"; `label` / `copiedLabel` override them when a view has more than one). In `AddressReveal` and `CopyableAddress`. |
| `CopyableAddress` | `AddressText` + a `CopyAddressButton` on one line — every summary row that shows an address without a reveal: the send summary's "From your private account", the shield summary's "From your wallet" / "To Armada", a received payment's "From", and the pay-via-link landing's "To". |
| `FullAddress` | The full address as a wrapping block of monospace 4-character groups (`lib/address::groupAddress`), `role="group"` labelled "Full address". Spans the card width under the row that opened it, so a long 0zk wraps inside the card instead of overflowing a one-line value cell. |
| `AmountFieldWarning` | Action-style tooltip shown above an amount field for any amount validation error (`role="alert"`, wired to the input's `aria-describedby`). Used by `deposit/DepositAmountCard`. |
| `Card` | Surface — bordered, rounded, padded body. `default` and `raised` variants. |
| `ChainSelect` | Native `<select>` dropdown over `getAllChainIdentities()`; restrict via `chains` prop. |
| `Modal` | Centered modal with backdrop, focus trap, ESC dismissal, portal mount. (See Modal/) |
| `SectionHeader` | Heading with optional trailing slot (link, chip, action). |
| `Tabs` | Horizontal segmented control with ARIA tablist semantics. Generic over a string-id union. |
| `SegmentedControl` | Pill track with a sliding indicator + roving-tabindex arrow-key nav (redesign primitive; used by the Earn Add/Withdraw toggle + request-link expiry). Generic over a string-id union. |
| `Tooltip` | Portalled hover/focus tooltip. |
| `InfoTip` | A small muted ⓘ button (named by `label`) showing a short `text` in a rich `Tooltip` — the general form of `tx/FeeInfo`'s trigger. On the Earn yearly-yield line and the deposit Review row. |
| `FeeBreakdownTooltip` | Tooltip exposing the fee split (protocol + broadcaster + CCTP) behind the under-amount "+ $X FEE" caption ("incl. $X FEE" when the fee comes out of the amount — `feesFromAmount` / `feeFromProceeds`). |
| `GasBalanceNotice` | Low-native-gas warning shown on the direct-submit (non-gasless) shield path — the wallet holds less than the estimated gas (`hooks/useGasBalanceWarning`; a fixed floor until the estimate loads), with "You have X; about Y is needed". |
| `WalletProviderIcon` | Brand glyph for a wagmi connector (used on "From your wallet" rows). |

## Conventions (mirror `src/design`)

- Folder per primitive: `Primitive/Primitive.tsx` + `Primitive.module.css` + `index.ts`.
- ABOUTME header on every file (two lines).
- CSS Modules reference `var(--semantic-*)` tokens from `src/design/styles/tokens.css`; never hardcode hex/px.
- No `clsx`, `classnames`, or `cva` — use the manual `[...].filter(Boolean).join(' ')` pattern.
- No typography Tailwind classes in the `.tsx`. Tailwind is allowed for layout (`flex`, `gap`, `mx-auto`) but text size / weight / letter-spacing / line-height come from CSS Modules.
- Each primitive ships a co-located `.test.tsx` file. Tests use `@testing-library/react`; we don't have `user-event` installed, so use `fireEvent` for interaction tests.

## When to fold into `src/design`

`src/design` is the app's own vendored design layer (severed from the shared `@armada/ui` so the app is self-contained ahead of its repo spin-out). Fold a primitive into `src/design` once its shape has been stable for at least one feature pass. Until then, keep it here — premature promotion makes the design layer harder to change.
