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
| `VITE_ARTIFACTS_BASE_URL` | Directory serving the per-shape folders. Unset → same-origin `/artifacts`. Deploy sets it to the hosted release, e.g. `https://circuits.knowable.run/v0.1.0-dev` (testnet). |

## Local development

Populate `public/artifacts` from the pinned release (the tag in the committed manifest):

```bash
npm run circuits:fetch          # downloads + verifies + normalizes into public/artifacts
```

Then run the app with `VITE_ARTIFACTS_BASE_URL` unset (same-origin). Alternatively, point
`VITE_ARTIFACTS_BASE_URL` at a running host and skip the local copy entirely.

## Publishing to a host

The host must serve the per-shape layout `<base>/NNxMM/{zkey,circuit.wasm,vkey.json}`. Note the release
tarball is laid out differently (`NxM/final.zkey`, `NxM/main_NxM_js/main_NxM.wasm`, `NxM/vkey.json`,
unpadded), so it **cannot** be served as-is — it must be normalized (pad the shape, flatten + rename).
The testnet host is `circuits.knowable.run` on the relayer VPS.

### Option A — normalize on the host (no SSH keys / gh needed; the repo is public)

```bash
cd /tmp
BASE=https://github.com/ship-armada/armada-circuits/releases/download/v0.1.0-dev
curl -L -o armada-circuits.tgz "$BASE/armada-circuits-v0.1.0-dev.tgz"
curl -L -o SHA256SUMS          "$BASE/SHA256SUMS"
mkdir -p extracted && tar xzf armada-circuits.tgz -C extracted

# Verify the circuit files. SHA256SUMS also self-references the .tgz (which lives in /tmp, not
# extracted/), so drop that line or `sha256sum -c` reports a false failure.
( cd extracted && grep -v '\.tgz' ../SHA256SUMS | sha256sum -c - ) || { echo "CHECKSUM FAILED"; exit 1; }

# Normalize NxM/... → <tag>/NNxMM/{zkey,circuit.wasm,vkey.json}
DEST=/var/www/circuits/v0.1.0-dev
cd extracted
for d in */ ; do
  shape="${d%/}"; [ -f "$shape/final.zkey" ] || continue
  n="${shape%x*}"; m="${shape#*x}"; padded="$(printf '%02dx%02d' "$n" "$m")"
  mkdir -p "$DEST/$padded"
  cp "$shape/final.zkey"                          "$DEST/$padded/zkey"
  cp "$shape/main_${shape}_js/main_${shape}.wasm" "$DEST/$padded/circuit.wasm"
  cp "$shape/vkey.json"                           "$DEST/$padded/vkey.json"
done
chmod -R a+rX "$DEST"
cd /tmp && rm -rf extracted armada-circuits.tgz SHA256SUMS
```

### Option B — publish from a dev machine / CI (needs `gh` auth + SSH to the host)

```bash
npm run circuits:publish -- --dest <ssh-user>@circuits.knowable.run:/var/www/circuits/v0.1.0-dev
```

Same result (download → verify → normalize → deploy), transported over rsync. Handy in CI where auth
is already configured.

### nginx (dedicated `circuits.knowable.run` server block)

```nginx
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name circuits.knowable.run;
    ssl_certificate     /etc/letsencrypt/live/circuits.knowable.run/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/circuits.knowable.run/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    root /var/www/circuits;              # files at /var/www/circuits/<tag>/NNxMM/...
    location / {
        # Public, immutable, release-versioned binaries — verified client-side against the committed
        # manifest, so a wildcard CORS grant is safe (nothing secret, no credentials).
        add_header Access-Control-Allow-Origin  "*" always;
        add_header Access-Control-Allow-Methods "GET, HEAD" always;
        add_header Cache-Control "public, max-age=31536000, immutable" always;
        types { application/wasm wasm; application/json json; }
        default_type application/octet-stream;   # the extensionless `zkey` file
    }
}
```

Then set `VITE_ARTIFACTS_BASE_URL=https://circuits.knowable.run/v0.1.0-dev` in the deploy env (Netlify)
and redeploy. Smoke-test: `curl -I https://circuits.knowable.run/v0.1.0-dev/08x04/zkey` → `200` +
`access-control-allow-origin: *`.

## Bumping to a new release (incl. the mainnet ceremony)

Regenerate + commit the manifest, then publish the new shapes under a new tag path:

```bash
npm run circuits:manifest -- --tag <new-tag>          # updates src/config/circuits.manifest.json
git add src/config/circuits.manifest.json && git commit -m "chore(circuits): bump to <new-tag>"
# then publish to <base>/<new-tag>/... (Option A with the new BASE, or Option B with --tag <new-tag>)
```

Then point `VITE_ARTIFACTS_BASE_URL` at the new `<new-tag>` path. No app code changes — the mainnet
ceremony circuits are just a different release tag + base path.

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
| `scripts/publish-circuits.mjs` | Normalize a release → per-shape layout → local dir or rsync (Option B). Option A is a host-side `curl`+`bash` equivalent. |
