# components/onboarding/

Restoring a wallet, and the compatibility screen for a wallet that can't use sign-in — in the `RestoreModal` over the always-rendered app. Sign-in itself — a single state-agnostic **Sign In** for first visit and returning users alike — is inline on the dashboard's `dashboard/SignInCard` (`hooks/useSignIn`). Never reachable as a route; there is no full-page sign-in.

V2 redesign (Path C): deterministic sign-in is the primary path (same `signIn()` for new + returning); backup-file + paste-secret are secondary recovery, tucked behind a "Restore wallet from backup" link. See `specs/TX_SIGNING.md` + `specs/TX_SIGNING_V2_AMENDMENT.md`.

## Contents

| Component | Purpose |
|---|---|
| `OnboardingShell` | Non-dismissible `Modal` + `FlowHeader` wrapper. Owns the body padding; step content + footer flow inside. |
| `RestoreModal` | Opened over the dashboard as `openModalAtom = 'restore'` (FlowShell chrome, titled "Restore wallet") — by the sign-in card's "Restore wallet from backup instead" link (the restore form), or by `useSignIn` when the wallet fails the determinism check (the compatibility screen; `state/ui::restoreEntryAtom` says which). A restore clears the lock reason and closes onto the flow queued in `signInResumeAtom` (if any), unless the user closed the modal first. Closing it goes back to the sign-in card. |
| `RestoreFlow` | Views: `restore` (backup file [default] ⇄ paste secret, toggled by a text link; "Back to sign in" closes) and `signer-error` (renders `NonDeterministicSignerScreen`; "Use a backup file or recovery secret" → the restore view with a banner, "Try a different wallet" → disconnect + close). Once a restored wallet's first sync lands, a "Your balance is up to date" toast confirms it (`hooks/useRestoreSyncedToast`). |
| `OnboardingFlow` | Legacy 6-step flow (Welcome → Sign → Checksum → Backup → ConfirmBackup → Complete). **Dead** — not rendered by the app; still compiles + owns the `steps/*` components. Tests are `describe.skip`'d; kept until a deletion pass. |
| `NonDeterministicSignerScreen` | Error view rendered by `RestoreFlow` (inside the restore modal) when the determinism check fails on sign-in. Headline + body + supported/unsupported wallet compatibility lists + two CTAs (use backup/paste recovery → restore view; try a different wallet → disconnect + back to the sign-in card). |
## How sign-in fits the app

`App.tsx` tracks a local `mode` (`pre-migration` / `pre-init` / `app`). It runs the V2 schema migration on `pre-migration`; on `pre-init` it seeds the persisted walletId (if any) as a `locked` entry (an `unlocked` HMR re-mount is left alone), then renders the app. From then on the app shell always renders, whatever the wallet status:

- **Locked or no wallet:** the dashboard shows only `dashboard/SignInCard` (the balance spot's sign-in face, inside `BalanceSpot`) — the inline sign-in (Connect wallet / Sign in / Waiting for signature… / Reconnecting…, errors, "Connected as", the lock reason or a pay-link's context, the restore link), with the two-signature note in a banner below it on a first visit from this device — no activity. First-run (no persisted id) is the same: signing in first-derives the wallet.
- **Every action while locked** goes through `hooks/useOpenActionModal`: disconnected → the RainbowKit connect modal, then the signature prompt as soon as it connects; locked → `useSignIn` with the action queued; unlocked → the action's modal. A wallet that reconnects on page load is never asked to sign by itself.
- **Locking** (auto-lock timer, account switch, tab unload, hidden-tab grace, Settings → Lock / Reset) flips the atom to `locked` / `missing`; `hooks/useCloseFlowsOnLock` closes any open flow, receipt or activity panel, and the dashboard swaps back to the sign-in card. Idle, hidden and manual locks record why (`state/ui::lockReasonAtom`) for the card's "Locked after…" line.

There is no create/unlock fork and no "clear this browser's saved login" affordance — since sign-in is the only entry, a returning user can't accidentally orphan their wallet, so the old `hadPersistedWalletAtBoot` machinery is gone.

## Key handling

- Keys are derived deterministically from an EIP-712 signature, not a generated mnemonic. The signature is captured at the Sign step; HKDF-SHA-256 produces a 32-byte `root_secret` held by `lib/shielded/keyManager` (module-scope, not in atoms, not in component state).
- The recovery export format is an encrypted JSON blob (`armada-backup-v2`), produced via Settings → Export recovery. The plaintext root_secret never enters component state or atoms.
- The anti-phish checksum (12 hex chars) IS exposed via `state.checksum` — it's a non-secret display value used to recognize an authentic unlock screen.
- All secret-handling rules from `lib/shielded/CLAUDE.md` apply: no `console.log`, no clipboard persistence beyond what the user pastes themselves, no atom storage of keys.

## Account-switch handling

When wagmi reports a new EVM address while the shielded wallet is unlocked (Phase 4), `useWallet` detects the mismatch via `keyManager.getEvmAddress()`, immediately calls `lockWallet()`, resets the active wallet atoms, and surfaces a `sonner` toast. The dashboard swaps to its sign-in card, and the user signs in for the new EVM account.
