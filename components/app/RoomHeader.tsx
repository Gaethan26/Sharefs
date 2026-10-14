'use client'

import { createContext, useContext } from 'react'
import { ART_PALETTES, paletteVars, type Palette } from '@/lib/palettes'
import { usePageTint } from './tint'

export type ArtKey = keyof typeof ART_PALETTES
export type ArtMap = Record<ArtKey, string | null>
export const ArtCtx = createContext<ArtMap>({ orrery: null, liseuse: null, lettre: null, tricheur: null, lune: null })

const META: Record<ArtKey, { artist: string; title: string; pos: string }> = {
  orrery: { artist: 'Joseph Wright of Derby', title: 'Un philosophe faisant une conférence sur le planétaire', pos: '50% 42%' },
  liseuse: { artist: 'Jean-Honoré Fragonard', title: 'La Liseuse', pos: '50% 30%' },
  lettre: { artist: 'Johannes Vermeer', title: 'Jeune fille lisant une lettre à une fenêtre', pos: '45% 38%' },
  tricheur: { artist: 'Georges de La Tour', title: 'Le Tricheur à l’as de carreau', pos: '50% 32%' },
  lune: { artist: 'Caspar David Friedrich', title: 'Deux hommes contemplant la lune', pos: '55% 45%' },
}

/* En-tête de chaque onglet : un tableau, et toute la page prend ses couleurs */
export function RoomHeader({ k, title, sub, children }: { k: ArtKey; title: React.ReactNode; sub?: React.ReactNode; children?: React.ReactNode }) {
  const art = useContext(ArtCtx)
  const p = ART_PALETTES[k]
  usePageTint(p)
  const m = META[k]
  return (
    <section className="room-head" style={paletteVars(p)}>
      {art[k] && <img className="backdrop-img" src={art[k]!} alt="" aria-hidden style={{ objectPosition: m.pos }} />}
      <p className="cartel-mini"><span>{m.artist}</span><em>{m.title}</em></p>
      <div className="room-head-in">
        <div><h1>{title}</h1>{sub && <p>{sub}</p>}</div>
        {children}
      </div>
    </section>
  )
}

/* Variante pour un salon ou un ami : une mosaïque de leurs jaquettes */
export function MosaicHeader({ covers, palette, title, sub, children }: { covers: string[]; palette: Palette; title: React.ReactNode; sub?: React.ReactNode; children?: React.ReactNode }) {
  usePageTint(palette)
  const tiles = covers.slice(0, 8)
  return (
    <section className="room-head" style={paletteVars(palette)}>
      {tiles.length > 0 && <div className="mosaic" aria-hidden>{tiles.map((c, i) => <img key={i} src={c} alt="" />)}</div>}
      <div className="room-head-in">
        <div><h1>{title}</h1>{sub && <p>{sub}</p>}</div>
        {children}
      </div>
    </section>
  )
}
