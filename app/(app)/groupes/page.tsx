import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { monthKey } from '@/lib/format'
import { Submit } from '@/components/client'
import { createCircle, joinCircle } from '@/app/actions'

export const metadata = { title: 'Groupes' }

export default async function Groupes({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const { err } = await searchParams
  const { supabase, user } = await requireUser()
  const [{ data: rows }, { data: sent }] = await Promise.all([
    supabase.from('circle_members').select('circle_id, circle:circles(id, name, created_at)'),
    supabase.from('recos').select('circle_id').eq('sender_id', user.id).eq('month', monthKey()).is('reply_to', null),
  ])
  const byCircle = new Map<string, { id: string; name: string; n: number }>()
  for (const r of (rows ?? []) as unknown as { circle_id: string; circle: { id: string; name: string } }[]) {
    const c = byCircle.get(r.circle_id) ?? { id: r.circle.id, name: r.circle.name, n: 0 }
    c.n++; byCircle.set(r.circle_id, c)
  }
  const used = new Set((sent ?? []).map(s => s.circle_id))
  const circles = [...byCircle.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr'))
  return (
    <>
      <h1>Groupes</h1>
      <p className="sub">Un groupe par bande : amis proches, collègues, club de lecture. Une recommandation par mois dans chacun.</p>
      {err && <div className="notice">{err}</div>}
      {circles.length > 0 ? (
        <section className="panel"><ul className="list">
          {circles.map(c => (
            <li key={c.id} className="item">
              <div className="body"><Link href={`/g/${c.id}`} className="work t-l">{c.name}</Link>
                <div className="meta">{c.n} membre{c.n > 1 ? 's' : ''} · {used.has(c.id) ? 'envoi du mois fait' : 'envoi du mois disponible'}</div></div>
              <div className="side">
                {!used.has(c.id) && <Link className="btn small" href={`/envoyer?circle=${c.id}`}>Envoyer</Link>}
                <Link className="btn small ghost" href={`/g/${c.id}`}>Ouvrir</Link>
              </div>
            </li>
          ))}
        </ul></section>
      ) : <p className="empty">Tu n’as pas encore de groupe. Crées-en un et invite tes amis avec un lien.</p>}
      <div className="row">
        <form action={createCircle} className="panel">
          <h3>Créer un groupe</h3>
          <label className="f" htmlFor="name">Nom</label>
          <input id="name" name="name" required maxLength={60} placeholder="Les potes du lycée" />
          <div className="actions"><Submit pendingText="Création…">Créer</Submit></div>
        </form>
        <form action={joinCircle} className="panel">
          <h3>Rejoindre un groupe</h3>
          <label className="f" htmlFor="code">Lien ou code d’invitation</label>
          <input id="code" name="code" required maxLength={200} placeholder="https://…/invite/3fa9c1…" />
          <div className="actions"><Submit className="btn ghost" pendingText="…">Rejoindre</Submit></div>
        </form>
      </div>
    </>
  )
}
