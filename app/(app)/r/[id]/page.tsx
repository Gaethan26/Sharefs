import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { RECO_SELECT, type Person, type RecoFull } from '@/lib/types'
import { kindOf } from '@/lib/kinds'
import { betVerdict, fmtDate } from '@/lib/format'
import { Avatar, Countdown, Cover, nameOf, StarsView, StatusChip, TrackBar, Who, WorkMeta } from '@/components/ui'
import { WhereToFind } from '@/components/WhereToFind'
import { FinishForm } from '@/components/FinishForm'
import { Salon } from '@/components/Salon'
import { Submit } from '@/components/client'
import { addWorkToLibrary, dropAction, joinChallengeAction, jokerAction, resumeAction } from '@/app/actions'

export default async function RecoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ err?: string }> }) {
  const { id } = await params
  const { err } = await searchParams
  const { supabase, user } = await requireUser()
  const { data } = await supabase.from('recos')
    .select(`${RECO_SELECT}, secret:reco_secrets(sender_rating, bet), reviews(user_id, rating, body, updated_at)`)
    .eq('id', id).maybeSingle()
  if (!data) notFound()
  const r = data as unknown as RecoFull
  const k = kindOf(r.work.kind)
  const me = user.id
  const isSender = r.sender_id === me
  const mine = r.challenges.find(c => c.user_id === me)
  const unlocked = isSender || mine?.status === 'done'
  const myReview = r.reviews.find(v => v.user_id === me)
  const others = r.reviews.filter(v => v.user_id !== me)
  const doneCount = r.challenges.filter(c => c.status === 'done').length

  const [{ data: mem }, { data: msgs }, { data: replied }, { data: inLib }, { data: parent }] = await Promise.all([
    supabase.from('circle_members').select('user:profiles(id, display_name, avatar_url)').eq('circle_id', r.circle_id),
    unlocked ? supabase.from('messages').select('id, user_id, body, created_at').eq('reco_id', id).order('created_at').limit(300) : Promise.resolve({ data: [] }),
    supabase.from('recos').select('id').eq('reply_to', id).eq('sender_id', me).maybeSingle(),
    supabase.from('library_items').select('id').eq('user_id', me).eq('work_id', r.work.id).maybeSingle(),
    r.reply_to ? supabase.from('recos').select('id, work:works(title)').eq('id', r.reply_to).maybeSingle() : Promise.resolve({ data: null }),
  ])
  const people: Record<string, Person> = {}
  for (const m of (mem ?? []) as unknown as { user: Person }[]) people[m.user.id] = m.user
  const byId = (uid: string) => people[uid] ?? r.challenges.find(c => c.user_id === uid)?.user ?? null
  const parentTitle = (parent as unknown as { id: string; work: { title: string } } | null)?.work?.title

  return (
    <div className={`k-${r.work.kind}`}>
      {err && <div className="notice">{err}</div>}
      <Who p={r.sender} me={me} text={`${r.reply_to ? 'répond' : 'recommande'} dans ${r.circle?.name ?? 'le cercle'}`} date={r.sent_at} />
      {r.reply_to && parentTitle && <p className="meta" style={{ margin: '4px 0 0' }}>En réponse à <Link href={`/r/${r.reply_to}`}>« {parentTitle} »</Link></p>}
      <section className="reco-head" style={{ marginTop: 16 }}>
        <Cover w={r.work} size="l" />
        <div>
          <h1 className="work t-xl" style={{ fontWeight: 700 }}>{r.work.title}</h1>
          <WorkMeta w={r.work} effort={r.effort} />
          {r.pitch ? <p className="pitch">{r.pitch}</p> : r.work.synopsis ? <p className="pitch meta">{r.work.synopsis.slice(0, 320)}{r.work.synopsis.length > 320 ? '…' : ''}</p> : null}
        </div>
      </section>
      {r.why && <p className="why" style={{ fontSize: '1.05rem' }}>« {r.why} »<br /><span className="meta" style={{ fontStyle: 'normal' }}>— {nameOf(r.sender, me)}</span></p>}
      <WhereToFind w={r.work} link={r.link} />

      {mine && (
        <section className="panel card" style={{ marginTop: 22 }}>
          <div className="due">
            <Countdown c={mine} kind={r.work.kind} />
            <div>
              <h3 style={{ marginBottom: 4 }}>Ton défi</h3>
              {mine.status === 'active' && <div className="meta">{k.todo} avant le {fmtDate(mine.deadline)}{mine.joker_used ? ', joker utilisé' : ''}.</div>}
              {mine.status === 'done' && <div className="meta">{k.done} le {fmtDate(mine.done_at ?? mine.deadline)}.</div>}
              {mine.status === 'dropped' && <div className="meta">Tu as abandonné. Tu peux reprendre tant que tu veux.</div>}
            </div>
          </div>
          {mine.status === 'active' && <TrackBar c={mine} />}
          <div className="actions">
            {mine.status === 'active' && !mine.joker_used && <form action={jokerAction.bind(null, id, undefined)}><button className="btn small ghost">Joker +15 jours</button></form>}
            {mine.status === 'active' && <form action={dropAction.bind(null, id, undefined)}><button className="btn small ghost">Abandonner</button></form>}
            {mine.status === 'dropped' && <form action={resumeAction.bind(null, id, undefined)}><button className="btn small ghost">Reprendre</button></form>}
            {mine.status === 'done' && !replied && <Link className="btn small" href={`/envoyer?reply=${id}`}>Répondre par une reco</Link>}
            {!inLib && <form action={addWorkToLibrary.bind(null, r.work.id, `Recommandé par ${r.sender?.display_name || 'un ami'}`)}><Submit className="btn small ghost" pendingText="…">Ajouter à ma liste</Submit></form>}
          </div>
        </section>
      )}

      {!isSender && !mine && (
        <section className="panel card" style={{ marginTop: 22 }}>
          <h3>Pas destinataire, mais tenté ?</h3>
          <p className="meta">Relève le défi : tu auras un mois, comme les autres. Déjà {k.done.toLowerCase()} ? Note-le directement.</p>
          <div className="actions"><form action={joinChallengeAction.bind(null, id)}><Submit pendingText="…">Je relève le défi</Submit></form></div>
        </section>
      )}

      {!isSender && mine?.status !== 'dropped' && (
        <section className="panel">
          <FinishForm recoId={id} doneLabel={k.done} initialRating={myReview?.rating} initialBody={myReview?.body ?? ''} editing={!!myReview} />
        </section>
      )}

      <h2>Participants</h2>
      <section className="panel">
        {r.challenges.length ? <div className="recips" style={{ marginTop: 0 }}>{r.challenges.map(c => <StatusChip key={c.user_id} c={c} kind={r.work.kind} me={me} />)}</div>
          : <p className="meta">Personne pour l’instant.</p>}
        {unlocked ? (
          <>
            {(r.secret?.bet || r.secret?.sender_rating) && (
              <div className="bet">
                {r.secret?.sender_rating ? <span>Note de {nameOf(r.sender, me)} : <StarsView n={r.secret.sender_rating} /></span> : null}
                {r.secret?.bet ? <span>Pari : <StarsView n={r.secret.bet} /></span> : null}
                {r.secret?.bet && myReview ? <strong>Pari {betVerdict(r.secret.bet, myReview.rating)}</strong> : null}
              </div>
            )}
            {myReview && (
              <div className="review"><div className="who"><Avatar p={byId(me)} /><span>Toi</span><StarsView n={myReview.rating} /></div>{myReview.body && <p>{myReview.body}</p>}</div>
            )}
            {others.map(v => (
              <div key={v.user_id} className="review">
                <div className="who"><Avatar p={byId(v.user_id)} /><span>{nameOf(byId(v.user_id), me)}</span><StarsView n={v.rating} />
                  {r.secret?.bet ? <span>· pari {betVerdict(r.secret.bet, v.rating)}</span> : null}</div>
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

      {unlocked && <Salon recoId={id} me={me} initial={(msgs ?? []) as never} people={people} />}
    </div>
  )
}
