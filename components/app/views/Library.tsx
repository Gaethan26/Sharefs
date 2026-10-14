'use client'

import { useEffect, useState } from 'react'
import { A } from '../router'
import { useStore, type Item } from '../store'
import { usePalette } from '../palette'
import { RoomHeader } from '../RoomHeader'
import { paletteVars } from '@/lib/palettes'
import { KINDS, KIND_LIST, kindOf, type Kind } from '@/lib/kinds'
import { Framed } from '@/components/ui'
import { QuickAdd } from '@/components/QuickAdd'
import type { WorkInput } from '@/lib/types'

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

export function Library({ catalog }: { catalog: Record<Kind, boolean> }) {
  const s = useStore()
  const [filter, setFilter] = useState<Kind | null>(null)
  const [view, setView] = useState<'galerie' | 'liste'>('galerie')
  useEffect(() => { try { const v = localStorage.getItem('tv-view'); if (v === 'liste' || v === 'galerie') setView(v) } catch { /* rien */ } }, [])
  const pickView = (v: 'galerie' | 'liste') => { setView(v); try { localStorage.setItem('tv-view', v) } catch { /* rien */ } }
  const items = filter ? s.library.filter(i => i.work.kind === filter) : s.library

  async function add(w: WorkInput) {
    if (s.library.some(i => i.work.kind === w.kind && same(i.work.title, w.title))) { s.setToast(`« ${w.title} » est déjà dans ta galerie`); return }
    const r = await s.addToLibrary(w)
    if (r.error) s.setToast(r.error)
  }

  return (
    <>
      <RoomHeader k="liseuse" title="Ma galerie" sub="Les œuvres qui t’ont construit. Tes amis peuvent la parcourir et y piocher." />
      <section className="panel">
        <QuickAdd enabled={catalog} onAdd={add} />
      </section>
      <div className="lib-bar">
        <div className="chips" role="group" aria-label="Filtrer">
          <button className="chip" aria-pressed={!filter} onClick={() => setFilter(null)}>Tout ({s.library.length})</button>
          {KIND_LIST.map(k => (
            <button key={k} className="chip" aria-pressed={filter === k} onClick={() => setFilter(k)}>
              {KINDS[k].plural} ({s.library.filter(i => i.work.kind === k).length})
            </button>
          ))}
        </div>
        <div className="seg small" role="group" aria-label="Affichage">
          <button aria-pressed={view === 'galerie'} onClick={() => pickView('galerie')}>Galerie</button>
          <button aria-pressed={view === 'liste'} onClick={() => pickView('liste')}>Liste</button>
        </div>
      </div>
      {!items.length
        ? <p className="empty">{s.library.length ? 'Rien dans cette catégorie.' : 'Ta galerie est vide. Tape un titre ci-dessus, puis Entrée.'}</p>
        : view === 'galerie'
          ? <ul className="gallery">{items.map(i => <Tile key={i.id} i={i} />)}</ul>
          : <ul className="list panel">{items.map(i => <Line key={i.id} i={i} />)}</ul>}
    </>
  )
}

function Actions({ i }: { i: Item }) {
  const s = useStore()
  if (i.id.startsWith('tmp-')) return <span className="meta">Ajout…</span>
  return (
    <>
      <A className="btn small" href={`/envoyer?work=${i.work.id}`}>Recommander</A>
      <button className="btn small ghost" aria-label={`Retirer ${i.work.title}`} onClick={async () => { const r = await s.removeItem(i.id); if (r.error) s.setToast(r.error) }}>Retirer</button>
    </>
  )
}

function Tile({ i }: { i: Item }) {
  const p = usePalette(i.work.cover_url)
  return (
    <li className={`tile tinted${i.id.startsWith('tmp-') ? ' pending' : ''}`} style={paletteVars(p)}>
      <Framed w={i.work} size="g" />
      <div className="cartel">
        <span className="cartel-title">{i.work.title}</span>
        <span className="kind">{kindOf(i.work.kind).label}</span>
      </div>
      {i.note && <p className="tile-note">{i.note}</p>}
      <div className="tile-actions"><Actions i={i} /></div>
    </li>
  )
}

function Line({ i }: { i: Item }) {
  return (
    <li className={`item${i.id.startsWith('tmp-') ? ' pending' : ''}`}>
      <Framed w={i.work} size="s" />
      <div className="body">
        <div className="work">{i.work.title}</div>
        <div className="meta"><span className="kind">{kindOf(i.work.kind).label}</span>{i.note ? `, ${i.note}` : ''}</div>
      </div>
      <div className="side"><Actions i={i} /></div>
    </li>
  )
}
