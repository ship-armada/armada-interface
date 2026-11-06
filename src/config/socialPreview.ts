// ABOUTME: socialPreviewMeta — the static link-preview tags (og: / twitter:) vite.config injects into index.html: one
// ABOUTME: generic Armada card for every URL, never per-link data (a payment link's preview would leak it, and could be spoofed).

/**
 * Where each network's build is served — link previews need the card image as an absolute URL. Keyed by `VITE_NETWORK`;
 * `mainnet` is listed ahead of that mode existing in `config/network.ts`. A mode not listed (local) gets a relative image.
 */
const PUBLIC_APP_ORIGINS: Record<string, string> = {
  sepolia: 'https://app.testnet.armada.blue',
  mainnet: 'https://app.armada.blue',
}

/** The card image, in `public/` (1200×630, from armada-wtf). */
const CARD_IMAGE_PATH = '/og-image.png'

const DESCRIPTION = 'Private USDC payments'

/** One `<meta>` tag: `property` for Open Graph, `name` for the rest. */
export interface MetaTag {
  property?: string
  name?: string
  content: string
}

/**
 * The preview tags for a build of `network`. Crawlers don't run the app's JS, so every route — including
 * `/pay-via-link` — shows this same card.
 */
export function socialPreviewMeta(network: string | undefined): MetaTag[] {
  const origin = network !== undefined ? PUBLIC_APP_ORIGINS[network] : undefined
  return [
    { name: 'description', content: DESCRIPTION },
    { property: 'og:type', content: 'website' },
    { property: 'og:site_name', content: 'Armada' },
    { property: 'og:title', content: 'Armada' },
    { property: 'og:description', content: DESCRIPTION },
    { property: 'og:image', content: `${origin ?? ''}${CARD_IMAGE_PATH}` },
    { property: 'og:image:width', content: '1200' },
    { property: 'og:image:height', content: '630' },
    ...(origin ? [{ property: 'og:url', content: origin }] : []),
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:site', content: '@ship_armada' },
  ]
}
