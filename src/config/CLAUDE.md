# config/

Env-driven configuration. **All env-var reads happen here.** Hooks and components import typed config objects, never `import.meta.env` directly.

| File | Responsibility |
|---|---|
| `network.ts` | Resolves `VITE_NETWORK` (local/sepolia) → hub + client chain identities, RPC URLs, relayer/iris/indexer URLs, polling cadence. Holds the per-mode **client registry** (`getClientRegistry`) — every known client — filtered by `VITE_ENABLED_CLIENTS` (`resolveEnabledClients`). `getNetworkConfig()` is the single entry point. |
| `wagmi.ts` | Builds the wagmi config from `network.ts`. `resolveChainsForMode()` derives one wagmi `Chain` per active identity (hub + enabled clients) — canonical viem objects where known (`KNOWN_VIEM_CHAINS`), synthesized from the `ChainIdentity` otherwise. No hardcoded chain count. |
| `deployments.ts` | Fetches the hub manifest (`privacy-pool-hub[-sepolia].json`), then **probes** the contiguous `privacy-pool-client<i>[-sepolia].json` files and **binds each by its embedded `chainId`** — never by ordinal position. Joins to the enabled registry clients by chainId; an enabled-but-undeployed client is skipped (not a hard failure). Cached in memory. |
| `relayer.ts` | Relayer base URL + endpoint constants + typed error codes. The HTTP client itself lives in `lib/relayer.ts`. |

## Multi-client model (1 hub + N clients)

The protocol is one hub + N client chains. The full set of known clients per mode lives in the
`network.ts` **client registry**; an operator enables a subset at boot:

```
VITE_ENABLED_CLIENTS="base-sepolia,arbitrum-sepolia"   # subset of ClientEntry.key; unset ⇒ all
```

`ClientEntry.key` is the human-friendly enable-list id. **`chainId` is the single stable identifier**
end-to-end: deployment manifests are bound to registry chains by the `chainId` embedded inside each
manifest (not by filename ordinal), so a chain can be `client1` in one deployment and `client2` in
another and everything still resolves. Everything downstream iterates `getNetworkConfig().clients` or
looks up by `getChainById` / `getChainByDomain` — no positional/count assumptions.

A client can be **catalogued but off by default** with `enabledByDefault: false` — it exists in the
registry (selectable via `VITE_ENABLED_CLIENTS`) but isn't active when the enable-list is unset. The
default set mirrors the canonical deployment instance (`demo3` = **Base + Optimism**), so
`arbitrum-sepolia` is the catalog/opt-in entry: enable it for an Arbitrum-bearing instance with
`VITE_ENABLED_CLIENTS=base-sepolia,arbitrum-sepolia`.

## Conventions

- Never read `import.meta.env.*` outside this folder.
- Manifest loaders return `Promise<...>`; UI surfaces (App.tsx) handle the promise with `useQuery` so retries + error states are uniform.
- **Adding a new client chain:** add one `ClientEntry` to the mode's registry in `network.ts`
  (`key`, `identity`; set `enabledByDefault: false` if it isn't in every instance). That alone flows
  through `deployments.ts`, `wagmi.ts` (transport), and every consumer — binding is by embedded
  `chainId`, so no filename/ordinal wiring is needed. Optionally add the chain to `KNOWN_VIEM_CHAINS`
  in `wagmi.ts` for canonical metadata. For a public-testnet client, the sepolia fetch
  (`scripts/fetch-sepolia-deployments.mjs`) discovers chains from the instance `manifest.json`, so no
  per-chain edit there either — just make sure the deployment instance actually lists it.
