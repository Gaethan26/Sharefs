import Link from 'next/link'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { RECO_SELECT, type Person, type Reco } from '@/lib/types'
import { monthKey } from '@/lib/format'
import { Avatar, nameOf } from '@/components/ui'
import { CopyButton } from '@/components/client'
import { RecoCard } from '@/components/RecoCard'
import { leaveCircle } from '@/app/actions'

export default async function CirclePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase, user } = await requireUser()
  const { data: circle } = await supabase.from('circles').select('id, name, invite_code').eq('id', id).maybeSingle()
  if (!circle) notFound()
  const [{ data: mem }, { data: recos }] = await Promise.all([
    supabase.from('circle_members').select('role, user:profiles(id, display_name, avatar_url)').eq('circle_id', id),
    supabase.from('recos').select(RECO_SELECT).eq('circle_id', id).order('sent_at', { ascending: false }).limit(60),
  ])
  const members = (mem ?? []) as unknown as { role: string; user: Person }[]
  const list = (recos ?? []) as unknown as Reco[]
  const usedThisMonth = list.some(r => r.sender_id === user.id && !r.reply_to && r.month === monthKey())
  const h = await headers()
  const origin = process.env.NEXT_PUBLIC_APP_URL || `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('x-forwarded-host') ?? h.get('host')}`
  const invite = `${origin}/invite/${circle.invite_code}`
  return (
    <>
      <h1>{circle.name}</h1>
      <p className="sub">{members.length} membre{members.length > 1 ? 's' : ''}. {usedThisMonth ? 'Ton envoi du mois est fait ici.' : 'Ton envoi du mois est disponible ici.'}</p>
      <div className="actions" style={{ marginTop: -8, marginBottom: 18 }}>
        {usedThisMonth ? <span className="btn" aria-disabled="true">Envoi du mois fait</span> : <Link className="btn" href={`/envoyer?circle=${id}`}>Envoyer une référence</Link>}
      </div>
      <section className="panel">
        <h3>Membres</h3>
        <div className="recips" style={{ marginTop: 0 }}>
          {members.map(m => (
            <Link key={m.user.id} className="st" href={m.user.id === user.id ? '/profil' : `/u/${m.user.id}`}>
              <Avatar p={m.user} size={22} />{nameOf(m.user, user.id)}{m.role === 'owner' ? ' · créateur' : ''}
            </Link>
          ))}
        </div>
        <label className="f" htmlFor="invite">Lien d’invitation</label>
        <div className="row">
          <input id="invite" className="grow" readOnly value={invite} />
          <div className="fit"><CopyButton text={invite} /></div>
        </div>
      </section>
      <h2>Le fil</h2>
      {list.length ? list.map(r => <RecoCard key={r.id} r={r} me={user.id} />) : <p className="empty">Aucune reco dans ce cercle pour l’instant. Lance le premier envoi.</p>}
      <form action={leaveCircle.bind(null, id)} style={{ marginTop: 30 }}>
        <button className="linkbtn">Quitter ce cercle</button>
      </form>
    </>
  )
}
