// ABOUTME: The one runtime door to @armada/sdk — a memoized dynamic import, so the SDK (~8 MB with its inlined WASM) loads in
// ABOUTME: its own chunk when first needed instead of with the first screen; prefetchSdk() starts it early, whenSdkLoaded() waits.

/** The SDK module's runtime surface. Type-only imports (`import type … from '@armada/sdk'`) don't load it. */
export type ArmadaSdkModule = typeof import('@armada/sdk')

let loading: Promise<ArmadaSdkModule> | null = null

let markLoaded: () => void = () => {}
const loaded = new Promise<void>((resolve) => {
  markLoaded = resolve
})

/**
 * Load the SDK (once). Every runtime use goes through this — a static `import { … } from '@armada/sdk'` anywhere in the
 * app's graph would pull it back into the entry chunk (`src/test/sdk-imports.test.ts` guards it). A failed load (e.g.
 * a dropped connection fetching the chunk) is forgotten, so the next call retries.
 */
export function loadSdk(): Promise<ArmadaSdkModule> {
  loading ??= import('@armada/sdk').then(
    (armada) => {
      markLoaded()
      return armada
    },
    (err: unknown) => {
      loading = null
      throw err
    },
  )
  return loading
}

/**
 * Start loading the SDK without waiting for it — called once the first screen is up, so it's usually ready by the time
 * the user signs in. Failures are ignored here; the next `loadSdk()` retries and reports.
 */
export function prefetchSdk(): void {
  loadSdk().catch(() => {})
}

/**
 * Resolves once the SDK has loaded, without starting the load. Lets a big background download (the circuit preload)
 * queue behind the SDK instead of sharing a slow connection with it: on a 9 Mbps phone the two together held sign-in
 * back ~24s. Stays pending through a failed load until a retry succeeds.
 */
export function whenSdkLoaded(): Promise<void> {
  return loaded
}
