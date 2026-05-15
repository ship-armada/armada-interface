# config/

Env-driven configuration. **All env-var reads happen here.** Hooks and components import typed config objects, never `import.meta.env` directly.

| File | Responsibility |
|---|---|
| `network.ts` | Resolves `VITE_NETWORK` (local/sepolia) → hub + client chain identities, RPC URLs, relayer/iris/indexer URLs, polling cadence. `getNetworkConfig()` is the single entry point. |
| `wagmi.ts` | Builds the wagmi config from `network.ts`. Registers all three Anvil chains in local mode or Sepolia + Base/Arb Sepolia in sepolia mode. |
| `deployments.ts` | Fetches hub + each client privacy-pool manifest from `/api/deployments/*.json` (served by the Vite plugin). Cached in memory. Typed against the actual manifest schemas. |
| `relayer.ts` | Relayer base URL + endpoint constants + typed error codes. The HTTP client itself lives in `lib/relayer.ts`. |

## Conventions

- Never read `import.meta.env.*` outside this folder.
- Manifest loaders return `Promise<...>`; UI surfaces (App.tsx) handle the promise with `useQuery` so retries + error states are uniform.
- Adding a new chain means: (1) add it to `network.ts` config function, (2) register the wagmi chain, (3) add the manifest filename to `deployments.ts`.
