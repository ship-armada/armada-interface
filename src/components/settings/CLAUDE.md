# components/settings/

Auxiliary dialogs for the Settings modal (`SettingsModal`) — destructive actions are gated here so the modal itself stays a flat list of options.

## Contents

| Component | Purpose |
|---|---|
| `RecoverySecretExportDialog` | Tabs over two modes — encrypted backup file (passphrase + browser download) and raw hex (opt-in reveal). Clears state on close so revealed material never outlives the dialog. |
| `ResetWalletDialog` | Destructive — requires typing "reset" before the Reset CTA enables. Calls `useShieldedWallet().reset()`. |
| `ClearHistoryDialog` | Wipes the local `txHistory` IDB store, the `requestLinks` store (created payment links — local-only, so this part is permanent) and the per-wallet checkpoint, then bumps `historyRecoveryTriggerAtom` (`silent: false` — a user-initiated rebuild reads `scanning`, and a failure shows the Retry banner) so the recovery hook rebuilds from chain. Single-confirm (no typed phrase) because tx history is reversible via re-scan. |

The **Preferences** card holds auto-lock and **Show transaction updates** (`txNoticeStyleAtom` → `preferencesAtom.txNoticeStyle`): "Pop-up" (toasts, the default) or "In the header" (the pending pill announces the outcome). A tx in flight always shows in the header pill either way.

The Settings modal also shows a **Notes** card when a shielded token is spread across `MERGE_SUGGEST_NOTE_COUNT` (5) or more notes (`useNoteCounts`) — each such token gets a "Merge" button that opens the `merge` modal (`components/consolidate/`). Hidden when nothing needs merging.

## Conventions

- Dialogs use the `Modal` primitive directly (not `FlowShell`) since they're single-screen, not multi-step flows.
- Open/close is controlled by `SettingsModal`-local state (not `openModalAtom`); these dialogs are Settings-internal.
- Secret-handling rules from `lib/shielded/CLAUDE.md` apply here: never `console.log` the recovery secret, never store it outside the dialog's local state, clear on close.

## Wired

- `useShieldedWallet().exportBackup` produces an `armada-backup-v2` blob (root secret + `creationBlock`) via `lib/crypto/kdf::encryptBackup`. The dialog JSON-stringifies + downloads it, then offers to verify the file (`kdf::verifyBackupFileText`).
- `useShieldedWallet().reset` deletes the SDK wallet entry, clears the keyManager + the cached walletId, and drops the active atom entry. The dialog surfaces any error inline.
