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
  createWallet,
  enrollFromSignature,
  exportMnemonic,
  lockWallet,
  resetWallet,
  unlockFromBackup,
  unlockFromRootSecret,
  unlockWallet,
  type ShieldedWalletState,
} from '@/lib/railgun/wallet'
import { getRootSecret as kmGetRootSecret } from '@/lib/railgun/keyManager'
import {
  buildEnrollmentTypedData,
  normalizeSignature,
} from '@/lib/crypto/eip712'
import {
  encryptRootSecret,
  parseBackupBlob,
  type BackupBlob,
} from '@/lib/crypto/kdf'
import { track, trackError } from '@/lib/telemetry'

/**
 * Hook surface: typed lifecycle actions that wrap `lib/railgun/wallet`. Side effects per call:
 * 1. Calls the lib function (which writes the keyManager singleton)
 * 2. Mirrors the resulting `ShieldedWalletState` into `shieldedWalletsAtom` + `activeRailgunWalletIdAtom`
 * 3. Emits a `track(...)` event on success, `trackError(...)` on failure
 *
 * Legacy methods (`create`/`unlock`/`exportPhrase`) are retained as deprecated delegates so the
 * v1 OnboardingFlow / UnlockFlow / MnemonicExportDialog keep compiling until their dedicated
 * rewrites land in subsequent Phase 1 commits.
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
   * Export the currently-unlocked wallet's root_secret as an encrypted backup blob. The caller is
   * expected to JSON.stringify + download the result. Throws if no wallet is unlocked.
   */
  const exportBackup = useCallback(async (passphrase: string): Promise<BackupBlob> => {
    try {
      const rootSecret = kmGetRootSecret() // throws when locked
      const blob = encryptRootSecret(rootSecret, passphrase)
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

  /**
   * @deprecated Pre-signature-flow shim. OnboardingFlow rewrite (Phase 1 commit 6) replaces this
   * with `enroll()`. Delegates to the lib stub which throws.
   */
  const create = useCallback(async (mnemonic: string, passphrase: string) => {
    try {
      const out = await createWallet(mnemonic, passphrase)
      setWallets(prev => ({
        ...prev,
        [out.id]: {
          id: out.id,
          status: 'unlocked',
          railgunAddress: out.railgunAddress,
          unlockedAt: Date.now(),
        },
      }))
      setActiveId(out.id)
      track('shielded.created', { walletId: out.id })
      return out
    } catch (err) {
      trackError('useShieldedWallet.create', err, { scope: 'shielded.create', message: 'create failed' })
      throw err
    }
  }, [setWallets, setActiveId])

  /**
   * @deprecated Pre-signature-flow shim. UnlockFlow rewrite (Phase 1 commit 5) replaces this
   * with `unlockByPaste` + `unlockByBackup`. Delegates to the lib stub which throws.
   */
  const unlock = useCallback(async (id: string, passphrase: string) => {
    try {
      const next = await unlockWallet(id, passphrase)
      setWallets(prev => ({ ...prev, [id]: next }))
      setActiveId(id)
      track('shielded.unlock', { walletId: id })
    } catch (err) {
      trackError('useShieldedWallet.unlock', err, { scope: 'shielded.unlock', message: 'unlock failed' })
      throw err
    }
  }, [setWallets, setActiveId])

  /**
   * @deprecated The Phase 1 surface has no displayable mnemonic — root_secret is the canonical
   * recovery value, exported as an encrypted backup blob via `exportBackup`. Delegates to the lib
   * stub which throws. Settings dialog rewrite (Phase 1 commit 7) drops this.
   */
  const exportPhrase = useCallback(async (passphrase: string) => {
    if (!activeId) throw new Error('No active wallet to export.')
    try {
      const phrase = await exportMnemonic(activeId, passphrase)
      track('shielded.exported', { walletId: activeId })
      return phrase
    } catch (err) {
      trackError('useShieldedWallet.exportPhrase', err, { scope: 'shielded.export', message: 'export failed' })
      throw err
    }
  }, [activeId])

  return {
    state: active,
    enroll,
    unlockByPaste,
    unlockByBackup,
    exportBackup,
    lock,
    reset,
    // Deprecated — retained until consumer rewrites land in commits 5-7.
    create,
    unlock,
    exportPhrase,
  }
}
