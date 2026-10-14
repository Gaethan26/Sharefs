import './globals.css'
import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: { default: 'Tu verras…', template: '%s, Tu verras…' },
  description: 'Une référence par mois à tes amis. Un mois pour la vivre. Les avis restent scellés tant que tu n’as pas fini.',
  appleWebApp: { capable: true, title: 'Tu verras…', statusBarStyle: 'default' },
}

export const viewport: Viewport = {
  width: 'device-width', initialScale: 1, viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F3E6C4' },
    { media: '(prefers-color-scheme: dark)', color: '#0E1532' },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bodoni+Moda:ital,opsz,wght@0,6..96,400..700;1,6..96,400..700&family=Syne:wght@400..700&family=Caveat:wght@500;600&display=swap" />
      </head>
      <body>{children}</body>
    </html>
  )
}
