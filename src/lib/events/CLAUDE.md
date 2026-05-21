# lib/events/

Abstraction over the protocol's event/log data source. Hooks consume `EventSource`; they never know whether the bytes came from a node's `eth_getLogs` or an indexer's REST API.

## Why this exists

The reviewer flagged (rec #8) that indexer-vs-RPC will keep coming back as a decision. Putting the seam between consumers and source NOW means:

- Hooks don't accidentally couple to `JsonRpcProvider` and become hard to swap.
- An indexer rollout is a one-file change (`getEventSource()` returns a different implementation).
- Local mode (no indexer) and production (indexer + RPC fallback) follow the same code paths.

## Files

| File | Purpose | Status |
|---|---|---|
| `EventSource.ts` | The interface + raw event shapes (`RawCommitment`, `RawNullifier`, `RawTxLog`, `FetchRange`). | Working |
| `RpcEventSource.ts` | Implementation against an ethers `JsonRpcProvider`. | Stub — returns empty arrays |
| `IndexerEventSource.ts` | Implementation against an HTTP indexer. | Stub — throws |
| `getLogsChunked.ts` | Generic helper that splits an inclusive block range into windows of at most `maxRange` blocks. Honors `AbortSignal`, supports an `onChunk` progress callback. | Working |
| `index.ts` | Factory `getEventSource({ provider, hubContractAddress })` + re-exports. | Working |

## Bounded log queries — non-negotiable

Public RPCs (Alchemy, Infura, publicnode) reject or rate-limit `eth_getLogs` requests that span more than ~10k blocks. The `RpcEventSource` implementation MUST go through `getLogsChunked` (or a per-tick equivalent) and MUST honor `NetworkConfig.maxLogRange` — never call the underlying client's `getLogs` with an unbounded `fromBlock`/`toBlock` directly. The chunker runs locally too with a generously large `maxLogRange` so the same code path covers both environments.

## Wiring policy

- Feature passes that need events call `getEventSource(...)` once and inject the result into hooks/executor handlers.
- Don't read `getNetworkConfig().indexerUrl` from the consumer — the factory owns that decision.
- Don't add new methods to `EventSource` lightly. The interface is the contract both implementations must honor; adding a method means implementing it in both.

## Future-friendly notes

- **Indexer evolution**: the indexer schema is TBD. The `Raw*` envelopes today are deliberately log-shaped (`topics`, `data`) — when the indexer returns parsed records, we'll likely add a parallel `Parsed*` interface and the consuming hooks will use that. The `Raw*` shapes stay as the lowest-common-denominator.
- **CCTP MessageSent**: lives under `getTxHistory(address)` rather than its own method, because the underlying log is contract-emitted and the consumer parses it.
- **Cache**: neither implementation caches today. If/when indexer pagination becomes expensive, IDB-backed caching belongs in a wrapping decorator implementation, not inside RPC or Indexer.
