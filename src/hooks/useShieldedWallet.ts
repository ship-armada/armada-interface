// ABOUTME: Railgun wallet hook — signature-derived enrollment + paste/backup unlock + lock/reset/exportBackup.
// ABOUTME: Plural-wallet schema (state/wallet.ts) is future-proofing; v1 UX is singular and the hook hides that.

import { useAtomValue, useSetAtom } from 'jotai'
import { useCallback } from 'react'
import { signTypedData } from 'wagmi/actions'
import {
  activeRailgunWalletIdAtom,
  activeShieldedWalletAtom,
  evmAddressAtom,
  shieldedWalletsAtom,
} from '@/state/wallet'
import { wagmiConfig } from '@/config/wagmi'
import {
  enrollFromSignature,
  lockWallet,
  resetWallet,
  unlockFromBackup,
  unlockFromRootSecret,
  type ShieldedWalletState,
} from '@/lib/railgun/wallet'
import {
  getCreationBlock as kmGetCreationBlock,
  getRootSecret as kmGetRootSecret,
} from '@/lib/railgun/keyManager'
import {
  buildEnrollmentTypedData,
  normalizeSignature,
} from '@/lib/crypto/eip712'
import {
  encryptBackup,
  parseBackupBlob,
  type BackupBlob,
} from '@/lib/crypto/kdf'
import { track, trackError } from '@/lib/telemetry'

/**
 * Hook surface: typed lifecycle actions that wrap `lib/railgun/wallet`. Side effects per call:
 * 1. Calls the lib function (which writes the keyManager singleton)
 * 2. Mirrors the resulting `ShieldedWalletState` into `shieldedWalletsAtom` + `activeRailgunWalletIdAtom`
 * 3. Emits a `track(...)` event on success, `trackError(...)` on failure
 */
export function useShieldedWallet() {
  const active = useAtomValue(activeShieldedWalletAtom)
  const activeId = useAtomValue(activeRailgunWalletIdAtom)
  const evmAddress = useAtomValue(evmAddressAtom)
  const setWallets = useSetAtom(shieldedWalletsAtom)
  const setActiveId = useSetAtom(activeRailgunWalletIdAtom)

  /**
   * Drive the full enrollment flow: build typed data → sign via wagmi → normalize → derive
   * root_secret → create SDK wallet. The signing prompt is what users see in MetaMask / Rabbit
   * etc; if they reject, the wagmi async call rejects and we propagate. Returns the rootSecret
   * to the caller so the onboarding flow can show it during the backup ceremony.
   *
   * NOTE: The returned rootSecret is the SAME Uint8Array reference held by the keyManager — see
   * the warning in `enrollFromSignature`. UI code that displays the secret should NOT mutate or
   * `fill(0)` the buffer; let the keyManager own its lifetime.
   */
  const enroll = useCallback(async (): Promise<{
    rootSecret: Uint8Array
    state: ShieldedWalletState
  }> => {
    if (!evmAddress) {
      throw new Error('Connect an EVM wallet before enrolling.')
    }
    try {
      const typedData = buildEnrollmentTypedData(Date.now())
      const sigHex = await signTypedData(wagmiConfig, {
        domain: { ...typedData.domain },
        types: {
          Enrollment: typedData.types.Enrollment.map(f => ({ ...f })),
        },
        primaryType: typedData.primaryType,
        message: { ...typedData.message },
      })
      const signatureBytes = normalizeSignature(sigHex)
      const out = await enrollFromSignature(signatureBytes)
      setWallets(prev => ({ ...prev, [out.state.id]: out.state }))
      setActiveId(out.state.id)
      // `shielded.created` is emitted by `enrollFromSignature` itself; don't double-track here.
      return out
    } catch (err) {
      trackError('useShieldedWallet.enroll', err, { scope: 'shielded.enroll', message: 'enroll failed' })
      throw err
    }
  }, [evmAddress, setWallets, setActiveId])

  /**
   * Unlock from a pasted hex-encoded root_secret. Strips an optional `0x` prefix. The 64-hex-char
   * input → 32 bytes → `unlockFromRootSecret`. Hex parsing errors propagate.
   */
  const unlockByPaste = useCallback(async (rootSecretHex: string): Promise<void> => {
    const trimmed = rootSecretHex.trim().replace(/^0x/i, '')
    if (!/^[0-9a-fA-F]{64}$/.test(trimmed)) {
      throw new Error('Recovery secret must be 64 hexadecimal characters (32 bytes).')
    }
    const bytes = new Uint8Array(32)
    for (let i = 0; i < 32; i++) {
      bytes[i] = parseInt(trimmed.slice(i * 2, i * 2 + 2), 16)
    }
    try {
      const next = await unlockFromRootSecret(bytes)
      setWallets(prev => ({ ...prev, [next.id]: next }))
      setActiveId(next.id)
    } catch (err) {
      trackError('useShieldedWallet.unlockByPaste', err, { scope: 'shielded.unlock', message: 'paste unlock failed' })
      throw err
    } finally {
      // The bytes are still referenced by the keyManager via unlockFromRootSecret; zeroizing our
      // local copy is safe and removes the duplicate from heap.
      bytes.fill(0)
    }
  }, [setWallets, setActiveId])

  /**
   * Unlock from a downloaded backup file + the user's passphrase. Reads the file as text, parses
   * + validates the JSON shape via `parseBackupBlob`, then runs the standard decrypt + unlock.
   */
  const unlockByBackup = useCallback(async (file: File, passphrase: string): Promise<void> => {
    try {
      const text = await file.text()
      let parsed: unknown
      try {
        parsed = JSON.parse(text)
      } catch {
        throw new Error('Backup file is not valid JSON.')
      }
      const blob: BackupBlob = parseBackupBlob(parsed)
      const next = await unlockFromBackup(blob, passphrase)
      setWallets(prev => ({ ...prev, [next.id]: next }))
      setActiveId(next.id)
    } catch (err) {
      trackError('useShieldedWallet.unlockByBackup', err, { scope: 'shielded.unlock', message: 'backup unlock failed' })
      throw err
    }
  }, [setWallets, setActiveId])

  /**
   * Export the currently-unlocked wallet's root_secret + creationBlock as an encrypted v2
   * backup blob. The caller is expected to JSON.stringify + download the result. Throws if no
   * wallet is unlocked.
   *
   * `creationBlock` is read from the keyManager session — it was set at enrollment (true value)
   * or carried in from a prior v2 backup unlock. If the session has no creationBlock (paste-
   * secret unlock path), we write `0` into the blob — restores of that blob will fall back to a
   * full chain rescan rather than truncate the SDK's commitment scan to a stale block. Once the
   * paste-restored wallet has finished its full scan, re-exporting a backup remains useful for
   * passphrase rotation; the next restore from THAT blob is still slow until the user enrolls
   * fresh on a deterministic-signing wallet path.
   */
  const exportBackup = useCallback(async (passphrase: string): Promise<BackupBlob> => {
    try {
      const rootSecret = kmGetRootSecret() // throws when locked
      const creationBlock = kmGetCreationBlock() ?? 0
      const blob = encryptBackup({ rootSecret, creationBlock }, passphrase)
      if (activeId) track('shielded.exported', { walletId: activeId })
      return blob
    } catch (err) {
      trackError('useShieldedWallet.exportBackup', err, { scope: 'shielded.export', message: 'export failed' })
      throw err
    }
  }, [activeId])

  const lock = useCallback(() => {
    if (!activeId) return
    // Flip the atom synchronously — `lockWallet` clears the in-memory key material before its
    // own internal await, so the wallet is effectively locked the moment we drop the keys. The
    // SDK's `unloadWalletByID` is best-effort cleanup; awaiting it would make `lock()` appear
    // async to callers (e.g. the auto-lock timer) that need a synchronous transition.
    setWallets(prev => {
      const existing = prev[activeId]
      if (!existing) return prev
      return { ...prev, [activeId]: { ...existing, status: 'locked' } }
    })
    lockWallet(activeId).catch(err => {
      trackError('useShieldedWallet.lock', err, { scope: 'shielded.lock', message: 'lock failed' })
    })
  }, [activeId, setWallets])

  const reset = useCallback(async () => {
    if (!activeId) return
    try {
      await resetWallet(activeId)
      setWallets(prev => {
        const next = { ...prev }
        delete next[activeId]
        return next
      })
      setActiveId(null)
    } catch (err) {
      trackError('useShieldedWallet.reset', err, { scope: 'shielded.reset', message: 'reset failed' })
      throw err
    }
  }, [activeId, setWallets, setActiveId])

  return {
    state: active,
    enroll,
    unlockByPaste,
    unlockByBackup,
    exportBackup,
    lock,
    reset,
  }
}
