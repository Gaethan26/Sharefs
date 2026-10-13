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
    { media: '(prefers-color-scheme: light)', color: '#EEF0F5' },
    { media: '(prefers-color-scheme: dark)', color: '#10152A' },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,800&family=Literata:ital,opsz,wght@0,7..72,500;0,7..72,700;1,7..72,500&display=swap" />
      </head>
      <body>{children}</body>
    </html>
  )
}
