// ABOUTME: Wires snarkjs.groth16 into the Railgun engine's prover so transact/unshield can build Groth16 proofs in-browser.
// ABOUTME: Engine init calls this after startRailgunEngine; idempotent + race-safe. Shielding doesn't need this (ECIES + Poseidon only).

let initialized = false
let inFlight: Promise<void> | null = null

/**
 * Install snarkjs as the Groth16 implementation on the Railgun engine's `Prover`. Without this,
 * any call to `generateUnshieldProof` / `generateTransferProof` throws
 * "Requires groth16 full prover implementation".
 *
 * Dynamic-imports both `@railgun-community/wallet` (jsdom-crash dep) and `snarkjs` (large; we
 * don't want it in the critical path for shield-only flows). Idempotent — subsequent calls
 * share the in-flight promise; once resolved, the call returns immediately.
 */
export async function initializeProver(): Promise<void> {
  if (initialized) return
  if (inFlight) return inFlight
  inFlight = doInit()
  try {
    await inFlight
    initialized = true
  } finally {
    inFlight = null
  }
}

async function doInit(): Promise<void> {
  const [{ getProver }, snarkjs] = await Promise.all([
    import('@railgun-community/wallet'),
    import('snarkjs'),
  ])
  const prover = getProver()
  // The SDK's `Prover.setSnarkJSGroth16` accepts the snarkjs groth16 namespace as an opaque
  // implementation. Cast through unknown because the SDK's type doesn't expose its internal
  // shape; runtime contract is "fullProve + verify".
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prover.setSnarkJSGroth16((snarkjs as any).groth16)
}

export function isProverInitialized(): boolean {
  return initialized
}

/** Reset state — for tests + hot-reload. */
export function resetProverState(): void {
  initialized = false
  inFlight = null
}
