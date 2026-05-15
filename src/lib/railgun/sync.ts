// ABOUTME: Triggers Railgun SDK shielded-balance scans and exposes sync status to the UI.
// ABOUTME: Stub: signatures only. Real implementation subscribes to SDK balance events and publishes to the wallet atom.

export interface SyncStatus {
  scanning: boolean
  /** Last block scanned per chain id. */
  cursors: Record<number, number>
}

export async function startSync(): Promise<void> {
  throw new Error('railgun.sync.startSync: not implemented (scaffold).')
}

export async function getSyncStatus(): Promise<SyncStatus> {
  throw new Error('railgun.sync.getSyncStatus: not implemented (scaffold).')
}
