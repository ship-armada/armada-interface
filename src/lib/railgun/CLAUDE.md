# lib/railgun/

Wrappers around `@railgun-community/wallet` / `@railgun-community/engine` for shielded wallet lifecycle, proof generation, and tree sync.

## Files

| File | Purpose | Status |
|---|---|---|
| `wallet.ts` | Create / unlock / lock / reset a Railgun wallet. Plural-ready (`id` param) even though v1 UX is singular. | Stub |
| `prover.ts` | Lazy-initialise the proving engine; expose proof generation entry points. Mirrors warmup state to `railgunEngineAtom`. | Stub |
| `sync.ts` | Trigger shielded-balance scans and expose sync status. | Stub |

## Secret-handling rules (HARD)

Privacy apps routinely leak through carelessly-written telemetry and dev logs. Belt-and-suspenders rules for everything in this directory:

1. **Never `console.log` / `console.debug` mnemonics, viewing keys, spending keys, decrypted DEKs, or anything derived from them.** Use `lib/telemetry.ts::track` for structured events with allowlisted shapes — the registry won't let a key slip through.

2. **Memory zeroization** (reviewer rec #11):
   - Where the Railgun SDK gives us key material as `Uint8Array`, `fill(0)` after use.
   - Avoid storing the mnemonic as a JS string when avoidable — strings are interned and cannot be zeroized. Prefer `Uint8Array` of UTF-8 bytes; convert at the SDK boundary only.
   - Decrypted DEK lives in memory for one operation, then `fill(0)`. Never store on `window`, in localStorage, or in a Jotai atom.
   - JS makes zeroization imperfect (V8 may move buffers), but the discipline still meaningfully reduces leak surface.

3. **Encryption at rest.** Mnemonic + view/spending keys are encrypted with PBKDF2 (Web Crypto, ≥100k iters) → AES-GCM before persistence. Salt + IV stored alongside the ciphertext in IDB. The encrypted blob never leaves IDB.

4. **Session-bound unlock.** Decrypted key material is held in memory for the active session only. 15-minute inactivity timeout auto-locks (zeroizes); reload requires re-entering the passphrase. The timeout is configurable but defaults to 15 minutes.

5. **No mnemonic in URL, in clipboard for longer than necessary, or in error messages.** Export UX (Settings → Reveal recovery phrase) shows the phrase in a confirm-gated modal and clears it on close.

## Warmup state

`prover.ts::initProver()` updates `railgunEngineAtom` through `'cold' → 'warming' → 'ready'` (or `'failed'`). Callers can observe state via the atom; the UI shows a "warming up…" indicator during first use.

`initProver()` is idempotent — calling twice while warming or after ready is a no-op. Engine init is heavy (WASM artifacts ~1MB+); the executor's first stage handler that needs proofs should await readiness before proceeding.

## WebAuthn (future, not now)

For v1, passphrase-only. The encryption schema is wrapped-key-friendly: passphrase derives a Key-Encryption-Key (KEK) that wraps a Data-Encryption-Key (DEK); the DEK actually encrypts the mnemonic/keys. A future WebAuthn / passkey flow can wrap the same DEK with a platform-authenticator key without changing the underlying storage format. Don't paint into a corner that assumes password-only forever.

## What we explicitly DON'T do

- Custodial fallback. No server-side key escrow, ever.
- Mnemonic upload / cloud sync. The user owns the recovery phrase; they can write it down themselves.
- Sharing the encrypted blob across devices. v1 is single-device. Multi-device sync requires its own design pass.
- Direct interop with MetaMask / EVM wallet seed phrases. Railgun mnemonic is independent of the EVM wallet (reviewer rec #5).
