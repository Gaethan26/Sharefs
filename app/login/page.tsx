import Link from 'next/link'
import { LoginForm } from '@/components/LoginForm'
import { ArtBackdrop, Cartel } from '@/components/Artwork'
import { ART_PALETTES, paletteVars } from '@/lib/palettes'

export const metadata = { title: 'Connexion' }

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string; err?: string }> }) {
  const sp = await searchParams
  const next = sp.next?.startsWith('/') && !sp.next.startsWith('//') ? sp.next : '/a-faire'
  return (
    <main className="split" style={paletteVars(ART_PALETTES.lettre)}>
      <div className="split-art">
        <ArtBackdrop k="lettre" width={1280} position="40% 40%" />
        <Cartel k="lettre" />
      </div>
      <div className="split-form">
        <div className="auth">
          <Link href="/" className="brand"><span className="logo">Sharefs</span><span className="tagline">Tu verras…</span></Link>
          <h1 style={{ marginTop: 32 }}>Bienvenue</h1>
          <p className="sub">Avec ton e-mail et un mot de passe.</p>
          {sp.err && <div className="notice">Connexion interrompue. Réessaie.</div>}
          <LoginForm next={next} google={process.env.NEXT_PUBLIC_GOOGLE_ENABLED === '1'} />
        </div>
      </div>
    </main>
  )
}
