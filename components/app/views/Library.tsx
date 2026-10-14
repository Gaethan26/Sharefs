'use client'

import { useState } from 'react'
import { A } from '../router'
import { useStore, type Item } from '../store'
import { usePalette } from '../palette'
import { usePageTint } from '../tint'
import { paletteVars } from '@/lib/palettes'
import { KINDS, KIND_LIST, kindOf, type Kind } from '@/lib/kinds'
import { Framed } from '@/components/ui'
import { WorkPicker } from '@/components/WorkPicker'

export function Library({ catalog }: { catalog: Record<Kind, boolean> }) {
  const s = useStore()
  usePageTint(null)
  const [filter, setFilter] = useState<Kind | null>(null)
  const items = filter ? s.library.filter(i => i.work.kind === filter) : s.library
  return (
    <>
      <h1>Ma galerie</h1>
      <p className="sub">Les œuvres qui t’ont construit. Tes amis peuvent la parcourir et y piocher.</p>
      <section className="panel">
        <h3>Accrocher une œuvre</h3>
        <WorkPicker enabled={catalog} actionLabel="Ajouter" onPick={async w => {
          const r = await s.addToLibrary(w)
          s.setToast(r.error ?? `« ${w.title} » ajouté à ta galerie`)
        }} />
      </section>
      <div className="chips" role="group" aria-label="Filtrer" style={{ marginTop: 30 }}>
        <button className="chip" aria-pressed={!filter} onClick={() => setFilter(null)}>Tout ({s.library.length})</button>
        {KIND_LIST.map(k => (
          <button key={k} className="chip" aria-pressed={filter === k} onClick={() => setFilter(k)}>
            {KINDS[k].plural} ({s.library.filter(i => i.work.kind === k).length})
          </button>
        ))}
      </div>
      {items.length
        ? <ul className="gallery">{items.map(i => <Tile key={i.id} i={i} />)}</ul>
        : <p className="empty">{s.library.length ? 'Rien dans cette catégorie.' : 'Ta galerie est vide. Cherche une œuvre ci-dessus pour l’accrocher.'}</p>}
    </>
  )
}

function Tile({ i }: { i: Item }) {
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
        <A className="btn small" href={`/envoyer?work=${i.work.id}`}>Recommander</A>
        <button className="btn small ghost" aria-label={`Retirer ${i.work.title}`} onClick={async () => { const r = await s.removeItem(i.id); if (r.error) s.setToast(r.error) }}>Retirer</button>
      </div>
    </li>
  )
}
