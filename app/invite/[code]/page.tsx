import Link from 'next/link'
import { redirect } from 'next/navigation'
import { supabaseServer } from '@/lib/supabase/server'
import { Submit } from '@/components/client'
import { joinInvite } from '@/app/actions'

export const metadata = { title: 'Invitation' }

export default async function Invite({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ err?: string }> }) {
  const { code } = await params
  const { err } = await searchParams
  const supabase = await supabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=${encodeURIComponent('/invite/' + code)}`)
  const { data } = await supabase.rpc('circle_preview', { p_code: code })
  const c = (data as { id: string; name: string; members: number; is_member: boolean }[] | null)?.[0]
  if (c?.is_member) redirect(`/g/${c.id}`)
  return (
    <main className="wrap">
      <div className="auth">
        <Link href="/" className="brand">Tu verras…</Link>
        {c ? (
          <div className="panel" style={{ marginTop: 24 }}>
            <p className="meta" style={{ margin: 0 }}>Tu es invité à rejoindre</p>
            <h1 style={{ margin: '6px 0' }}>{c.name}</h1>
            <p className="meta">{c.members} membre{c.members > 1 ? 's' : ''}. Chaque mois, chacun envoie une référence ; tu as un mois pour la vivre.</p>
            {err && <p className="err">{err}</p>}
            <form action={joinInvite.bind(null, code)} className="actions"><Submit pendingText="…">Rejoindre le groupe</Submit></form>
          </div>
        ) : (
          <div className="panel" style={{ marginTop: 24 }}>
            <h1>Lien invalide</h1>
            <p className="meta">Ce lien d’invitation n’existe pas. Demande-en un nouveau à ton ami.</p>
            <Link className="btn" href="/groupes">Mes groupes</Link>
          </div>
        )}
      </div>
    </main>
  )
}
