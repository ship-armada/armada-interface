# components/

UI components. **Dumb when possible.** State comes from hooks + atoms; effects belong in hooks.

## Hard rules

- **No `ethers` imports.** If you need to call a contract, write a hook.
- **No `@railgun-community/*` imports.** Same reason.
- **No `useEffect` with side effects beyond DOM concerns.** If you find yourself fetching/polling/timing in a component, move the logic to a hook.
- **No typography Tailwind classes.** `text-xs`/`font-medium`/`tracking-*`/`leading-*`/`uppercase` are forbidden. Use the body baseline (15 px Geist 1.5) or a `@armada/ui` primitive that owns its own typography.
- **Layout Tailwind classes are fine.** `flex`, `grid`, `mx-auto`, `pt-20`, color tokens (`text-foreground`, `bg-card`) — those are layout/color, not typography.

## Current contents

| File / dir | Purpose | Status |
|---|---|---|
| `AppLayout.tsx` | Fixed-inset header + nav + body wrap | Working |
| `WalletConnector.tsx` | Header wallet button — RainbowKit render-prop wired to `@armada/ui` `WalletButton` (all 4 states) | Working |
| `balance/` | Balance card, breakdown chips | Empty |
| `shield/` | ShieldModal, ShieldForm | Empty |
| `unshield/` | UnshieldModal, UnshieldForm | Empty |
| `yield/` | YieldDepositModal, YieldWithdrawModal, YieldPositionCard | Empty |
| `payments/` | PayShieldedModal, PayExternalModal | Empty |
| `tx/` | TxLifecycleStepper, TxHistoryList, TxStatusChip | Empty |
| `settings/` | PassphraseDialog, MnemonicExport, ResetWallet | Empty |

## When you add a component

- Co-locate `.tsx` + `.module.css` if you need CSS Modules (mockup pattern).
- Add ABOUTME header.
- If the component needs data, take props. Don't reach into atoms inside a leaf component — pull at the page or modal level and prop-drill (or use a hook at the appropriate level).
- For modals, push open/close state into `openModalAtom` in `state/ui.ts`. The modal trigger button calls `setOpenModal('shield')`; the modal component reads `openModalAtom === 'shield'` to decide whether to render.
