# armada-interface — security notes

Security-relevant design decisions and residual risks for the user app. Companion to
`DEPLOYMENT.md` (env/config) and `../../.claude/PLAN_ARMADA_INTERFACE.md` (§security boundary).

## Shielded quick-sync trust model (F5)

The `@armada/sdk` read instance (`lib/shielded/sdk-read.ts`) can hydrate its client-side commitment
merkletree from our relayer-v2 **watcher** (`VITE_INDEXER_URL` → the SDK's
`GET /v2/quick-sync/:hubChainId`) instead of an O(chain-length) `eth_getLogs` scan. The watcher is
**untrusted** — it must only be able to cause a *slower sync*, never *forged or inflated balances*.
Two independent on-chain checks enforce that; the chain is the sole root of trust.

### 1. Merkle root verification (forged-balance defense)

The SDK accepts a quick-sync batch only if its commitment leaves rebuild the hub PrivacyPool's
on-chain merkle root: at the head the rebuilt tree must equal the pool's `(treeNumber, merkleRoot,
nextLeafIndex)` read at that block, while earlier chunks and trees are checked by `rootHistory`
membership (SDK `SPEC.md` §4, "Merkle root verification" / "Chunked sync" / "Quick-sync interface"). A watcher that injects, drops or mutates
commitments produces a root the chain never recorded → the SDK rejects the batch and re-scans that
range from RPC. No forged commitment ever reaches a wallet's notes. This is built into the SDK; the
app adds no root-validation code. Each sync reports the outcome as `sdk.quicksync` telemetry
(`served`, or `root-mismatch-fallback` with a `reason`; `lib/shielded/sdk-telemetry.ts`), so a
watcher that is being rejected is visible rather than silently slow.

### 2. Nullifier cross-check (omitted-spend defense)

The root check binds the commitment leaves only. Nullifiers (and note ciphertexts / history
metadata) aren't covered by it — the SDK tracks that as SYNC-4 — so it cannot catch an *omitted*
`Nullified` event: a watcher that serves commitments faithfully but drops a nullifier makes an
already-spent note look unspent → an **inflated displayed balance** (never actually spendable — the
chain rejects the double-spend — but misleading UX and a footgun).

`lib/shielded/nullifierCrossCheck.ts` closes this gap for the wallet's own notes. Once the initial
scan completes (and again after a Try-again re-sync), `hooks/useNullifierCrossCheck.ts` reads the
wallet's locally-unspent notes (the SDK wallet's `spendableNullifiers()`, each carrying its `tree` +
`nullifier`) and queries the hub PrivacyPool's `nullifiers(treeNumber, nullifier)` getter directly,
batched into one Multicall3 `aggregate3` call. If the chain reports an own "unspent" note as spent →
`nullifierCrossCheckAtom` flips to `omission-detected` → the spend gate
(`hooks/useSpendableSyncGate.ts`) blocks with a re-sync prompt.

**Fail-open:** the cross-check is a UX-integrity safeguard, not the double-spend boundary (the chain
enforces that regardless). A transient hub-RPC error must not block spending, so on error it logs
and reports no omission, and a sub-call that can't be read counts as unspent. A malicious watcher
cannot trigger this path — the check hits the chain RPC, not the watcher.

### Degradation (B4)

With `VITE_INDEXER_URL` unset, the SDK instance is created without an indexer and scans from RPC
only. Both safety checks operate identically on the RPC-scanned tree. The app is fully functional
with no indexer configured.

## Residual risks

- **P6 — nullifier query IP linkability (testnet: accepted).** The nullifier cross-check queries the
  wallet's own nullifiers directly, letting the RPC provider link them to the user's IP when those
  notes are later spent on-chain. **Accepted for testnet** — it matches the exposure the app already
  has (every RPC read goes to the same provider). The lookups are batched into one Multicall3
  `aggregate3` eth_call. **Mainnet follow-up:** mix in decoy nullifiers sampled from the global
  commitment stream so the provider can't isolate the user's own set. Tracked for the mainnet
  hardening pass.
- **Quick-sync wire lockstep (B3).** The watcher serves the SDK's native quick-sync wire contract
  (`QUICK_SYNC_SCHEMA_VERSION`, stamped into every response). The SDK rejects a version it doesn't
  recognise, so a skew degrades every sync to the RPC scan (`sdk.quicksync` with
  `reason: 'schema-mismatch'`) rather than mis-scanning. Bumping `@armada/sdk` to a release that
  changes the wire schema needs a paired watcher release in `ship-armada/armada-relayer` in the same
  change window.
