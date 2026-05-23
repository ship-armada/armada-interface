# hooks/

One concern per hook. Hooks own the React lifecycle (effects, subscriptions, timers) and bridge `lib/` (pure logic) to `state/` (atoms). Components consume hooks and atoms; they never call `lib/` directly.

| Hook | Concern | Status |
|---|---|---|
| `useTabVisible()` | Sole `visibilitychange` listener → `tabVisibleAtom`. Mount once at App root. | Working |
| `useAutoLock()` | Idle-timer-driven lock for the shielded wallet; reads `preferencesAtom.autoLockMinutes`. Mount once at App root. | Working |
| `useWallet()` | wagmi state + ethers signer via `walletClientToSigner`. Mirrors `evmAddressAtom`. | Working |
| `useShieldedWallet()` | Railgun wallet lifecycle: `enroll()` (EIP-712 sign → root_secret) / `unlockByPaste(hex)` / `unlockByBackup(file, passphrase)` / `exportBackup(passphrase)` / `lock()` / `reset()`. | Working |
| `useBalances()` | Aggregated balance view (unshielded per chain, shielded, yield shares). | Reads atoms only; shielded is now live via `useShieldedBalanceSync` |
| `useShieldedBalanceSync()` | Subscribes to SDK balance events + drives initial scan on unlock; writes `shieldedUsdcAtom`. Mount once at App root. | Working |
| `useRailgunEngineSync()` | Bridges `lib/railgun/init`'s lifecycle into `railgunEngineAtom`. Mount once at App root. | Working |
| `useYieldRate()` | Polls vault rate + net APY (gross spoke yield × vault fee) via React Query (visibility-paused, 5min cadence). Exposes `refresh()` for on-open + post-submit pulls. | Working |
| `useFees()` | `/fees` quote via React Query — auto-refreshes near expiry, exponential cold-start backoff, dedups across consumers. | Working |
| `useTx({ kind })` | Per-tx submit/track/retry/cancel. Multi-instance — each call owns a ulid. | Skeleton (state writes work, stage pipeline TODO) |
| `useTxHistory()` | Hydrates `txListAtom` from IDB on mount. | Working |
| `useCctpAttestation(record)` | Polls Iris for a specific xchain tx record. | Stub |

## Conventions

- **No business logic in components.** Components use hooks; hooks call `lib/` (which has no React).
- **Effects clean up.** Every `useEffect` that starts a timer / subscription / fetch returns a cleanup. `AbortController` for fetches; `removeEventListener` for DOM events; `clearTimeout` for setTimeout.
- **Polling gates on `tabVisibleAtom`.** Don't read `document.visibilityState` from a hook — read the atom.
- **Telemetry calls on state transitions.** Use `track(event, props)` for happy path, `trackError(scope, err)` for caught errors. Make every async path traceable.
- **No memoization theater.** Only `useMemo`/`useCallback` when (a) referential identity matters (deps of another effect) or (b) the computation is genuinely expensive.

## Pattern: per-tx hook is multi-instance

`useTx({ kind })` is intentionally NOT a singleton. Each call generates a fresh ulid on `submit()` and writes a separate `TxRecord` to `txListAtom`. Multiple modal flows can have their own `useTx` instances running concurrently — that's the whole point. Don't memoize the hook at the App level.
