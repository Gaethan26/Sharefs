'use client'

import { useEffect, useState } from 'react'
import { A } from '../router'
import { useStore } from '../store'
import { usePalette } from '../palette'
import { usePageTint } from '../tint'
import { paletteVars } from '@/lib/palettes'
import { kindOf } from '@/lib/kinds'
import { betVerdict, fmtDate } from '@/lib/format'
import type { Person } from '@/lib/types'
import { Avatar, Countdown, Framed, nameOf, StarsView, StatusChip, TrackBar, Who, WorkMeta } from '@/components/ui'
import { WhereToFind } from '@/components/WhereToFind'
import { FinishForm } from '@/components/FinishForm'
import { Salon } from '@/components/Salon'

export function Reco({ id }: { id: string }) {
  const s = useStore()
  const r = s.recos.find(x => x.id === id)
  const [state, setState] = useState<'ok' | 'loading' | 'missing'>(r ? 'ok' : 'loading')
  useEffect(() => {
    if (r) { setState('ok'); return }
    s.loadReco(id).then(x => setState(x ? 'ok' : 'missing')).catch(() => setState('missing'))
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps
  const p = usePalette(r?.work.cover_url)
  usePageTint(r ? p : null)

  if (!r) return state === 'loading'
    ? <p className="empty">Chargement…</p>
    : <div className="empty"><h1>Œuvre introuvable</h1><p>Elle a été retirée, ou tu ne fais pas partie de ce salon.</p><A className="btn" href="/a-faire">Retour</A></div>

  const me = s.userId
  const k = kindOf(r.work.kind)
  const isSender = r.sender_id === me
  const mine = r.challenges.find(c => c.user_id === me)
  const unlocked = isSender || mine?.status === 'done'
  const myReview = r.reviews.find(v => v.user_id === me)
  const others = r.reviews.filter(v => v.user_id !== me)
  const doneCount = r.challenges.filter(c => c.status === 'done').length
  const replied = s.recos.some(x => x.reply_to === id && x.sender_id === me)
  const inLib = s.library.some(i => i.work.id === r.work.id)
  const parent = r.reply_to ? s.recos.find(x => x.id === r.reply_to) : null
  const people: Record<string, Person> = {}
  for (const m of s.circles.find(c => c.id === r.circle_id)?.members ?? []) people[m.id] = m
  const byId = (uid: string) => people[uid] ?? r.challenges.find(c => c.user_id === uid)?.user ?? null
  const say = (res: { error?: string }, ok: string) => s.setToast(res.error ?? ok)

  return (
    <div style={paletteVars(p)}>
      <section className="stage deep">
        {r.work.cover_url && <img className="stage-bg" src={r.work.cover_url} alt="" aria-hidden />}
        <div className="stage-in">
          <Framed w={r.work} size="l" />
          <div>
            <Who p={r.sender} me={me} text={`${r.reply_to ? 'répond' : 'recommande'} dans ${r.circle?.name ?? 'le salon'}`} date={r.sent_at} />
            {parent && <p className="meta" style={{ margin: '4px 0 0' }}>En réponse à <A href={`/r/${parent.id}`}>« {parent.work.title} »</A></p>}
            <h1 className="t-xl work" style={{ margin: '14px 0 8px' }}>{r.work.title}</h1>
            <WorkMeta w={r.work} effort={r.effort} />
            {r.pitch ? <p className="pitch">{r.pitch}</p> : r.work.synopsis ? <p className="pitch">{r.work.synopsis.slice(0, 320)}{r.work.synopsis.length > 320 ? '…' : ''}</p> : null}
            {r.why && <p className="why">« {r.why} »<span className="why-by sig">{(r.sender?.display_name || 'Un ami').split(' ')[0]}</span></p>}
            <WhereToFind w={r.work} link={r.link} />
          </div>
        </div>
      </section>

      {mine && (
        <section className="panel tinted">
          <div className="due">
            <Countdown c={mine} kind={r.work.kind} />
            <div>
              <h3 style={{ marginBottom: 4 }}>Ton défi</h3>
              {mine.status === 'active' && <div className="meta">{k.todo} avant le {fmtDate(mine.deadline)}{mine.joker_used ? ', joker utilisé' : ''}.</div>}
              {mine.status === 'done' && <div className="meta">{k.done} le {fmtDate(mine.done_at ?? mine.deadline)}.</div>}
              {mine.status === 'dropped' && <div className="meta">Tu as abandonné. Tu peux reprendre quand tu veux.</div>}
            </div>
          </div>
          {mine.status === 'active' && <TrackBar c={mine} />}
          <div className="actions">
            {mine.status === 'active' && !mine.joker_used && <button className="btn small ghost" onClick={async () => say(await s.joker(id), '15 jours de plus')}>Joker : 15 jours de plus</button>}
            {mine.status === 'active' && <button className="btn small ghost" onClick={async () => say(await s.drop(id), 'Défi abandonné')}>Abandonner</button>}
            {mine.status === 'dropped' && <button className="btn small ghost" onClick={async () => say(await s.resume(id), 'Défi repris')}>Reprendre</button>}
            {mine.status === 'done' && !replied && <A className="btn small" href={`/envoyer?reply=${id}`}>Répondre par une œuvre</A>}
            {!inLib && <button className="btn small ghost" onClick={async () => say(await s.addWorkId(r.work.id, `Recommandé par ${r.sender?.display_name || 'un ami'}`), 'Ajouté à ta galerie')}>Ajouter à ma galerie</button>}
          </div>
        </section>
      )}

      {!isSender && !mine && (
        <section className="panel tinted">
          <h3>Pas destinataire, mais tenté ?</h3>
          <p className="meta">Relève le défi : tu auras un mois, comme les autres. Déjà {k.done.toLowerCase()} ? Note-le directement.</p>
          <div className="actions"><button className="btn" onClick={async () => say(await s.join(id), 'Défi relevé : il est dans « À faire »')}>Je relève le défi</button></div>
        </section>
      )}

      {!isSender && mine?.status !== 'dropped' && (
        <section className="panel">
          <FinishForm key={myReview?.updated_at ?? 'new'} doneLabel={k.done} initialRating={myReview?.rating} initialBody={myReview?.body ?? ''} editing={!!myReview}
            onSubmit={async (rating, body) => { const res = await s.finish(id, rating, body); if (!res.error) s.setToast(r.secret?.bet || unlocked ? 'Avis enregistré' : 'Avis enregistré : tout est débloqué'); return res }} />
        </section>
      )}

      <h2>Participants</h2>
      <section className="panel">
        {r.challenges.length ? <div className="recips" style={{ marginTop: 0 }}>{r.challenges.map(c => <StatusChip key={c.user_id} c={c} kind={r.work.kind} me={me} />)}</div>
          : <p className="meta">Personne pour l’instant.</p>}
        {unlocked ? (
          <>
            {(r.secret?.bet || r.secret?.sender_rating) && (
              <div className="bet tinted">
                {r.secret?.sender_rating ? <span>Note de {nameOf(r.sender, me)} : <StarsView n={r.secret.sender_rating} /></span> : null}
                {r.secret?.bet ? <span>Pari : <StarsView n={r.secret.bet} /></span> : null}
                {r.secret?.bet && myReview ? <strong>Pari {betVerdict(r.secret.bet, myReview.rating)}</strong> : null}
              </div>
            )}
            {myReview && <div className="review"><div className="who"><Avatar p={byId(me)} /><span>Toi</span><StarsView n={myReview.rating} /></div>{myReview.body && <p>{myReview.body}</p>}</div>}
            {others.map(v => (
              <div key={v.user_id} className="review">
                <div className="who"><Avatar p={byId(v.user_id)} /><span>{nameOf(byId(v.user_id), me)}</span><StarsView n={v.rating} />
                  {r.secret?.bet ? <span>, pari {betVerdict(r.secret.bet, v.rating)}</span> : null}</div>
                {v.body && <p>{v.body}</p>}
              </div>
            ))}
            {!others.length && !myReview && <p className="meta" style={{ marginBottom: 0 }}>Pas encore d’avis.</p>}
          </>
        ) : (
          <div className="sealed">
            {doneCount ? `${doneCount} avis scellé${doneCount > 1 ? 's' : ''}` : 'Aucun avis pour l’instant'}, ainsi que la note et le pari de {nameOf(r.sender, me)}.
            {mine ? ' Termine et note pour tout débloquer.' : ' Relève le défi pour y accéder.'}
          </div>
        )}
      </section>

      {unlocked && <Salon recoId={id} me={me} people={people} />}
    </div>
  )
}
