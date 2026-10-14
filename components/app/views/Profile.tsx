'use client'

import { useEffect, useState } from 'react'
import { A, navigate } from '../router'
import { useStore } from '../store'
import { usePalette } from '../palette'
import { RoomHeader, MosaicHeader } from '../RoomHeader'
import { ART_PALETTES, paletteVars } from '@/lib/palettes'
import { affinities } from '@/lib/stats'
import { avg1 } from '@/lib/format'
import { kindOf } from '@/lib/kinds'
import type { Person, Work } from '@/lib/types'
import { Avatar, Framed } from '@/components/ui'

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)} %` : '–')

export function Profile() {
  const s = useStore()
  const me = s.userId
  const [name, setName] = useState(s.profile?.display_name ?? '')
  const [mails, setMails] = useState(s.profile?.email_reminders ?? true)
  const [saved, setSaved] = useState('')
  useEffect(() => { setName(s.profile?.display_name ?? ''); setMails(s.profile?.email_reminders ?? true) }, [s.profile])

  const sent = s.recos.filter(r => r.sender_id === me)
  let parts = 0, finished = 0, sum = 0, n = 0, bets = 0, hits = 0
  const per: { title: string; avg: number; n: number }[] = []
  for (const r of sent) {
    parts += r.challenges.length
    finished += r.challenges.filter(c => c.status === 'done').length
    const rs = r.reviews.filter(v => v.user_id !== me)
    rs.forEach(v => { sum += v.rating; n++; if (r.secret?.bet) { bets++; if (Math.abs(r.secret.bet - v.rating) <= 1) hits++ } })
    if (rs.length) per.push({ title: r.work.title, avg: rs.reduce((a, v) => a + v.rating, 0) / rs.length, n: rs.length })
  }
  const best = per.sort((a, b) => b.avg - a.avg || b.n - a.n)[0]
  const mine = s.recos.flatMap(r => r.challenges.filter(c => c.user_id === me))
  const done = mine.filter(c => c.status === 'done')
  const onTime = done.filter(c => c.done_at && c.done_at <= c.deadline).length
  const people = new Map<string, Person>()
  s.circles.forEach(c => c.members.forEach(m => { if (m.id !== me) people.set(m.id, m) }))
  const aff = affinities(s.recos, me)
  const rows = [...people.values()].map(p => ({ p, a: aff.get(p.id) })).sort((x, y) => (y.a?.pct ?? -1) - (x.a?.pct ?? -1))

  return (
    <>
      <RoomHeader k="tricheur" title={s.profile?.display_name || 'Profil'} sub={s.email} />
      <section className="panel">
        <h3>Toi, quand tu recommandes</h3>
        <div className="stats">
          <div className="stat"><b>{sent.length}</b><span>œuvres confiées</span></div>
          <div className="stat"><b>{pct(finished, parts)}</b><span>vécues jusqu’au bout par tes amis</span></div>
          <div className="stat"><b>{n ? avg1(sum / n) : '–'}</b><span>note moyenne reçue</span></div>
          <div className="stat"><b>{pct(hits, bets)}</b><span>de paris justes à une étoile près</span></div>
        </div>
        {best && <p className="meta" style={{ margin: '12px 0 0' }}>Ta recommandation la mieux reçue : <span className="work">{best.title}</span>, {avg1(best.avg)} sur 5 ({best.n} avis).</p>}
      </section>
      <section className="panel">
        <h3>Toi, quand on te recommande</h3>
        <div className="stats">
          <div className="stat"><b>{done.length}</b><span>œuvres vécues</span></div>
          <div className="stat"><b>{pct(onTime, done.length)}</b><span>dans les temps</span></div>
          <div className="stat"><b>{mine.filter(c => c.status === 'active').length}</b><span>en cours</span></div>
        </div>
      </section>
      <section className="panel">
        <h3>Affinités de goût</h3>
        <p className="meta" style={{ marginTop: -6 }}>Calculées sur les œuvres que vous avez notées tous les deux.</p>
        {rows.length ? rows.map(({ p, a }) => (
          <A key={p.id} href={`/u/${p.id}`} className="aff">
            <Avatar p={p} size={32} />
            <div>
              <div>{p.display_name || 'Sans nom'}</div>
              {a ? <div className="track"><span style={{ width: `${Math.max(4, a.pct)}%` }} /></div> : <div className="meta">Pas encore de note en commun</div>}
            </div>
            <div className="meta">{a ? <><strong style={{ color: 'var(--ink)' }}>{a.pct} %</strong> sur {a.n}</> : null}</div>
          </A>
        )) : <p className="meta">Rejoins un groupe pour mesurer tes affinités.</p>}
      </section>
      <form className="panel" onSubmit={async e => {
        e.preventDefault()
        const r = await s.updateProfile(name, mails)
        setSaved(r.error ?? 'Enregistré.')
      }}>
        <h3>Réglages</h3>
        <label className="f" htmlFor="dn">Nom affiché</label>
        <input id="dn" value={name} onChange={e => setName(e.target.value)} maxLength={40} required />
        <label style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 14 }}>
          <input type="checkbox" checked={mails} onChange={e => setMails(e.target.checked)} />
          E-mail quotidien : nouvelles œuvres reçues, échéances à J-7 et J-1, nouveaux avis
        </label>
        {saved && <p className="okmsg">{saved}</p>}
        <div className="actions"><button className="btn">Enregistrer</button></div>
      </form>
      <button className="linkbtn" onClick={s.signOut}>Se déconnecter</button>
    </>
  )
}

export function UserView({ id }: { id: string }) {
  const s = useStore()
  const [items, setItems] = useState<{ id: string; note: string | null; work: Work }[] | null>(null)
  useEffect(() => {
    if (id === s.userId) { navigate('/profil', { replace: true }); return }
    let alive = true
    s.sb.from('library_items').select('id, note, work:works(id, kind, title, creator, year, cover_url)').eq('user_id', id).order('created_at', { ascending: false }).limit(500)
      .then(({ data }) => { if (alive) setItems(((data ?? []) as unknown as { id: string; note: string | null; work: Work }[]).filter(i => i.work)) })
    return () => { alive = false }
  }, [id, s.sb, s.userId])
  let person: Person | undefined
  s.circles.forEach(c => c.members.forEach(m => { if (m.id === id) person = m }))
  const a = affinities(s.recos, s.userId).get(id)
  const has = new Set(s.library.map(i => i.work.id))
  const covers = (items ?? []).map(i => i.work.cover_url).filter((u): u is string => !!u)
  const pal = usePalette(covers[0], ART_PALETTES.tricheur)
  if (!person) return <div className="empty"><h1>Profil introuvable</h1><p>Vous ne partagez aucun groupe.</p></div>
  return (
    <>
      <MosaicHeader covers={covers} palette={pal} title={person.display_name || 'Sans nom'}
        sub={a ? `${a.pct} % d’affinité avec toi, sur ${a.n} œuvre${a.n > 1 ? 's' : ''} notée${a.n > 1 ? 's' : ''} tous les deux.` : 'Pas encore d’œuvre notée en commun.'}>
        <Avatar p={person} size={56} />
      </MosaicHeader>
      <h2>Sa galerie{items ? ` (${items.length})` : ''}</h2>
      {items === null ? <p className="empty">Chargement…</p> : items.length ? (
        <ul className="gallery">
          {items.map(i => <FriendTile key={i.id} i={i} owned={has.has(i.work.id)} from={person!.display_name || 'un ami'} />)}
        </ul>
      ) : <p className="empty">Sa galerie est vide.</p>}
    </>
  )
}

function FriendTile({ i, owned, from }: { i: { id: string; note: string | null; work: Work }; owned: boolean; from: string }) {
  const s = useStore()
  const p = usePalette(i.work.cover_url)
  return (
    <li className="tile tinted" style={paletteVars(p)}>
      <Framed w={i.work} size="g" />
      <div className="cartel">
        <span className="cartel-title">{i.work.title}</span>
        <span>{[i.work.creator, i.work.year].filter(Boolean).join(', ')}</span>
        <span className="kind">{kindOf(i.work.kind).label}</span>
      </div>
      {i.note && <p className="tile-note">{i.note}</p>}
      <div className="tile-actions">
        {owned ? <span className="meta">Dans ta galerie</span>
          : <button className="btn small ghost" onClick={async () => { const r = await s.addWorkId(i.work.id, `Repéré dans la galerie de ${from}`); s.setToast(r.error ?? 'Ajouté à ta galerie') }}>Ajouter à ma galerie</button>}
      </div>
    </li>
  )
}
