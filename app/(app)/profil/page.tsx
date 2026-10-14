import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { affinities } from '@/lib/stats'
import { avg1 } from '@/lib/format'
import type { Person } from '@/lib/types'
import { Avatar } from '@/components/ui'
import { Submit } from '@/components/client'
import { signOut, updateProfile } from '@/app/actions'

export const metadata = { title: 'Profil' }

type R = {
  id: string; sender_id: string; work: { title: string }
  secret: { sender_rating: number | null; bet: number | null } | null
  reviews: { user_id: string; rating: number }[]
  challenges: { user_id: string; status: string; deadline: string; done_at: string | null }[]
}

export default async function Profil({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams
  const { supabase, user } = await requireUser()
  const [{ data: profile }, { data: recos }, { data: mem }] = await Promise.all([
    supabase.from('profiles').select('id, display_name, avatar_url, email_reminders').eq('id', user.id).single(),
    supabase.from('recos').select('id, sender_id, work:works(title), secret:reco_secrets(sender_rating, bet), reviews(user_id, rating), challenges(user_id, status, deadline, done_at)').limit(1000),
    supabase.from('circle_members').select('user:profiles(id, display_name, avatar_url)'),
  ])
  const all = (recos ?? []) as unknown as R[]
  const me = user.id

  // Prescripteur
  const sent = all.filter(r => r.sender_id === me)
  let parts = 0, finished = 0, sum = 0, n = 0, bets = 0, hits = 0
  const perReco: { title: string; avg: number; n: number }[] = []
  for (const r of sent) {
    parts += r.challenges.length
    finished += r.challenges.filter(c => c.status === 'done').length
    const rs = r.reviews.filter(v => v.user_id !== me)
    rs.forEach(v => { sum += v.rating; n++; if (r.secret?.bet) { bets++; if (Math.abs(r.secret.bet - v.rating) <= 1) hits++ } })
    if (rs.length) perReco.push({ title: r.work.title, avg: rs.reduce((a, v) => a + v.rating, 0) / rs.length, n: rs.length })
  }
  const best = perReco.sort((a, b) => b.avg - a.avg || b.n - a.n)[0]

  // Destinataire
  const mine = all.flatMap(r => r.challenges.filter(c => c.user_id === me))
  const done = mine.filter(c => c.status === 'done')
  const onTime = done.filter(c => c.done_at && c.done_at <= c.deadline).length
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)} %` : '–')

  // Affinités
  const people = new Map<string, Person>()
  for (const m of (mem ?? []) as unknown as { user: Person }[]) if (m.user.id !== me) people.set(m.user.id, m.user)
  const aff = affinities(all, me)
  const rows = [...people.values()].map(p => ({ p, a: aff.get(p.id) })).sort((x, y) => (y.a?.pct ?? -1) - (x.a?.pct ?? -1))

  return (
    <>
      <h1>{profile?.display_name || 'Profil'}</h1>
      <p className="sub">{user.email}</p>

      <section className="panel">
        <h3>Toi, prescripteur</h3>
        <div className="stats">
          <div className="stat"><b>{sent.length}</b><span>recos envoyées</span></div>
          <div className="stat"><b>{pct(finished, parts)}</b><span>menées au bout par tes amis</span></div>
          <div className="stat"><b>{n ? avg1(sum / n) : '–'}</b><span>note moyenne reçue</span></div>
          <div className="stat"><b>{pct(hits, bets)}</b><span>de paris justes à une étoile près</span></div>
        </div>
        {best && <p className="meta" style={{ margin: '12px 0 0' }}>Ta reco la mieux reçue : <span className="work">{best.title}</span>, <span className="rv">{avg1(best.avg)}★</span> sur {best.n} avis.</p>}
      </section>

      <section className="panel">
        <h3>Toi, destinataire</h3>
        <div className="stats">
          <div className="stat"><b>{done.length}</b><span>défis terminés</span></div>
          <div className="stat"><b>{pct(onTime, done.length)}</b><span>dans les temps</span></div>
          <div className="stat"><b>{mine.filter(c => c.status === 'active').length}</b><span>en cours</span></div>
        </div>
      </section>

      <section className="panel">
        <h3>Affinités de goût</h3>
        <p className="meta" style={{ marginTop: -6 }}>Calculées sur les références que vous avez notées tous les deux.</p>
        {rows.length ? rows.map(({ p, a }) => (
          <Link key={p.id} href={`/u/${p.id}`} className="aff">
            <Avatar p={p} size={32} />
            <div>
              <div>{p.display_name || 'Sans nom'}</div>
              {a ? <div className="track"><span style={{ width: `${Math.max(4, a.pct)}%` }} /></div> : <div className="meta">Pas encore de note en commun</div>}
            </div>
            <div className="meta">{a ? <><strong style={{ color: 'var(--ink)' }}>{a.pct} %</strong> sur {a.n}</> : null}</div>
          </Link>
        )) : <p className="meta">Rejoins un groupe pour mesurer tes affinités.</p>}
      </section>

      <form action={updateProfile} className="panel">
        <h3>Réglages</h3>
        <label className="f" htmlFor="display_name">Nom affiché</label>
        <input id="display_name" name="display_name" defaultValue={profile?.display_name ?? ''} maxLength={40} required />
        <label style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 14 }}>
          <input type="checkbox" name="email_reminders" defaultChecked={profile?.email_reminders ?? true} />
          E-mail quotidien : nouvelles recos, échéances à J-7 et J-1, nouveaux avis
        </label>
        {sp.ok && <p className="okmsg">Enregistré.</p>}
        {sp.err && <p className="err">{sp.err}</p>}
        <div className="actions"><Submit pendingText="…">Enregistrer</Submit></div>
      </form>
      <form action={signOut}><button className="linkbtn">Se déconnecter</button></form>
    </>
  )
}
