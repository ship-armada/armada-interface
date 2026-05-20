// ABOUTME: IndexedDB-backed ArtifactStore for the Railgun SDK — caches ZK circuit artifacts (zkey/wasm/vkey) across reloads.
// ABOUTME: Ported from usdc-v2-frontend/src/lib/railgun/artifacts.ts; same DB name + store name so users with the legacy app's cache see it preserved.

// The SDK's ArtifactStore class lives in @railgun-community/wallet — which transitively pulls
// circomlibjs and crashes at module-load under jsdom. We dynamic-import it so vitest can load
// callers (init.ts, wallet.ts) without instantiating the engine surface. One import per session.
type RailgunSdk = typeof import('@railgun-community/wallet')

const ARTIFACT_DB_NAME = 'railgun-artifacts'
const ARTIFACT_STORE_NAME = 'artifacts'

function openArtifactDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(ARTIFACT_DB_NAME, 1)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(ARTIFACT_STORE_NAME)) {
        db.createObjectStore(ARTIFACT_STORE_NAME)
      }
    }
  })
}

async function getArtifact(path: string): Promise<string | Buffer | null> {
  try {
    const db = await openArtifactDB()
    return await new Promise<string | Buffer | null>((resolve, reject) => {
      const tx = db.transaction(ARTIFACT_STORE_NAME, 'readonly')
      const store = tx.objectStore(ARTIFACT_STORE_NAME)
      const request = store.get(path)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve((request.result as string | Buffer | undefined) ?? null)
    })
  } catch {
    return null
  }
}

async function storeArtifact(_dir: string, path: string, item: string | Uint8Array): Promise<void> {
  const db = await openArtifactDB()
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(ARTIFACT_STORE_NAME, 'readwrite')
    const store = tx.objectStore(ARTIFACT_STORE_NAME)
    const request = store.put(item, path)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve()
  })
}

async function artifactExists(path: string): Promise<boolean> {
  try {
    return (await getArtifact(path)) !== null
  } catch {
    return false
  }
}

/**
 * Build the ArtifactStore the SDK consumes when it needs a circuit artifact. The store is a
 * read-through cache: when the SDK asks for an artifact isn't there, it falls back to the
 * built-in IPFS loader, then writes the result here for next time.
 *
 * Async because the SDK's `ArtifactStore` constructor is behind a dynamic import (jsdom crash
 * mitigation). Callers must `await` this.
 */
export async function createBrowserArtifactStore(): Promise<InstanceType<RailgunSdk['ArtifactStore']>> {
  const { ArtifactStore } = await import('@railgun-community/wallet')
  return new ArtifactStore(getArtifact, storeArtifact, artifactExists)
}

/**
 * Clear all cached artifacts. Used when switching between artifact sources (e.g. preloaded test
 * artifacts vs IPFS). Safe to call from anywhere; idempotent on an empty / non-existent DB.
 */
export async function clearArtifactCache(): Promise<void> {
  try {
    const db = await openArtifactDB()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(ARTIFACT_STORE_NAME, 'readwrite')
      const store = tx.objectStore(ARTIFACT_STORE_NAME)
      const request = store.clear()
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  } catch {
    /* swallow — DB may not exist yet */
  }
}
