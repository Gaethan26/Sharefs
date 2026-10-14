import './globals.css'
import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: { default: 'Le Cercle', template: '%s · Le Cercle' },
  description: 'Une référence par mois à tes amis. Un mois pour la vivre. Les avis restent scellés tant que tu n’as pas fini.',
  appleWebApp: { capable: true, title: 'Le Cercle', statusBarStyle: 'default' },
}

export const viewport: Viewport = {
  width: 'device-width', initialScale: 1, viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#E6E3DC' },
    { media: '(prefers-color-scheme: dark)', color: '#16110D' },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500;1,600&family=Instrument+Sans:wght@400;500;600&display=swap" />
      </head>
      <body>{children}</body>
    </html>
  )
}
