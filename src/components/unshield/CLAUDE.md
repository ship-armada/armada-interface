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

- `unshield-local` (`features/unshield/handler.ts`): `build-proof` (20-30s ZK gen) → `submit-relayer` (user-signed transact) → `hub-confirmed` (receipt + balance refresh).
- `unshield-xchain` (`features/unshield-xchain/handler.ts`): `build-proof` → `submit-relayer` (user-signed `atomicCrossChainUnshield`) → `hub-burn-confirmed` (capture destination starting balance) → `iris-attestation-pending` (poll destination chain for the recipient's USDC balance to tick up; the local CCTP relay or Iris does the actual delivery) → final stages advanced through on detection.
- Direct user submission throughout; no relayer-mediated submit path yet. SendModal's External-tab xchain branch also routes to this same handler.

## Still stubbed

- The xchain handler collapses the last three stages (iris-attestation-ready / client-mint-pending / client-mint-confirmed) on a single destination-event detection. Finer-grained Iris polling is a real-CCTP-mode polish pass.
