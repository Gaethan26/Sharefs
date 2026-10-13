import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="wrap narrow">
      <div className="empty"><h1>Introuvable</h1><p>Cette page n’existe pas, ou tu n’y as pas accès.</p><Link className="btn" href="/a-faire">Retour à mes défis</Link></div>
    </main>
  )
}
