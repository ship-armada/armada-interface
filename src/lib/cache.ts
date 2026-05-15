// ABOUTME: IndexedDB cache helpers — tx history, fee quotes, ENS resolutions, balance snapshots.
// ABOUTME: Stub now (typed signatures only); implementation lands when first consumer needs it.

const DB_NAME = 'armada-interface'
const DB_VERSION = 1

export type StoreName = 'txHistory' | 'feeQuotes' | 'ens' | 'shieldedBalances' | 'meta'

const STORES: ReadonlyArray<StoreName> = ['txHistory', 'feeQuotes', 'ens', 'shieldedBalances', 'meta']

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name)
        }
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

export async function cacheGet<T>(store: StoreName, key: string): Promise<T | undefined> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly')
    const req = tx.objectStore(store).get(key)
    req.onsuccess = () => resolve(req.result as T | undefined)
    req.onerror = () => reject(req.error)
  })
}

export async function cachePut<T>(store: StoreName, key: string, value: T): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite')
    tx.objectStore(store).put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function cacheDelete(store: StoreName, key: string): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite')
    tx.objectStore(store).delete(key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/** Scan an entire store. Useful for hydration on app start (e.g. resume pending txs). */
export async function cacheAll<T>(store: StoreName): Promise<Array<{ key: string; value: T }>> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly')
    const out: Array<{ key: string; value: T }> = []
    const req = tx.objectStore(store).openCursor()
    req.onsuccess = () => {
      const cursor = req.result
      if (cursor) {
        out.push({ key: String(cursor.key), value: cursor.value as T })
        cursor.continue()
      } else {
        resolve(out)
      }
    }
    req.onerror = () => reject(req.error)
  })
}

/** Drop a single store's entries — used by Settings → Reset wallet, Reset history. */
export async function cacheClear(store: StoreName): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite')
    tx.objectStore(store).clear()
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}
