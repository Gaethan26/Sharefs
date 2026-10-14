import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Tu verras…', short_name: 'Tu verras',
    description: 'Une œuvre par mois, confiée à ceux qu’on aime.',
    start_url: '/a-faire', display: 'standalone', lang: 'fr',
    background_color: '#0E1532', theme_color: '#0E1532',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  }
}
