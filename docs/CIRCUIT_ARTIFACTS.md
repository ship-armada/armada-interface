# ZK circuit artifacts

How the interface loads its Groth16 circuit artifacts (`zkey` / `circuit.wasm` / `vkey.json`), and how
to publish them. Fixes the coverage gap in issue #6.

## Strategy

- **Host-agnostic.** The interface fetches artifacts from a configurable base URL
  (`VITE_ARTIFACTS_BASE_URL`, default same-origin `/artifacts`). The host serves one folder per padded
  shape: `<base>/NNxMM/{zkey,circuit.wasm,vkey.json}` (e.g. `08x04/zkey`).
- **Integrity-verified.** Every fetched file is SHA-256-checked against the committed
  `src/config/circuits.manifest.json` before it reaches the prover (`lib/shielded/circuitFetch.ts`). A
  404 or a hash mismatch is a hard error — there is **no** IPFS fallback. Because of this, the host does
  **not** need to be trusted, only available: a compromised/misconfigured host can't feed a bad zkey.
- **All shapes, lazily.** The SDK `ArtifactSource` (`lib/shielded/sdk-prover.ts`) lazy-loads any shape on
  first proof; common small shapes are warmed on mount (`lib/shielded/artifacts.ts`). Heavy/rare shapes
  (e.g. `08x04`, ~43 MB) load only when actually used.
- **Binaries are not committed.** `public/artifacts/**` is gitignored; only the tiny manifest is
  committed (the integrity anchor).

## Config

| Env | Meaning |
|---|---|
| `VITE_ARTIFACTS_BASE_URL` | Directory serving the per-shape folders. Unset → same-origin `/artifacts`. Deploy sets it to the hosted release, e.g. `https://r2.testnet.armada.blue/circuits/v0.1.0-dev`. |

## Local development

Populate `public/artifacts` from the pinned release (the tag in the committed manifest):

```bash
npm run circuits:fetch          # downloads + verifies + normalizes into public/artifacts
```

Then run the app with `VITE_ARTIFACTS_BASE_URL` unset (same-origin). Alternatively, point
`VITE_ARTIFACTS_BASE_URL` at a running host and skip the local copy entirely.

## Publishing to a host (testnet: relayer VPS)

```bash
# Normalize + verify the pinned release and rsync it to the host:
npm run circuits:publish -- --dest deploy@<vps-host>:/var/www/circuits/v0.1.0-dev
```

Then serve that directory over HTTPS with CORS + long cache. Example nginx:

```nginx
# https://r2.testnet.armada.blue/circuits/<tag>/NNxMM/...
location /circuits/ {
    root /var/www;                      # files at /var/www/circuits/<tag>/NNxMM/...
    add_header Access-Control-Allow-Origin "https://app.testnet.armada.blue" always;
    add_header Access-Control-Allow-Methods "GET, HEAD" always;
    add_header Cache-Control "public, max-age=31536000, immutable" always;
    types { application/octet-stream zkey wasm; application/json json; }
    default_type application/octet-stream;
}
```

Set the frontend's `VITE_ARTIFACTS_BASE_URL=https://<host>/circuits/v0.1.0-dev` and redeploy.

## Bumping to a new release (incl. the mainnet ceremony)

```bash
# Regenerates the committed manifest AND publishes the new shapes:
npm run circuits:publish -- --tag <new-release-tag> --dest deploy@<host>:/var/www/circuits/<new-release-tag>
git add src/config/circuits.manifest.json && git commit -m "chore(circuits): bump to <new-release-tag>"
```

Then point `VITE_ARTIFACTS_BASE_URL` at the new `<new-release-tag>` path. No app code changes — the
mainnet ceremony circuits are just a different release tag + base path.

> **Circuits-repo dependency:** the release must ship a consumption-ready bundle — one `.tgz` of
> `NxM/final.zkey`, `NxM/main_NxM_js/main_NxM.wasm`, `NxM/vkey.json` + a `SHA256SUMS` (as `v0.1.0-dev`
> does). The `v1.0.0-ceremony-test` release currently ships raw per-contribution files and must be
> standardized to this bundle format before it can be published here.

## Files

| File | Role |
|---|---|
| `src/config/circuits.ts` | Base-URL resolution + manifest lookup. |
| `src/config/circuits.manifest.json` | Committed shape → sha256 integrity manifest. |
| `src/lib/shielded/circuitFetch.ts` | Fetch + verify + de-dupe + registry population. |
| `src/lib/shielded/sdk-prover.ts` | SDK `ArtifactSource` — lazy `resolve()`. |
| `src/lib/shielded/artifacts.ts` | Mount preload of common shapes. |
| `scripts/gen-circuits-manifest.mjs` | Manifest generator (from a release `SHA256SUMS`). |
| `scripts/publish-circuits.mjs` | Normalize a release → per-shape layout → local dir or rsync. |
