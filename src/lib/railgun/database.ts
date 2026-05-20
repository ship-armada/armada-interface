// ABOUTME: level-js (IndexedDB-backed) database wrapper consumed by the Railgun engine on startup.
// ABOUTME: Ported byte-equivalent from usdc-v2-frontend/src/lib/railgun/database.ts.

// @ts-expect-error - level-js doesn't ship types
import LevelDB from 'level-js'

/**
 * Creates an IndexedDB-backed LevelDB instance at the given location path. The Railgun engine
 * uses this as its persistent key-value store (wallets, merkle trees, scan progress).
 */
export function createWebDatabase(dbLocationPath: string): unknown {
  return new LevelDB(dbLocationPath)
}
