// ABOUTME: Tests for socialPreviewMeta — the static link-preview (og: / twitter:) tags: one generic Armada card for every
// ABOUTME: URL (no per-link data), with the image's absolute URL on the build's own domain (testnet / mainnet), relative locally.

import { describe, it, expect } from 'vitest'
import { socialPreviewMeta } from './socialPreview'

const byKey = (network: string | undefined) =>
  Object.fromEntries(socialPreviewMeta(network).map((tag) => [tag.property ?? tag.name, tag.content]))

describe('socialPreviewMeta', () => {
  it('a testnet build points the card at app.testnet.armada.blue', () => {
    const tags = byKey('sepolia')
    expect(tags['og:image']).toBe('https://app.testnet.armada.blue/og-image.png')
    expect(tags['og:url']).toBe('https://app.testnet.armada.blue')
  })

  it('a mainnet build points it at app.armada.blue', () => {
    expect(byKey('mainnet')['og:image']).toBe('https://app.armada.blue/og-image.png')
  })

  it('a local build uses a relative image and no canonical URL', () => {
    const tags = byKey('local')
    expect(tags['og:image']).toBe('/og-image.png')
    expect(tags['og:url']).toBeUndefined()
    expect(byKey(undefined)['og:image']).toBe('/og-image.png')
  })

  it('is one generic card with the tags a preview needs, and nothing that could carry a payment link\'s data', () => {
    // WHY: crawlers fetch /pay-via-link?… too. A card built from the link would leak its amount / address to any chat
    // preview (and could be spoofed), so the tag set is fixed per build: no extra keys, URLs are the bare origin.
    for (const network of ['sepolia', 'mainnet', 'local', undefined]) {
      const tags = socialPreviewMeta(network)
      const keys = tags.map((tag) => tag.property ?? tag.name)
      for (const required of ['og:title', 'og:description', 'og:image', 'og:type', 'twitter:card']) expect(keys).toContain(required)
      expect(new Set(keys)).toEqual(new Set([
        'description', 'og:type', 'og:site_name', 'og:title', 'og:description', 'og:image', 'og:image:width',
        'og:image:height', 'twitter:card', 'twitter:site', ...(network === 'sepolia' || network === 'mainnet' ? ['og:url'] : []),
      ]))
      const url = tags.find((tag) => tag.property === 'og:url')?.content
      if (url) expect(new URL(url).pathname + new URL(url).search).toBe('/')
      for (const { content } of tags) expect(content).not.toMatch(/pay-via-link|0zk|\?|USDC \d/i)
    }
  })
})
