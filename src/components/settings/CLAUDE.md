# components/settings/

Auxiliary dialogs for the Settings page — destructive actions are gated here so the page itself stays a flat list of options.

## Contents

| Component | Purpose |
|---|---|
| `MnemonicExportDialog` | Two-phase: passphrase gate → 12-word reveal grid. Clears state on close so the plaintext mnemonic never outlives the dialog. |
| `ResetWalletDialog` | Destructive — requires typing "reset" before the Reset CTA enables. Calls `useShieldedWallet().reset()`. |

## Conventions

- Dialogs use the `Modal` primitive directly (not `ActionFlowShell`) since they're single-screen, not multi-step flows.
- Open/close is controlled by Settings page-local state (not `openModalAtom`); these dialogs are Settings-internal.
- Secret-handling rules from `lib/railgun/CLAUDE.md` apply here: never `console.log` the mnemonic, never store it outside the dialog's local state, clear on close.

## What's stubbed

- `useShieldedWallet().exportPhrase` / `reset` both delegate to lib stubs that throw. The dialogs surface the error inline; when `lib/railgun` lands, the dialogs work end-to-end without UI changes.
