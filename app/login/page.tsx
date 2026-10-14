import Link from 'next/link'
import { LoginForm } from '@/components/LoginForm'
import { ArtBackdrop, Cartel } from '@/components/Artwork'

export const metadata = { title: 'Connexion' }

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string; err?: string }> }) {
  const sp = await searchParams
  const next = sp.next?.startsWith('/') && !sp.next.startsWith('//') ? sp.next : '/a-faire'
  return (
    <main className="split">
      <div className="split-art">
        <ArtBackdrop k="lettre" width={1280} position="40% 40%" />
        <Cartel k="lettre" />
      </div>
      <div className="split-form">
        <div className="auth">
          <Link href="/" className="brand">Le Cercle</Link>
          <h1 style={{ marginTop: 32 }}>Entrer dans le cercle</h1>
          <p className="sub">Avec ton e-mail et un mot de passe.</p>
          {sp.err && <div className="notice">Connexion interrompue. Réessaie.</div>}
          <LoginForm next={next} google={process.env.NEXT_PUBLIC_GOOGLE_ENABLED === '1'} />
        </div>
      </div>
    </main>
  )
}
