# lib/

Pure logic — **no React imports allowed.** These modules are unit-testable with plain vitest (no jsdom).

| File / dir | Purpose | Status |
|---|---|---|
| `rpc.ts` | `FallbackJsonRpcProvider` + `createProvider`. Duplicated from crowdfund-shared. | Working |
| `cache.ts` | Generic IndexedDB helpers (`cacheGet/Put/Delete/All/Clear`) keyed by store name. | Working |
| `format.ts` | `formatUsdc`, `truncateAddress`, etc. Duplicated from crowdfund-shared. | Working |
| `revert.ts` | `mapRevertToMessage(err)` for wallet + relayer errors. | Working |
| `wagmi-adapter.ts` | `walletClientToSigner(walletClient)` — viem → ethers v6 signer. Duplicated from committer. | Working |
| `telemetry.ts` | `track / trackTxTransition / trackError`. Console-only initially; sink swappable later. | Working |
| `relayer.ts` | HTTP client for `/fees`, `/relay`, `/status/:txHash`. **Stub** — signatures only. | Stub |
| `cctp.ts` | `MessageSent` log parsing + `pollIrisOnce`. **Stub.** | Stub |
| `railgun/wallet.ts` | EIP-712-signature-derived enroll/unlock/lock/reset. Plural-ready (`id` arg accepted but ignored — singular UX). | Working |
| `railgun/keyManager.ts` | Module-scope unlocked-state singleton: `rootSecret`, `walletId`, SDK encryption key, address, checksum. Getters throw when locked. | Working |
| `railgun/init.ts` | `startRailgunEngine` + POI dummy + level-js DB + IndexedDB artifact store. Idempotent. | Working |
| `railgun/network.ts` | Patches the SDK's `NETWORK_CONFIG.Hardhat` entry with our PrivacyPool address; loads the hub provider. | Working |
| `railgun/prover.ts` | Proof generation entry points (shield/unshield/transfer). **Stub.** | Stub |
| `railgun/sync.ts` | SDK balance-update event multiplexer + `refreshShieldedBalances` + `getShieldedERC20Balance` helpers. | Working |
| `tx/` | Tx lifecycle model — see `tx/CLAUDE.md`. | Working (types) + Stub (poller integration) |

## Conventions

- **No React imports.** If you reach for `useState`/`useEffect` here, you're in the wrong file — that's a hook.
- **No business logic in `components/**` — push it down here.** ESLint rule planned for the import check.
- **Stubs throw on call.** Better to fail loudly during development than to return fake data and confuse downstream consumers. Hooks that call into stubs should be marked `// TODO: implement` until the corresponding lib function is real.
- **Never log secrets.** No `console.log`/`console.debug` of mnemonics, viewing/spending keys, or anything derived from them. The eslint guard is configured to fail builds in `lib/railgun/`.

## Duplicated-from-shared note

`rpc.ts`, `format.ts`, `wagmi-adapter.ts`, `revert.ts` are duplicated from `@armada/crowdfund-shared/lib/*`. Don't evolve here without keeping the other in sync. When both apps need to diverge OR both need a new utility, extract to `@armada/eth-utils` (see root CLAUDE.md and Plan §19).
