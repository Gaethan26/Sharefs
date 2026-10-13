'use client'

import { useEffect, useState } from 'react'
import { KINDS, KIND_LIST, type Kind } from '@/lib/kinds'
import type { WorkInput } from '@/lib/types'
import { Cover } from './ui'

/** Recherche dans les catalogues (TMDB, Google Books, RAWG) ou saisie manuelle */
export function WorkPicker({ enabled, onPick, actionLabel, selectedKey }: {
  enabled: Record<Kind, boolean>; onPick: (w: WorkInput) => void | Promise<void>; actionLabel: string; selectedKey?: string | null
}) {
  const [kind, setKind] = useState<Kind>('film')
  const [q, setQ] = useState('')
  const [results, setResults] = useState<WorkInput[]>([])
  const [state, setState] = useState<'idle' | 'loading' | 'error' | 'empty'>('idle')
  const [manual, setManual] = useState(false)
  const [m, setM] = useState({ title: '', creator: '', year: '' })
  const [err, setErr] = useState('')
  const searchable = enabled[kind]

  useEffect(() => {
    const term = q.trim()
    if (!searchable || term.length < 2) { setResults([]); setState('idle'); return }
    const ctl = new AbortController()
    const t = setTimeout(async () => {
      setState('loading')
      try {
        const res = await fetch(`/api/catalog?kind=${kind}&q=${encodeURIComponent(term)}`, { signal: ctl.signal })
        const j = await res.json()
        setResults(j.results ?? [])
        setState(j.results?.length ? 'idle' : 'empty')
      } catch { if (!ctl.signal.aborted) setState('error') }
    }, 350)
    return () => { clearTimeout(t); ctl.abort() }
  }, [q, kind, searchable])

  async function submitManual() {
    setErr('')
    if (!m.title.trim()) { setErr('Indique un titre.'); return }
    if (m.year && !/^\d{4}$/.test(m.year)) { setErr('L’année doit avoir 4 chiffres.'); return }
    await onPick({ kind, title: m.title.trim(), creator: m.creator.trim() || null, year: m.year ? Number(m.year) : null, source: 'manual' })
    setM({ title: '', creator: '', year: '' })
  }

  return (
    <div>
      <div className="chips" role="group" aria-label="Type">
        {KIND_LIST.map(k => (
          <button key={k} type="button" className="chip" aria-pressed={kind === k} onClick={() => setKind(k)}>{KINDS[k].label}</button>
        ))}
      </div>
      {!manual && searchable ? (
        <>
          <input type="search" value={q} onChange={e => setQ(e.target.value)} aria-label="Rechercher un titre"
            placeholder={kind === 'livre' ? 'Titre ou auteur' : 'Titre'} autoComplete="off" />
          {state === 'loading' && <p className="meta">Recherche…</p>}
          {state === 'empty' && <p className="meta">Aucun résultat. Essaie un autre titre ou saisis-le à la main.</p>}
          {state === 'error' && <p className="err">Recherche indisponible. Saisis la référence à la main.</p>}
          {results.length > 0 && (
            <ul className="results">
              {results.map(w => {
                const key = `${w.source}:${w.external_id}`
                return (
                  <li key={key}>
                    <button type="button" className="result" aria-pressed={selectedKey === key} onClick={() => onPick(w)}>
                      <Cover w={{ kind: w.kind, cover_url: w.cover_url ?? null }} size="s" />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span className="work" style={{ display: 'block' }}>{w.title}</span>
                        <span className="meta">{[w.creator, w.year].filter(Boolean).join(', ')}</span>
                      </span>
                      <span className="btn small ghost">{actionLabel}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          <p className="meta" style={{ marginTop: 10 }}>
            Introuvable ? <button type="button" className="linkbtn" onClick={() => setManual(true)}>Saisir à la main</button>
          </p>
        </>
      ) : (
        <>
          {!searchable && <p className="meta" style={{ marginTop: 0 }}>Recherche non configurée pour ce type : saisis la référence.</p>}
          <div className="row">
            <div className="grow"><label className="f" htmlFor="m-title">Titre</label><input id="m-title" value={m.title} maxLength={200} onChange={e => setM({ ...m, title: e.target.value })} /></div>
          </div>
          <div className="row">
            <div className="grow"><label className="f" htmlFor="m-by">{KINDS[kind].by}</label><input id="m-by" value={m.creator} maxLength={120} onChange={e => setM({ ...m, creator: e.target.value })} /></div>
            <div><label className="f" htmlFor="m-year">Année</label><input id="m-year" inputMode="numeric" maxLength={4} value={m.year} onChange={e => setM({ ...m, year: e.target.value })} /></div>
          </div>
          {err && <p className="err">{err}</p>}
          <div className="actions">
            <button type="button" className="btn" onClick={submitManual}>{actionLabel}</button>
            {searchable && <button type="button" className="linkbtn" onClick={() => setManual(false)}>Revenir à la recherche</button>}
          </div>
        </>
      )}
    </div>
  )
}
