import Link from 'next/link'
import { LoginForm } from '@/components/LoginForm'

export const metadata = { title: 'Connexion' }

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string; err?: string }> }) {
  const sp = await searchParams
  const next = sp.next?.startsWith('/') && !sp.next.startsWith('//') ? sp.next : '/a-faire'
  return (
    <main className="wrap">
      <div className="auth">
        <Link href="/" className="brand">Le Cercle</Link>
        <h1 style={{ marginTop: 24 }}>Connexion</h1>
        <p className="sub">Avec ton e-mail et un mot de passe. Aucun e-mail de vérification.</p>
        {sp.err && <div className="notice">Connexion interrompue. Réessaie.</div>}
        <LoginForm next={next} google={process.env.NEXT_PUBLIC_GOOGLE_ENABLED === '1'} />
      </div>
    </main>
  )
}