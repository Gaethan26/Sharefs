'use client'

import { A } from './app/router'
import { usePalette } from './app/palette'
import { paletteVars } from '@/lib/palettes'
import { Framed, StatusChip, Who, WorkMeta } from './ui'
import type { Reco } from '@/lib/types'

/* Carte d'œuvre : son fond prend la couleur de la jaquette */
export function RecoCard({ r, me, showCircle = false }: { r: Reco; me: string; showCircle?: boolean }) {
  const p = usePalette(r.work.cover_url)
  const mine = r.challenges.find(c => c.user_id === me)
  const unlocked = r.sender_id === me || mine?.status === 'done'
  const done = r.challenges.filter(c => c.status === 'done').length
  const cta = unlocked ? (done ? 'Lire les avis' : 'Ouvrir') : mine ? 'Ouvrir' : 'Relever le défi'
  return (
    <article className="reco-card tinted" style={paletteVars(p)}>
      <A href={`/r/${r.id}`} aria-hidden tabIndex={-1}><Framed w={r.work} size="m" /></A>
      <div style={{ minWidth: 0 }}>
        <Who p={r.sender} me={me} text={(r.reply_to ? 'répond avec' : 'recommande') + (showCircle && r.circle ? ` dans ${r.circle.name}` : '')} date={r.sent_at} />
        <A href={`/r/${r.id}`} className="reco-head" style={{ marginTop: 6 }}>
          <div><div className="work t-l">{r.work.title}</div><WorkMeta w={r.work} effort={r.effort} /></div>
        </A>
        {r.why && <p className="why">« {r.why} »</p>}
        {r.challenges.length > 0 && (
          <div className="recips">{r.challenges.map(c => <StatusChip key={c.user_id} c={c} kind={r.work.kind} me={me} />)}</div>
        )}
        <div className="actions">
          <span className="meta" style={{ flex: 1 }}>
            {done === 0 ? 'Pas encore d’avis' : unlocked ? `${done} avis, échanges ouverts` : `${done} avis scellé${done > 1 ? 's' : ''}`}
          </span>
          <A className="btn small ghost" href={`/r/${r.id}`}>{cta}</A>
        </div>
      </div>
    </article>
  )
}
