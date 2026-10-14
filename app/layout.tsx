import './globals.css'
import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: { default: 'Tu verras…', template: '%s, Tu verras…' },
  description: 'Une référence par mois à tes amis. Un mois pour la vivre. Les avis restent scellés tant que tu n’as pas fini.',
  appleWebApp: { capable: true, title: 'Tu verras…', statusBarStyle: 'default' },
}

export const viewport: Viewport = {
  width: 'device-width', initialScale: 1, viewportFit: 'cover',
  themeColor: '#14110E',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400..600;1,6..72,400..600&family=Figtree:wght@400..700&display=swap" />
      </head>
      <body>{children}</body>
    </html>
  )
}
