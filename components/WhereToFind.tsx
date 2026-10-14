'use client'

import { useEffect, useState } from 'react'
import { searchLinks, type Providers } from '@/lib/links'
import type { Work } from '@/lib/types'

export function WhereToFind({ w, link }: { w: Work; link?: string | null }) {
  const [prov, setProv] = useState<Providers | null>(null)
  useEffect(() => {
    setProv(null)
    if (!w.source?.startsWith('tmdb-') || !w.external_id) return
    let alive = true
    fetch(`/api/providers?source=${encodeURIComponent(w.source)}&id=${encodeURIComponent(w.external_id)}`)
      .then(r => (r.ok ? r.json() : null)).then(j => { if (alive) setProv(j) }).catch(() => {})
    return () => { alive = false }
  }, [w.source, w.external_id])
  const groups = prov ? [
    { label: 'En streaming', items: prov.flatrate }, { label: 'En location', items: prov.rent }, { label: 'À l’achat', items: prov.buy },
  ].filter(g => g.items.length) : []
  return (
    <div>
      {groups.length > 0 && (
        <div className="prov">
          {groups.map(g => (
            <div key={g.label} className="grp">
              <span className="meta">{g.label}</span>
              {g.items.slice(0, 5).map(p => <img key={p.name} src={p.logo} alt={p.name} title={p.name} />)}
            </div>
          ))}
        </div>
      )}
      <div className="links">
        {link && <a className="own" href={link} target="_blank" rel="noopener noreferrer">Lien envoyé</a>}
        {prov?.link && <a href={prov.link} target="_blank" rel="noopener noreferrer">Toutes les offres en France</a>}
        {searchLinks(w).map(l => <a key={l.label} href={l.url} target="_blank" rel="noopener noreferrer">{l.label}</a>)}
      </div>
      {groups.length > 0 && <p className="meta" style={{ margin: '8px 0 0' }}>Disponibilités : JustWatch via TMDB.</p>}
    </div>
  )
}
