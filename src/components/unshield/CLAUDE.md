# components/unshield/

The withdraw (private → public) flow. Opened via `setOpenModal('unshield')`. Chooses between `unshield-local` (destination == hub) and `unshield-xchain` (destination is a client chain) based on the form state.

## Contents

| Component | Purpose |
|---|---|
| `UnshieldModal` | Orchestrator. Owns step + form state. Mounts both `useTx({kind:'unshield-local'})` and `useTx({kind:'unshield-xchain'})`; the submitted one's record drives Progress + Complete. |
| `UnshieldInputStep` | Destination chain + EVM recipient + amount + fee summary. Shows an amber cross-chain notice when destination ≠ hub. |
| `UnshieldReviewStep` | Read-only echo. Tags the destination with `cross-chain` when applicable. |
| `UnshieldCompleteStep` | "Withdrawal complete — sent X USDC to <recipient> on <chain>". |

## Why two `useTx` hooks?

`useTx({kind})` is generic over kind and produces records typed to that kind. The unshield flow can submit one of two kinds. We mount both hooks unconditionally (Rules of Hooks) and pick at submit time via local state (`submittedKind`). The unused hook stays idle — no record, no executor dispatch.

Once a kind is submitted, the record subscription is locked to that hook for the rest of the flow.

## Recipient defaulting

The recipient field pre-fills with the connected EVM address (`evmAddressAtom`) the first time the modal opens, so "withdraw to my own wallet" requires zero typing. The user can change it for any other EVM destination.

## What's wired now

- The `unshield-local` handler (`features/unshield/handler.ts`) is registered. Submit walks `build-proof` (20-30s ZK proof gen on local Anvil) → `submit-relayer` (populated tx submitted via the user's wallet) → `hub-confirmed` (receipt + balance refresh).
- Direct user submission with `sendWithPublicWallet=true`; no relayer fee path. The submit-relayer stage prompts MetaMask once for the transact tx.

## Still stubbed

- The `unshield-xchain` handler — different shape (hub burn + Iris attestation poll + client mint). Will land alongside the CCTP relayer work.
- `useFees()` returns null; FeeSummary renders "Loading…". The local handler has no fee surface; xchain will when the relayer fee schedule wires up.
