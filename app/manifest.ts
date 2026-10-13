import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Le Cercle', short_name: 'Le Cercle',
    description: 'Une référence par mois à tes amis, un mois pour la vivre.',
    start_url: '/a-faire', display: 'standalone', lang: 'fr',
    background_color: '#EEF0F5', theme_color: '#18213D',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  }
}
