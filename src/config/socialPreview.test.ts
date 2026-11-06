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

  it('is one generic card — title, description, large image — with nothing about any payment', () => {
    const tags = byKey('sepolia')
    expect(tags).toMatchObject({
      'og:type': 'website',
      'og:site_name': 'Armada',
      'og:title': 'Armada',
      'og:description': 'Private USDC payments',
      'og:image:width': '1200',
      'og:image:height': '630',
      'twitter:card': 'summary_large_image',
      'twitter:site': '@ship_armada',
      description: 'Private USDC payments',
    })
  })
})
