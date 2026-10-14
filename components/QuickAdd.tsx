'use client'

import { useEffect, useRef, useState } from 'react'
import { KINDS, KIND_LIST, type Kind } from '@/lib/kinds'
import type { WorkInput } from '@/lib/types'
import { Cover } from './ui'

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()

/* Ajout rapide, comme une liste : un titre, Entrée, c'est ajouté.
   Les suggestions (avec jaquette) sont facultatives. Coller plusieurs lignes ajoute tout d'un coup. */
export function QuickAdd({ enabled, onAdd, mode = 'add' }: {
  enabled: Record<Kind, boolean>; onAdd: (w: WorkInput) => Promise<void> | void; mode?: 'add' | 'pick'
}) {
  const [kind, setKind] = useState<Kind>('film')
  const [q, setQ] = useState('')
  const [sugg, setSugg] = useState<WorkInput[]>([])
  const [hi, setHi] = useState(-1)
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => { try { const k = localStorage.getItem('tv-kind') as Kind | null; if (k && k in KINDS) setKind(k) } catch { /* stockage indisponible */ } }, [])
  const pickKind = (k: Kind) => { setKind(k); try { localStorage.setItem('tv-kind', k) } catch { /* rien */ } input.current?.focus() }

  useEffect(() => {
    const term = q.trim()
    setHi(-1)
    if (!enabled[kind] || term.length < 2) { setSugg([]); return }
    const ctl = new AbortController()
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/catalog?kind=${kind}&q=${encodeURIComponent(term)}`, { signal: ctl.signal })
        const j = await res.json()
        setSugg((j.results ?? []).slice(0, 5))
      } catch { /* pas de suggestion, la saisie libre reste possible */ }
    }, 280)
    return () => { clearTimeout(t); ctl.abort() }
  }, [q, kind, enabled])

  async function add(w: WorkInput) {
    setBusy(true)
    await onAdd(w)
    setBusy(false)
    setQ(''); setSugg([]); setHi(-1)
    input.current?.focus()
  }
  function submitTyped() {
    const title = q.trim()
    if (!title) return
    if (hi >= 0 && sugg[hi]) return add(sugg[hi])
    const exact = sugg.find(s => norm(s.title) === norm(title))   // titre identique : on prend la jaquette
    add(exact ?? { kind, title, source: 'manual' })
  }
  async function onPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const lines = e.clipboardData.getData('text').split(/\r?\n/).map(l => l.replace(/^[-*•\d.)\s]+/, '').trim()).filter(Boolean)
    if (lines.length < 2 || mode === 'pick') return
    e.preventDefault()
    setBusy(true)
    for (const title of lines.slice(0, 50)) await onAdd({ kind, title: title.slice(0, 200), source: 'manual' })
    setBusy(false)
  }

  return (
    <div className="quick">
      <div className="seg" role="group" aria-label="Type d’œuvre">
        {KIND_LIST.map(k => <button key={k} type="button" aria-pressed={kind === k} onClick={() => pickKind(k)}>{KINDS[k].label}</button>)}
      </div>
      <div className="quick-field">
        <input ref={input} value={q} disabled={busy} autoComplete="off" enterKeyHint="done"
          placeholder={mode === 'pick' ? `Titre du ${KINDS[kind].label.toLowerCase()} à recommander` : `Ajoute un ${KINDS[kind].label.toLowerCase()}, puis Entrée`}
          aria-label="Titre" onChange={e => setQ(e.target.value)} onPaste={onPaste}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); submitTyped() }
            else if (e.key === 'ArrowDown' && sugg.length) { e.preventDefault(); setHi(h => Math.min(h + 1, sugg.length - 1)) }
            else if (e.key === 'ArrowUp' && sugg.length) { e.preventDefault(); setHi(h => Math.max(h - 1, -1)) }
            else if (e.key === 'Escape') { setSugg([]); setHi(-1) }
          }} />
        <button type="button" className="btn" disabled={busy || !q.trim()} onClick={submitTyped}>{mode === 'pick' ? 'Choisir' : 'Ajouter'}</button>
      </div>
      {sugg.length > 0 && (
        <ul className="sugg" role="listbox" aria-label="Suggestions">
          {sugg.map((s, i) => (
            <li key={`${s.source}:${s.external_id}`}>
              <button type="button" role="option" aria-selected={i === hi} onMouseDown={e => e.preventDefault()} onClick={() => add(s)}>
                <Cover w={{ kind: s.kind, cover_url: s.cover_url ?? null }} size="s" />
                <span className="work">{s.title}</span>
                {s.year ? <span className="meta">{s.year}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
      {mode === 'add' && <p className="meta quick-hint">Astuce : colle une liste de titres, un par ligne, pour tout ajouter d’un coup.</p>}
    </div>
  )
}
