import Link from 'next/link'
import { Cover, StatusChip, Who, WorkMeta } from './ui'
import type { Reco } from '@/lib/types'

export function RecoCard({ r, me, showCircle = false }: { r: Reco; me: string; showCircle?: boolean }) {
  const mine = r.challenges.find(c => c.user_id === me)
  const unlocked = r.sender_id === me || mine?.status === 'done'
  const done = r.challenges.filter(c => c.status === 'done').length
  const cta = unlocked ? (done ? 'Lire les avis' : 'Ouvrir') : mine ? 'Ouvrir' : 'Relever le défi'
  return (
    <article className={`panel card k-${r.work.kind}`}>
      <Who p={r.sender} me={me} text={(r.reply_to ? 'répond avec' : 'recommande') + (showCircle && r.circle ? ` dans ${r.circle.name}` : '')} date={r.sent_at} />
      <Link href={`/r/${r.id}`} className="reco-head">
        <Cover w={r.work} />
        <div>
          <div className="work t-l">{r.work.title}</div>
          <WorkMeta w={r.work} effort={r.effort} />
          {r.why && <p className="why">« {r.why} »</p>}
        </div>
      </Link>
      {r.challenges.length > 0 && (
        <div className="recips">{r.challenges.map(c => <StatusChip key={c.user_id} c={c} kind={r.work.kind} me={me} />)}</div>
      )}
      <div className="actions">
        <span className="meta" style={{ flex: 1 }}>
          {done === 0 ? 'Pas encore d’avis' : unlocked ? `${done} avis, salon ouvert` : `${done} avis scellé${done > 1 ? 's' : ''}`}
        </span>
        <Link className="btn small ghost" href={`/r/${r.id}`}>{cta}</Link>
      </div>
    </article>
  )
}
