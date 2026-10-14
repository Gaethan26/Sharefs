'use client'

import { useContext } from 'react'
import { A } from '../router'
import { ArtCtx, RoomHeader } from '../RoomHeader'
import { useStore } from '../store'
import { usePalette } from '../palette'
import { ART_PALETTES, paletteVars } from '@/lib/palettes'
import { kindOf } from '@/lib/kinds'
import { fmtDate, monthKey, monthLabel } from '@/lib/format'
import { Countdown, Framed, TrackBar, Who, WorkMeta } from '@/components/ui'
import type { Challenge, RecoFull } from '@/lib/types'

const veillee = () => { const m = monthLabel(); return `Veillée ${/^[aeiouyàâéèêh]/i.test(m) ? 'd’' : 'de '}${m}` }

export function Todo() {
  const s = useStore()
  const art = useContext(ArtCtx)
  const me = s.userId
  const mineOf = (r: RecoFull) => r.challenges.find(c => c.user_id === me)
  const rows = s.recos.filter(r => r.sender_id !== me && mineOf(r))
  const active = rows.filter(r => mineOf(r)!.status === 'active').sort((a, b) => mineOf(a)!.deadline.localeCompare(mineOf(b)!.deadline))
  const dropped = rows.filter(r => mineOf(r)!.status === 'dropped')
  const done = rows.filter(r => mineOf(r)!.status === 'done')
  const used = new Set(s.recos.filter(r => r.sender_id === me && !r.reply_to && r.month === monthKey()).map(r => r.circle_id))
  const free = s.circles.filter(c => !used.has(c.id)).length

  return (
    <>
      <RoomHeader k="orrery" title={veillee()} sub={<>
        {active.length ? `${active.length} œuvre${active.length > 1 ? 's' : ''} t’attend${active.length > 1 ? 'ent' : ''}. ` : 'Aucune œuvre en attente. '}
        {s.circles.length ? (free > 0 ? `Ta recommandation du mois reste à faire dans ${free} groupe${free > 1 ? 's' : ''}.` : 'Tes recommandations du mois sont faites.') : 'Crée un groupe pour commencer.'}
      </>}>
        {s.circles.length ? (free > 0 && <A className="btn" href="/envoyer">Recommander une œuvre</A>) : <A className="btn" href="/groupes">Créer un groupe</A>}
      </RoomHeader>

      {!active.length && !dropped.length && (
        <section className="empty-art tinted" style={paletteVars(ART_PALETTES.lune)}>
          {art.lune && <img src={art.lune} alt="Deux hommes contemplant la lune, Caspar David Friedrich" />}
          <div>
            <h2>Rien ne t’attend pour l’instant.</h2>
            <p>Quand un ami te confie une œuvre, elle apparaît ici avec son mois pour la vivre.</p>
            <A className="btn" href={s.circles.length ? '/envoyer' : '/groupes'}>{s.circles.length ? 'Recommander une œuvre' : 'Créer un groupe'}</A>
          </div>
        </section>
      )}

      {active.map(r => <ActiveCard key={r.id} r={r} c={mineOf(r)!} />)}

      {dropped.length > 0 && <><h2>Abandonnés</h2><ul className="list panel">{dropped.map(r => <Row key={r.id} r={r} action="resume" />)}</ul></>}
      {done.length > 0 && <><h2>Terminés</h2><ul className="list panel">{done.map(r => <Row key={r.id} r={r} />)}</ul></>}
    </>
  )
}

function ActiveCard({ r, c }: { r: RecoFull; c: Challenge }) {
  const s = useStore()
  const p = usePalette(r.work.cover_url)
  const k = kindOf(r.work.kind)
  const act = async (fn: (id: string) => Promise<{ error?: string }>, ok: string) => {
    const res = await fn(r.id); s.setToast(res.error ?? ok)
  }
  return (
    <article className="challenge-card tinted" style={paletteVars(p)}>
      <div className="challenge">
        <Countdown c={c} kind={r.work.kind} />
        <div>
          <Who p={r.sender} me={s.userId} text={c.invited ? 'te confie' : 'recommande (défi relevé)'} date={r.sent_at} />
          <A href={`/r/${r.id}`} className="reco-head" style={{ marginTop: 8 }}>
            <div><div className="work t-l">{r.work.title}</div><WorkMeta w={r.work} effort={r.effort} /></div>
          </A>
          {r.why && <p className="why">« {r.why} »</p>}
        </div>
        <A href={`/r/${r.id}`} aria-hidden tabIndex={-1}><Framed w={r.work} size="m" /></A>
      </div>
      <TrackBar c={c} />
      <div className="meta">{k.todo} avant le {fmtDate(c.deadline)}{c.joker_used ? ', joker utilisé' : ''}, dans {r.circle?.name}</div>
      <div className="actions">
        <A className="btn small" href={`/r/${r.id}#finir`}>{k.done} ? Donner mon avis</A>
        {!c.joker_used && <button className="btn small ghost" onClick={() => act(s.joker, '15 jours de plus')}>Joker : 15 jours de plus</button>}
        <button className="btn small ghost" onClick={() => act(s.drop, 'Défi abandonné')}>Abandonner</button>
      </div>
    </article>
  )
}

function Row({ r, action }: { r: RecoFull; action?: 'resume' }) {
  const s = useStore()
  const c = r.challenges.find(x => x.user_id === s.userId)
  return (
    <li className="item">
      <Framed w={r.work} size="s" />
      <div className="body">
        <A href={`/r/${r.id}`} className="work">{r.work.title}</A>
        <div className="meta">{c?.status === 'done' ? `${kindOf(r.work.kind).done} le ${fmtDate(c.done_at ?? c.deadline)}` : 'Abandonné'}, dans {r.circle?.name}</div>
      </div>
      <div className="side">
        {action === 'resume'
          ? <button className="btn small ghost" onClick={async () => { const res = await s.resume(r.id); s.setToast(res.error ?? 'Défi repris') }}>Reprendre</button>
          : <A className="btn small ghost" href={`/r/${r.id}#salon`}>Avis et salon</A>}
      </div>
    </li>
  )
}
