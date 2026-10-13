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
        <p className="sub">Pas de mot de passe : un lien ou un code arrive dans ta boîte mail.</p>
        {sp.err && <div className="notice">Ce lien a expiré ou a déjà servi. Demande-en un nouveau.</div>}
        <LoginForm next={next} google={process.env.NEXT_PUBLIC_GOOGLE_ENABLED === '1'} />
      </div>
    </main>
  )
}
