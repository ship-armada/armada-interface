# config/

Env-driven configuration. **All env-var reads happen here.** Hooks and components import typed config objects, never `import.meta.env` directly.

| File | Responsibility |
|---|---|
| `network.ts` | Resolves `VITE_NETWORK` (local/sepolia) → hub + client chain identities, RPC URLs, relayer/iris/indexer URLs, polling cadence. Holds the per-mode **client registry** (`getClientRegistry`) — every known client — filtered by `VITE_ENABLED_CLIENTS` (`resolveEnabledClients`). `getNetworkConfig()` is the single entry point. |
| `wagmi.ts` | Builds the wagmi config from `network.ts`. `resolveChainsForMode()` derives one wagmi `Chain` per active identity (hub + enabled clients) — canonical viem objects where known (`KNOWN_VIEM_CHAINS`), synthesized from the `ChainIdentity` otherwise. No hardcoded chain count. |
| `deployments.ts` | Fetches hub + each **enabled** client privacy-pool manifest from `/api/deployments/*.json` (served by the Vite plugin). Manifest name = `privacy-pool-<prefix>[-sepolia].json` where `<prefix>` is the chain's `deploymentPrefix` (`hub`, `client1`, `client2`, … — 1-based, N clients), matching armada-poc's `getPrivacyPoolDeploymentFile`. Cached in memory. |
| `relayer.ts` | Relayer base URL + endpoint constants + typed error codes. The HTTP client itself lives in `lib/relayer.ts`. |

## Multi-client model (1 hub + N clients)

The protocol is one hub + N client chains. The full set of known clients per mode lives in the
`network.ts` **client registry**; an operator enables a subset at boot:

```
VITE_ENABLED_CLIENTS="base-sepolia,arbitrum-sepolia"   # subset of ClientEntry.key; unset ⇒ all
```

`ClientEntry.key` is the human-friendly enable-list id; `ClientEntry.deploymentPrefix` (`client1`,
`client2`, …) is the stable manifest identity that mirrors `armada-poc/config/networks.ts` and is
independent of which clients are enabled. Everything downstream iterates `getNetworkConfig().clients`
or looks up by `getChainById` / `getChainByDomain` / `getDeploymentPrefix` — no positional/count
assumptions.

A client can be **catalogued but off by default** with `enabledByDefault: false` — it exists in the
registry (selectable via `VITE_ENABLED_CLIENTS`) but isn't active when the enable-list is unset. Use
this for a client whose deployment manifest isn't published yet, so the default build doesn't demand
a manifest that 404s. Example: `optimism-sepolia` (client3) is catalogued off-by-default until
`ship-armada/armada-deployments` publishes an `optimism-sepolia/` dir; enable it with
`VITE_ENABLED_CLIENTS=base-sepolia,arbitrum-sepolia,optimism-sepolia`.

## Conventions

- Never read `import.meta.env.*` outside this folder.
- Manifest loaders return `Promise<...>`; UI surfaces (App.tsx) handle the promise with `useQuery` so retries + error states are uniform.
- **Adding a new client chain:** add one `ClientEntry` to the mode's registry in `network.ts`
  (`key`, `identity`, `deploymentPrefix` matching what `armada-poc add_client` assigns; set
  `enabledByDefault: false` if its deployment isn't published yet). That alone flows through
  `deployments.ts` (manifest name), `wagmi.ts` (transport), and every consumer. Optionally add the
  chain to `KNOWN_VIEM_CHAINS` in `wagmi.ts` for canonical metadata, and — for a public-testnet
  client — a `-o` line in `scripts/fetch-sepolia-deployments.sh` (guard it with `|| true` until the
  upstream dir exists). Confirm the deploy tooling emits `privacy-pool-<prefix>[-sepolia].json` for
  the new prefix.
