import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Sharefs', short_name: 'Sharefs',
    description: 'Tu verras… Partage avec tes proches les œuvres qui t’ont marqué.',
    start_url: '/a-faire', display: 'standalone', lang: 'fr',
    background_color: '#14110E', theme_color: '#14110E',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  }
}
