import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { RECO_SELECT, type Challenge, type Reco } from '@/lib/types'
import { kindOf } from '@/lib/kinds'
import { fmtDate, monthKey, monthLabel } from '@/lib/format'
import { Countdown, Cover, Framed, TrackBar, Who, WorkMeta } from '@/components/ui'
import { ArtBackdrop, Artwork } from '@/components/Artwork'
import { dropAction, jokerAction, resumeAction } from '@/app/actions'

export const metadata = { title: 'À faire' }

function veillee() {
  const m = monthLabel()
  return `Veillée ${/^[aeiouyàâéèêh]/i.test(m) ? 'd’' : 'de '}${m}`
}
type Row = Challenge & { reco: Reco }

export default async function Todo({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const { err } = await searchParams
  const { supabase, user } = await requireUser()
  const [{ data }, { data: circles }, { data: sent }] = await Promise.all([
    supabase.from('challenges').select(`status, deadline, started_at, joker_used, done_at, invited, user_id, reco:recos(${RECO_SELECT})`)
      .eq('user_id', user.id).order('deadline'),
    supabase.from('circle_members').select('circle_id').eq('user_id', user.id),
    supabase.from('recos').select('circle_id').eq('sender_id', user.id).eq('month', monthKey()).is('reply_to', null),
  ])
  const rows = ((data ?? []) as unknown as Row[]).filter(r => r.reco)
  const active = rows.filter(r => r.status === 'active')
  const dropped = rows.filter(r => r.status === 'dropped')
  const done = rows.filter(r => r.status === 'done').sort((a, b) => (b.done_at ?? '').localeCompare(a.done_at ?? ''))
  const free = (circles?.length ?? 0) - new Set((sent ?? []).map(s => s.circle_id)).size

  return (
    <>
      <section className="veillee">
        <ArtBackdrop k="orrery" width={1280} />
        <div className="veillee-in">
          <div>
            <h1>{veillee()}</h1>
            <p>
              {active.length ? `${active.length} œuvre${active.length > 1 ? 's' : ''} t’attend${active.length > 1 ? 'ent' : ''}. ` : 'Aucune œuvre en attente. '}
              {circles?.length ? (free > 0 ? `Ta recommandation du mois reste à faire dans ${free} cercle${free > 1 ? 's' : ''}.` : 'Tes recommandations du mois sont faites.') : 'Rejoins un cercle pour commencer.'}
            </p>
          </div>
          {circles?.length ? (free > 0 && <Link className="btn" href="/envoyer">Recommander une œuvre</Link>) : <Link className="btn" href="/cercles">Créer un cercle</Link>}
        </div>
      </section>
      {err && <div className="notice">{err}</div>}

      {active.length === 0 && dropped.length === 0 && (
        <section className="room" style={{ marginBottom: 40 }}>
          <Artwork k="lune" width={960} />
          <div>
            <h2 style={{ marginTop: 0 }}>Rien ne t’attend pour l’instant.</h2>
            <p className="sub">Quand un ami te confie une œuvre, elle apparaît ici avec son mois pour la vivre. En attendant, recommande la tienne.</p>
            <Link className="btn" href={circles?.length ? '/envoyer' : '/cercles'}>{circles?.length ? 'Recommander une œuvre' : 'Créer un cercle'}</Link>
          </div>
        </section>
      )}
      {active.map(r => {
        const k = kindOf(r.reco.work.kind)
        return (
          <article key={r.reco.id} className={`panel card k-${r.reco.work.kind}`}>
            <div className="challenge">
              <Countdown c={r} kind={r.reco.work.kind} />
              <div>
                <Who p={r.reco.sender} me={user.id} text={r.invited ? 'te confie' : 'recommande (défi relevé)'} date={r.reco.sent_at} />
                <Link href={`/r/${r.reco.id}`} className="reco-head" style={{ marginTop: 8 }}>
                  <div><div className="work t-l">{r.reco.work.title}</div><WorkMeta w={r.reco.work} effort={r.reco.effort} /></div>
                </Link>
                {r.reco.why && <p className="why">« {r.reco.why} »</p>}
              </div>
              <Framed w={r.reco.work} size="m" />
            </div>
            <TrackBar c={r} />
            <div className="meta">{k.todo} avant le {fmtDate(r.deadline)}{r.joker_used ? ', joker utilisé' : ''}, dans {r.reco.circle?.name}</div>
            <div className="actions">
              <Link className="btn small" href={`/r/${r.reco.id}#finir`}>{k.done} ? Donner mon avis</Link>
              {!r.joker_used && <form action={jokerAction.bind(null, r.reco.id, '/a-faire')}><button className="btn small ghost">Joker : 15 jours de plus</button></form>}
              <form action={dropAction.bind(null, r.reco.id, '/a-faire')}><button className="btn small ghost">Abandonner</button></form>
            </div>
          </article>
        )
      })}

      {dropped.length > 0 && (
        <>
          <h2>Abandonnés</h2>
          <section className="panel"><ul className="list">
            {dropped.map(r => (
              <li key={r.reco.id} className={`item k-${r.reco.work.kind}`}>
                <Cover w={r.reco.work} size="s" />
                <div className="body"><Link href={`/r/${r.reco.id}`} className="work">{r.reco.work.title}</Link><WorkMeta w={r.reco.work} /></div>
                <div className="side"><form action={resumeAction.bind(null, r.reco.id, '/a-faire')}><button className="btn small ghost">Reprendre</button></form></div>
              </li>
            ))}
          </ul></section>
        </>
      )}

      {done.length > 0 && (
        <>
          <h2>Terminés</h2>
          <section className="panel"><ul className="list">
            {done.map(r => (
              <li key={r.reco.id} className={`item k-${r.reco.work.kind}`}>
                <Cover w={r.reco.work} size="s" />
                <div className="body">
                  <Link href={`/r/${r.reco.id}`} className="work">{r.reco.work.title}</Link>
                  <div className="meta">{kindOf(r.reco.work.kind).done} le {fmtDate(r.done_at ?? r.deadline)} · {r.reco.circle?.name}</div>
                </div>
                <div className="side"><Link className="btn small ghost" href={`/r/${r.reco.id}#salon`}>Avis et salon</Link></div>
              </li>
            ))}
          </ul></section>
        </>
      )}
    </>
  )
}
