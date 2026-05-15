// ABOUTME: Railgun proof generation entry points — wrappers around @railgun-community/wallet's prover service.
// ABOUTME: Stub: signatures only. Heavy WASM artifacts are lazy-loaded; consumers must await initProver() before first use.

export async function initProver(): Promise<void> {
  throw new Error('railgun.prover.initProver: not implemented (scaffold).')
}

export async function generateShieldProof(_args: unknown): Promise<{ proof: `0x${string}`; publicInputs: unknown }> {
  throw new Error('railgun.prover.generateShieldProof: not implemented (scaffold).')
}

export async function generateUnshieldProof(_args: unknown): Promise<{ proof: `0x${string}`; publicInputs: unknown }> {
  throw new Error('railgun.prover.generateUnshieldProof: not implemented (scaffold).')
}

export async function generateTransferProof(_args: unknown): Promise<{ proof: `0x${string}`; publicInputs: unknown }> {
  throw new Error('railgun.prover.generateTransferProof: not implemented (scaffold).')
}
