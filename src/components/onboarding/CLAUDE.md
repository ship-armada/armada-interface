# components/onboarding/

First-run setup + returning-user unlock. Mounted by the top-level guard in `App.tsx`, never reachable as a route.

## Contents

| Component | Purpose |
|---|---|
| `OnboardingShell` | Non-dismissible `Modal` + `FlowHeader` wrapper. Owns the body padding; step content + footer flow inside. |
| `OnboardingFlow` | 6-step state machine: Welcome → Sign → Checksum → Backup → ConfirmBackup → Complete. Drives `useShieldedWallet().enroll` + `exportBackup`. |
| `UnlockFlow` | Two-mode unlock (paste hex secret / upload backup + passphrase). Calls `useShieldedWallet().unlockByPaste` / `unlockByBackup`. Re-signing is not offered (spec §"Recovery": non-deterministic wallets produce a different identity each time). |
| `steps/WelcomeStep` | Intro + Create CTA. |
| `steps/SignEnrollmentStep` | EIP-712 sign prompt + in-flight/error state. |
| `steps/AntiPhishChecksumStep` | Displays the live anti-phish checksum so the user recognizes their own wallet on later unlocks. |
| `steps/BackupPassphraseStep` | Passphrase entry + browser download of the encrypted backup blob. |
| `steps/ConfirmBackupStep` | Re-upload + decrypt verification — confirms checksum matches the live wallet before activating. |
| `steps/CompleteStep` | Success panel. Calls `onDone` to hand control back to App-level mode. |

## How the guard works

`App.tsx` tracks a local `mode` state (`pre-init` / `onboarding` / `unlock` / `app`). It initializes from `shieldedWalletAtom.status` on mount, then transitions explicitly:
- `onboarding` → `app` when the user clicks Done in `CompleteStep`.
- `onboarding` → `unlock` when the user clicks the **Restore** secondary CTA on `WelcomeStep` (escape hatch for new-device users who already have a backup).
- `unlock` → `onboarding` when the user clicks the **Create new account** link, *only when there was no persisted walletId at boot*. App.tsx tracks this via the sticky `hadPersistedWalletAtBoot` flag so a returning user can't orphan their existing wallet by misclicking.
- `app` → `unlock` when the atom flips to `locked` (auto-lock timer).
- `unlock` → `app` when an unlock path resolves and `UnlockFlow` calls `onUnlocked`.

The Restore CTA is offered unconditionally in onboarding — the flow can't know whether a given visitor is genuinely new or arriving on a new device. The link is inert for genuinely-new users and load-bearing for the second case.

Why a local mode state instead of reading the atom directly? Because `useShieldedWallet().enroll()` writes to atoms BEFORE the user reaches Complete (the wallet is unlocked from the moment of Sign). If the guard read the atom directly, the post-sign screens would never render — the atom flip would unmount `OnboardingFlow` immediately. The local mode shields the flow until the user explicitly clicks through Complete.

## Key handling

- Keys are derived from an EIP-712 signature, not a generated mnemonic. The signature is captured at the Sign step; HKDF-SHA-256 produces a 32-byte `root_secret` held by `lib/railgun/keyManager` (module-scope, not in atoms, not in component state).
- The recovery export format is an encrypted JSON blob (`armada-backup-v1`), produced at the Backup step. The plaintext root_secret never enters component state or atoms.
- The anti-phish checksum (12 hex chars) IS exposed via `state.checksum` — it's a non-secret display value used to recognize an authentic unlock screen.
- All secret-handling rules from `lib/railgun/CLAUDE.md` apply: no `console.log`, no clipboard persistence beyond what the user pastes themselves, no atom storage of keys.

When `lib/railgun` lands, both flows work end-to-end with no UI changes.
