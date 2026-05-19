// ABOUTME: Railgun proof generation entry points — wrappers around @railgun-community/wallet's prover service.
// ABOUTME: Engine state is mirrored to `railgunEngineAtom` via Jotai's default store so non-React callers can observe.

import { getDefaultStore } from 'jotai'
import { railgunEngineAtom } from '@/state/wallet'
import { trackError } from '../telemetry'

/**
 * Initialise the Railgun proving engine. Heavy: pulls in WASM artifacts.
 * Safe to call multiple times — subsequent calls short-circuit once `ready`.
 *
 * Mirrors progress to `railgunEngineAtom` so the UI can render a "warming up…"
 * indicator and so feature passes can preload opportunistically rather than
 * blocking on first tx.
 */
export async function initProver(): Promise<void> {
  const store = getDefaultStore()
  const current = store.get(railgunEngineAtom)
  if (current.state === 'ready') return
  if (current.state === 'warming') {
    // Caller raced with an in-flight init; nothing to do.
    return
  }

  store.set(railgunEngineAtom, { state: 'warming' })

  try {
    // TODO: dynamic-import @railgun-community/wallet and call its engine init.
    throw new Error('railgun.prover.initProver: not implemented (scaffold).')
    // eslint-disable-next-line no-unreachable
    // store.set(railgunEngineAtom, { state: 'ready' })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    store.set(railgunEngineAtom, { state: 'failed', error: message })
    trackError('railgun.prover.initProver', err)
    throw err
  }
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
