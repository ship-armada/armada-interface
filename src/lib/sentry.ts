// ABOUTME: Sentry init + capture for @armada/interface — error-only, DSN-gated (no-op without VITE_SENTRY_DSN).
// ABOUTME: A beforeSend scrubber redacts 0zk addresses + long hex so shielded data can't leak to the sink (privacy app).

import * as Sentry from '@sentry/react'
import { cleanEnv } from '@/config/network'

let initialized = false

/**
 * Redact shielded/account identifiers from a string before it leaves the device. Mirrors the
 * leak vectors `lib/telemetry.ts` already guards against by truncating, but applies to the full
 * exception payload Sentry transmits.
 */
export function scrubString(input: string): string {
  return input
    // shielded (0zk) addresses (0zk + bech32-ish payload).
    .replace(/0zk[0-9a-zA-Z]{8,}/g, '0zk[redacted]')
    // EVM addresses (40 hex), tx hashes (64 hex), calldata / key material (any long hex run).
    .replace(/0x[0-9a-fA-F]{40,}/g, '0x[redacted]')
}

/** Deep enough for console-breadcrumb arguments ({ …message } inside an array) and captureError's context. */
const MAX_SCRUB_DEPTH = 6

/**
 * Scrub every string in a value, recursing into arrays and plain objects (in place for objects, so Sentry's own
 * references stay valid). Sentry's console breadcrumbs carry the raw log arguments, and telemetry logs objects, so a
 * top-level-strings-only pass let an address inside a logged error message through. Past MAX_SCRUB_DEPTH a nested value
 * is replaced rather than sent unscrubbed.
 */
function scrubDeep(v: unknown, depth = 0): unknown {
  if (typeof v === 'string') return scrubString(v)
  if (v === null || typeof v !== 'object') return v
  if (depth >= MAX_SCRUB_DEPTH) return '[redacted: too deep]'
  if (Array.isArray(v)) return v.map((item) => scrubDeep(item, depth + 1))
  const record = v as Record<string, unknown>
  for (const k of Object.keys(record)) record[k] = scrubDeep(record[k], depth + 1)
  return record
}

/**
 * Sentry `beforeSend` hook. A thrown error's message, stack values, breadcrumbs (including console breadcrumbs' raw
 * log arguments), and the attached context / extra can carry 0zk addresses, EVM addresses, tx hashes, or calldata.
 * We scrub everywhere those realistically ride along before the event is transmitted. `sendDefaultPii: false` already strips IP/cookies; this
 * covers the application payload.
 */
export function scrubEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  if (event.message) event.message = scrubString(event.message)
  for (const ex of event.exception?.values ?? []) {
    if (ex.value) ex.value = scrubString(ex.value)
  }
  for (const bc of event.breadcrumbs ?? []) {
    if (bc.message) bc.message = scrubString(bc.message)
    if (bc.data) scrubDeep(bc.data)
  }
  if (event.contexts) scrubDeep(event.contexts)
  if (event.extra) scrubDeep(event.extra)
  if (event.request?.url) event.request.url = scrubString(event.request.url)
  return event
}

/**
 * Initialise Sentry. No-op unless `VITE_SENTRY_DSN` is set, so local/dev and any build without the
 * env var incur zero overhead and never transmit. Errors only — no performance traces / replay.
 * Call once, before render, from `main.tsx`.
 */
export function initSentry(): void {
  if (initialized) return
  const dsn = cleanEnv(import.meta.env.VITE_SENTRY_DSN as string | undefined)
  if (!dsn) return
  Sentry.init({
    dsn,
    environment:
      cleanEnv(import.meta.env.VITE_SENTRY_ENVIRONMENT as string | undefined) ??
      import.meta.env.MODE ??
      'production',
    release: cleanEnv(import.meta.env.VITE_SENTRY_RELEASE as string | undefined),
    // Error tracking only — performance/replay incur per-event cost we don't need.
    tracesSampleRate: 0,
    // Privacy app: never attach IP/cookies. The beforeSend scrubber handles the rest.
    sendDefaultPii: false,
    beforeSend: scrubEvent,
  })
  initialized = true
}

/**
 * Whether Sentry is live (init ran with a DSN). Lets bootstrap emit an observable
 * "Sentry initialized: yes/no" telemetry line so a DSN-less build is visible on the live site.
 */
export function sentryEnabled(): boolean {
  return initialized
}

/**
 * Capture a caught error. No-op until `initSentry` ran with a DSN. `scope` becomes a Sentry tag;
 * `context` (primitive props) attaches as structured context. The error object is passed through
 * unmodified — redaction happens centrally in `beforeSend`.
 */
export function captureError(
  err: unknown,
  opts?: { scope?: string; context?: Record<string, unknown> },
): void {
  if (!initialized) return
  Sentry.withScope((scope) => {
    if (opts?.scope) scope.setTag('scope', opts.scope)
    if (opts?.context) scope.setContext('detail', opts.context)
    Sentry.captureException(err)
  })
}

/** Test-only — reset the module-scope init flag so each test starts clean. */
export function _resetSentryForTests(): void {
  initialized = false
}
