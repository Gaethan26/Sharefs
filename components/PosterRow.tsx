'use client'

import { usePalette } from './app/palette'
import { paletteVars } from '@/lib/palettes'
import type { Poster } from '@/lib/catalog'

/* Chaque affiche repose sur un fond tiré de ses propres couleurs */
export function PosterRow({ posters }: { posters: Poster[] }) {
  return <ul className="poster-row">{posters.map(p => <PosterItem key={p.title} p={p} />)}</ul>
}

function PosterItem({ p }: { p: Poster }) {
  const pal = usePalette(p.poster)
  return (
    <li className="tinted" style={paletteVars(pal)}>
      <span className="frame"><img src={p.poster} alt={`Affiche : ${p.title}`} loading="lazy" /></span>
      <div className="cartel"><span className="cartel-title">{p.title}</span><span className="cartel-meta">{p.year}</span></div>
    </li>
  )
}
