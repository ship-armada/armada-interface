# components/onboarding/

The account entry — a single state-agnostic **Sign In** for first visit and returning users alike (`SignInFlow`), shown in the `SignInModal` over the always-rendered app. Never reachable as a route; there is no full-page sign-in.

V2 redesign (Path C): deterministic sign-in is the primary path (same `signIn()` for new + returning); backup-file + paste-secret are secondary recovery, tucked behind a "Restore wallet from backup" link. See `specs/TX_SIGNING.md` + `specs/TX_SIGNING_V2_AMENDMENT.md`.

## Contents

| Component | Purpose |
|---|---|
| `OnboardingShell` | Non-dismissible `Modal` + `FlowHeader` wrapper. Owns the body padding; step content + footer flow inside. |
| `SignInModal` | The sign-in, opened over the dashboard as `openModalAtom = 'sign-in'` (FlowShell chrome, titled "Sign in"). Renders `SignInFlow` with `autoStart`. On unlock it closes onto the flow queued in `state/ui::signInResumeAtom` (if any), unless the user closed the modal first; closing it drops the queued flow. Opened by `hooks/useOpenActionModal` (the gate in front of every action) and the dashboard's sign-in card. |
| `SignInFlow` | **Primary flow — one state-agnostic view for first visit AND returning users.** `signIn()` first-derives (new) or re-derives (returning) the same identity, so there is no create/unlock split. Views: `sign-in` (connect + sign; with `autoStart` it asks for the signature as soon as a wallet is connected, once per address — a declined prompt waits for "Sign in"; the first-time two-signature note shows before connecting when this browser has no stored walletId), `restore` (backup file [default] ⇄ paste secret, toggled by a text link), `signer-error` (renders `NonDeterministicSignerScreen`). Restore is reached via a quiet "Restore wallet from backup" link; once a restored wallet's first sync lands, a "Your balance is up to date" toast confirms it (`hooks/useRestoreSyncedToast`). |
| `OnboardingFlow` | Legacy 6-step flow (Welcome → Sign → Checksum → Backup → ConfirmBackup → Complete). **Dead** — not rendered by the app; still compiles + owns the `steps/*` components. Tests are `describe.skip`'d; kept until a deletion pass. |
| `NonDeterministicSignerScreen` | Error view rendered by `SignInFlow` (inside the modal) when the determinism check fails on sign-in. Headline + body + supported/unsupported wallet compatibility lists + two CTAs (use backup/paste recovery → restore view; try a different wallet → disconnect + back to sign-in). |
## How sign-in fits the app

`App.tsx` tracks a local `mode` (`pre-migration` / `pre-init` / `app`). It runs the V2 schema migration on `pre-migration`; on `pre-init` it seeds the persisted walletId (if any) as a `locked` entry (an `unlocked` HMR re-mount is left alone), then renders the app. From then on the app shell always renders, whatever the wallet status:

- **Locked or no wallet:** the dashboard shows only `dashboard/SignInCard` in the balance spot (connect / sign in / reconnecting, the lock reason, a pay-link's context, the wallet's public USDC) — no activity, no banners. First-run (no persisted id) is the same: signing in first-derives the wallet.
- **Every action while locked** goes through `hooks/useOpenActionModal`: disconnected → the RainbowKit connect modal, then sign-in; locked → the `SignInModal` with the action queued; unlocked → the action's modal.
- **Locking** (auto-lock timer, account switch, tab unload, hidden-tab grace, Settings → Lock / Reset) flips the atom to `locked` / `missing`; `hooks/useCloseFlowsOnLock` closes any open flow, receipt or activity panel, and the dashboard swaps back to the sign-in card. Idle, hidden and manual locks record why (`state/ui::lockReasonAtom`) for the card's "Locked after…" line.

There is no create/unlock fork and no "clear this browser's saved login" affordance — since sign-in is the only entry, a returning user can't accidentally orphan their wallet, so the old `hadPersistedWalletAtBoot` machinery is gone.

## Key handling

- Keys are derived deterministically from an EIP-712 signature, not a generated mnemonic. The signature is captured at the Sign step; HKDF-SHA-256 produces a 32-byte `root_secret` held by `lib/shielded/keyManager` (module-scope, not in atoms, not in component state).
- The recovery export format is an encrypted JSON blob (`armada-backup-v2`), produced via Settings → Export recovery. The plaintext root_secret never enters component state or atoms.
- The anti-phish checksum (12 hex chars) IS exposed via `state.checksum` — it's a non-secret display value used to recognize an authentic unlock screen.
- All secret-handling rules from `lib/shielded/CLAUDE.md` apply: no `console.log`, no clipboard persistence beyond what the user pastes themselves, no atom storage of keys.

## Account-switch handling

When wagmi reports a new EVM address while the shielded wallet is unlocked (Phase 4), `useWallet` detects the mismatch via `keyManager.getEvmAddress()`, immediately calls `lockWallet()`, resets the active wallet atoms, and surfaces a `sonner` toast. The dashboard swaps to its sign-in card, and the user signs in for the new EVM account.
