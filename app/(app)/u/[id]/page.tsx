import { notFound, redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { affinities } from '@/lib/stats'
import type { Work } from '@/lib/types'
import { Avatar, Cover, WorkMeta } from '@/components/ui'
import { addWorkToLibrary } from '@/app/actions'

export default async function UserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase, user } = await requireUser()
  if (id === user.id) redirect('/profil')
  const [{ data: p }, { data: lib }, { data: mineLib }, { data: recos }] = await Promise.all([
    supabase.from('profiles').select('id, display_name, avatar_url').eq('id', id).maybeSingle(),
    supabase.from('library_items').select('id, note, work:works(id, kind, title, creator, year, cover_url)').eq('user_id', id).order('created_at', { ascending: false }).limit(500),
    supabase.from('library_items').select('work_id').eq('user_id', user.id),
    supabase.from('recos').select('sender_id, secret:reco_secrets(sender_rating), reviews(user_id, rating)').limit(1000),
  ])
  if (!p) notFound()
  const has = new Set((mineLib ?? []).map(l => l.work_id))
  const items = (lib ?? []) as unknown as { id: string; note: string | null; work: Work }[]
  const a = affinities((recos ?? []) as never, user.id).get(id)
  return (
    <>
      <div className="who" style={{ fontSize: '1rem' }}><Avatar p={p} size={44} /></div>
      <h1 style={{ marginTop: 10 }}>{p.display_name || 'Sans nom'}</h1>
      <p className="sub">{a ? `${a.pct} % d’affinité avec toi, sur ${a.n} référence${a.n > 1 ? 's' : ''} notée${a.n > 1 ? 's' : ''} tous les deux.` : 'Pas encore de référence notée en commun.'}</p>
      <h2>Sa liste ({items.length})</h2>
      <section className="panel">
        {items.length ? (
          <ul className="list">
            {items.map(i => (
              <li key={i.id} className={`item k-${i.work.kind}`}>
                <Cover w={i.work} size="s" />
                <div className="body"><div className="work">{i.work.title}</div><WorkMeta w={i.work} />{i.note && <p className="why" style={{ marginTop: 4 }}>{i.note}</p>}</div>
                <div className="side">
                  {has.has(i.work.id) ? <span className="meta">Dans ta liste</span> : (
                    <form action={addWorkToLibrary.bind(null, i.work.id, `Repéré dans la liste de ${p.display_name || 'un ami'}`)}>
                      <button className="btn small ghost">Ajouter à ma liste</button>
                    </form>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : <p className="empty">Sa liste est vide.</p>}
      </section>
    </>
  )
}
