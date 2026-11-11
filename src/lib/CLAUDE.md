# lib/

Pure logic — **no React imports allowed.** These modules are unit-testable with plain vitest (no jsdom).

The shielded-wallet and crypto folders have their own signposts with the full file lists and rules: `shielded/CLAUDE.md` and `crypto/CLAUDE.md`. The `shielded/` and `crypto/` rows below are the headline files only.

| File / dir | Purpose | Status |
|---|---|---|
| `rpc.ts` | `FallbackJsonRpcProvider` + `createProvider`. Duplicated from crowdfund-shared. | Working |
| `cache.ts` | Generic IndexedDB helpers (`cacheGet/Put/ReadModifyWrite/Delete/All/Clear`) over the `armada-interface` DB, keyed by store name (`txHistory`, `requestLinks`). | Working |
| `format.ts` | `formatUsdc`, `truncateAddress`, etc. Duplicated from crowdfund-shared. | Working |
| `address.ts` | EVM / shielded address validators (`validateEvmAddress`, `isShieldedAddress`, `validateShieldedAddressStrict`) + the counterparty display split (`splitAddressForDisplay`, `shortAddress`: fixed prefix + 8/6 (0zk) or 4/4 (0x) verifiable characters) + `extractAddress` (the one valid address inside pasted text / a payment URI). | Working |
| `revert.ts` | `mapRevertToMessage(err)` for wallet + relayer errors. | Working |
| `wagmi-adapter.ts` | `walletClientToSigner(walletClient)` — viem → ethers v6 signer. Duplicated from committer. | Working |
| `telemetry.ts` | `track / trackTxTransition / trackError`. Console always; `trackError` also forwards the full error to Sentry via `sentry.ts::captureError` (no-op unless a DSN is configured). | Working |
| `sentry.ts` | `initSentry` (DSN-gated no-op) + `captureError` + `scrubString`/`scrubEvent`. Errors-only, `sendDefaultPii: false`, `beforeSend` redacts 0zk/EVM addresses + long hex everywhere they can ride along — message, exception values, breadcrumbs (recursing into console breadcrumbs' raw log arguments), `contexts` and `extra`. Source-map upload is configured in `vite.config.ts` (`@sentry/vite-plugin`, gated on `SENTRY_AUTH_TOKEN`). | Working |
| `relayer.ts` | Relayer HTTP client (`fetchFees`, `submitRelay`, `pollStatus`, `fetchHealth`, `fetchCctpDeliveryStatus`) + per-kind fee model (`userFeeForKind`, `feeModelForKind`, `computeFeeBreakdown`, CCTP fee helpers) + duplicate-tx recovery (`extractDuplicateTxHash`). | Working |
| `rpc-bisecting.ts` | `installBisectingGetLogs()` — a one-time patch of ethers' `JsonRpcProvider.prototype.send` (called from `main.tsx`) that splits an `eth_getLogs` range an RPC rejects as too large and merges the halves. Affects every ethers `JsonRpcProvider` in the page; viem/wagmi are unaffected. | Working |
| `network-switch.ts` | `ensureChain(chainId)` — call at the top of a handler's first user-signed step. Sends `wallet_switchEthereumChain` straight to the EIP-1193 provider (bypassing wagmi's `switchChain`, which throws `ConnectorChainMismatchError` when its cache is stale), offers `wallet_addEthereumChain` for an unknown chain, then waits for the connector to report the chain. Throws user-facing copy. | Working |
| `multicall3.ts` | `aggregate3(provider, calls)` — folds many contract reads into one Multicall3 `eth_call` (`allowFailure: true`; a reverted sub-call comes back `success: false`). Duplicated from crowdfund-shared. | Working |
| `errors.ts` | Shared error predicates — `isUserRejection` (a declined wallet prompt) and `isChainMismatchError` — used by network-switch, the tx error classifier and the enrollment copy. | Working |
| `explorer.ts` | Block-explorer links — `txExplorerUrl`, `displayTxHash` (which hash a record's error UI shows), `deliveryExplorerLink` (a cross-chain tx's destination mint). Null when the chain has no explorer. | Working |
| `indexer.ts` | Quick-sync indexer (watcher) URL resolution + a `/health` probe for the Debug page pill. The SDK makes the actual quick-sync calls. | Working |
| `payViaLink.ts` | Builds + parses the `/pay-via-link` payment-request URL (recipient 0zk, amount, expiry, note) and the pending hand-off to the Send flow. Revocation is a dormant placeholder. | Working |
| `yield.ts` | Pure yield maths + display: shares→USDC, APY formats, `apyExplanation`, `projectedYearlyYield`. | Working |
| `walletProvider.ts` | `walletProviderFromConnector` — maps a wagmi connector to the provider key `components/WalletMenu` uses for its wallet icon. | Working |
| `wallet/` | Gasless-shield plumbing: EIP-2612 USDC permit signing (`permit.ts`), EIP-712 `ShieldIntent` / `CrossChainShieldIntent` signing + request hashing (`shield-intent.ts`), and the wrapper calldata builders the relayer submits (`gasless-shield.ts`, `gasless-cross-chain-shield.ts`). | Working |
| `cctp.ts` | CCTP `MessageSent` decoding from hub receipts/logs (`extractCctpMessageFromReceipt`, `readCctpMessage`, `readBurnMessage`, `readCctpFromLogs`) + `messageReceivedTopic()`, the `MessageReceived` topic both cross-chain handlers' delivery scans match. No Iris API polling. | Working |
| `shielded/wallet.ts` | `enrollFromSignature` (called by the `useShieldedWallet().signIn` hook) / unlockFromRootSecret / unlockFromBackup / lockWallet / resetWallet. Per-(EVM address, account) `armada.shielded.walletIds` + `armada.shielded.checksums` localStorage maps. | Working |
| `shielded/schema-migration.ts` | V2 cold-boot migration — drops legacy v1 localStorage keys + the legacy engine (`armada-shielded`) and cache (`armada-interface`) IndexedDB databases when `armada.shielded.schemaVersion < 2`. | Working |
| `shielded/keyManager.ts` | Module-scope unlocked-state singleton: `rootSecret`, `walletId`, `historyEncryptionKey`, `creationBlock`, `evmAddress` + `account` binding, address, checksum. Getters throw when locked; `clear()` zeroizes secret buffers. | Working |
| `crypto/cache-cipher.ts` | AES-256-GCM `wrap` / `unwrap` envelope helpers used by `lib/tx/storage` and `shielded/requestLinks.ts` for at-rest encryption of tx records and request links under `historyEncryptionKey`. BigInt round-trip via JSON sentinel. | Working |
| `crypto/determinism.ts` | Typed `NonDeterministicSignerError` + `verifySignatureDeterminism(reSign, firstSig)` used by `useShieldedWallet.signIn` to double-sign on first-ever sign-in for an EVM address. Later sign-ins are checked by `enrollFromSignature`'s cached-checksum compare, which throws the same error. | Working |
| `shielded/network.ts` | Pure-ethers hub-chain RPC helper — `timeoutProvider` (nullifier cross-check, cross-chain recovery). No engine coupling. History timestamps come from the SDK (fetching them per wallet block leaked which transactions are the wallet's, armada-sdk#135). | Working |
| `shielded/sync.ts` | Facade over the SDK-native `shielded/balance-bus.ts` (scan/balance/note fan-out + scan-status → `syncStateAtom`) + `refreshShieldedBalances` (`shielded/sdk-read.ts` `wallet.sync()`). Shielded reads come from `shielded/sdk-read.ts` (@armada/sdk). | Working |
| `fees/txFigures.ts` | `txFigures(record)` — every money figure a tx shows after submit (Confirm, Activity row + receipt, recovered receipt), derived from the record alone; the single source of receipt math (`txFiguresAs` for a caller that knows its layout, `txHeadline` for the row magnitude). Spec: `specs/TX_VALUES.md`. | Working |
| `fees/highFee.ts` | `highFeeLevel(fees, amount)` — Review's high-fee warning: `caution` when the fees are over 10% of the amount, `confirm` (an "I understand" tick before Confirm) over 25%, `none` otherwise or while unknown; integer basis-point comparison. `feePercent` for the copy. | Working |
| `fees/displayFees.ts` | Review-time fee helpers — `computeDisplayFees`, `shieldProtocolFeeBase`, `withdrawBelowFee`, native-gas formatting. | Working |
| `tx/` | Tx lifecycle model — see `tx/CLAUDE.md`. | Working |

## Conventions

- **No React imports.** If you reach for `useState`/`useEffect` here, you're in the wrong file — that's a hook.
- **No business logic in `components/**` — push it down here.** ESLint rule planned for the import check.
- **Stubs throw on call.** Better to fail loudly during development than to return fake data and confuse downstream consumers. Hooks that call into stubs should be marked `// TODO: implement` until the corresponding lib function is real.
- **Never log secrets.** No `console.log`/`console.debug` of the root secret, viewing/spending keys, or anything derived from them. There is no eslint config yet, so this is enforced by code review only.
- **Never emit "railgun" in any runtime string.** Telemetry event names + `trackError` scopes, `console.*` prefixes, thrown-Error messages, and wallet signature prompts MUST NOT contain "railgun" — an outside observer of the telemetry/console stream shouldn't see it (it reveals the fork and confuses more than it clarifies). Shielded-pool telemetry uses **`shielded.*`**; `@armada/sdk` concerns use **`sdk.*`**. This applies only to *emissions*: internal identifiers, import paths (`@/lib/shielded/*`), wire-format names the app maps at the boundary (the relayer's `broadcasterRailgunAddress`, normalized in `relayer.ts::fetchFees`), and dev docs may reference Railgun accurately.

## Duplicated-from-shared note

`rpc.ts`, `format.ts`, `multicall3.ts` are duplicated from `@armada/crowdfund-shared/lib/*`, and `wagmi-adapter.ts`, `revert.ts` from the crowdfund committer. Don't evolve here without keeping the other in sync. When both apps need to diverge OR both need a new utility, extract to `@armada/eth-utils` (see root CLAUDE.md and `docs/ARCHITECTURE.md` §16).
