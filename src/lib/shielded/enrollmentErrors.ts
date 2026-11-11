// ABOUTME: User-facing error copy for a failed sign-in (shown on the dashboard's sign-in card via hooks/useSignIn).
// ABOUTME: Maps a declined signature, missing deployment manifests, a circuit-download failure and an unreachable relayer to actionable text.

import { isUserRejection } from '@/lib/errors'

const DEPLOYMENT_SETUP_MSG =
  'Deployment manifests are missing. From the armada-poc repo root run `npm run setup` (local Anvil) ' +
  'or set `VITE_NETWORK=sepolia` in .env.development and restart the dev server.'

const ARTIFACT_DOWNLOAD_MSG =
  'Could not load the ZK circuit files this app needs to prove your transaction. They are served from ' +
  'the configured artifact host and integrity-checked before use, so this usually means the host is ' +
  'unreachable or a file failed its checksum. Reload the page, then sign in again.'

const RELAYER_MSG =
  'The fee relayer is not reachable. Start it from armada-poc (`npm run relayer` or your team\'s relayer script) ' +
  'or set `VITE_RELAYER_URL` to a running instance.'

/**
 * Turn low-level failures (JSON.parse SyntaxError, fetch 404 manifests, connection refused)
 * into actionable copy for the sign-in card. (Backup-restore errors go through
 * `lib/crypto/kdf.ts::normalizeBackupUnlockError` instead.)
 */
export function normalizeEnrollmentError(err: unknown): Error {
  if (!(err instanceof Error)) {
    return new Error('Enrollment failed. Check the browser console for details.')
  }

  // Declined the wallet signature prompt — the most-hit error on the onboarding/unlock path.
  // First-ever sign-in double-signs, so make the "both signatures" expectation explicit. (P1-17)
  if (isUserRejection(err)) {
    return new Error('Signature request declined. Both signatures are needed to set up sign-in — try again.')
  }

  const msg = err.message

  if (err instanceof SyntaxError || /Unexpected token/i.test(msg)) {
    return new Error(ARTIFACT_DOWNLOAD_MSG)
  }

  if (/Deployment manifest not found/i.test(msg) || /privacy-pool-hub/i.test(msg)) {
    return new Error(`${DEPLOYMENT_SETUP_MSG} (${msg})`)
  }

  if (/hub deployment is missing contracts\.privacyPool/i.test(msg)) {
    return new Error(DEPLOYMENT_SETUP_MSG)
  }

  if (
    /no PrivacyPool code at/i.test(msg) ||
    /Run `npm run chains`/i.test(msg)
  ) {
    return new Error(
      `${msg} Start local chains with \`npm run chains\` from armada-poc, then \`npm run setup\`, or use Sepolia mode.`,
    )
  }

  if (/ECONNREFUSED|Failed to fetch|connection refused|ERR_CONNECTION_REFUSED/i.test(msg)) {
    if (/3001|relayer|fees/i.test(msg)) {
      return new Error(RELAYER_MSG)
    }
  }

  return err
}
