'use client'

import { A } from './app/router'
import { kindOf } from '@/lib/kinds'
import { daysLeft, fmtDate, starsTxt } from '@/lib/format'
import type { Challenge, Person, Work } from '@/lib/types'

export const nameOf = (p: Person | null | undefined, me?: string) =>
  p && p.id === me ? 'Toi' : p?.display_name || 'Quelqu’un'

export function Avatar({ p, size = 26 }: { p?: Person | null; size?: number }) {
  if (!p) return null
  if (p.avatar_url) return <img className="av" src={p.avatar_url} alt="" width={size} height={size} referrerPolicy="no-referrer" style={{ width: size, height: size }} />
  const hue = [...p.id].reduce((a, c) => a + c.charCodeAt(0), 0) % 360
  return (
    <span className="av" aria-hidden style={{ width: size, height: size, background: `hsl(${hue} 50% 45%)` }}>
      {(p.display_name || '?').trim().charAt(0).toUpperCase()}
    </span>
  )
}

const FOLIO = ['orrery', 'liseuse', 'lettre', 'tricheur', 'lune'] as const
const FOLIO_DEEP = { orrery: '#1C130C', liseuse: '#3B2F1B', lettre: '#283024', tricheur: '#1B130E', lune: '#25221B' }
const hash = (s: string) => { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h) }

type CoverWork = Pick<Work, 'kind' | 'cover_url'> & { title?: string | null; id?: string }

/* Sans jaquette, l'œuvre reçoit une couverture « collection classique » :
   un détail de tableau et son titre, comme un livre de poche illustré. Jamais un simple aplat. */
export function Cover({ w, size = 'm' }: { w: CoverWork; size?: 's' | 'm' | 'l' | 'g' }) {
  if (w.cover_url) return <img className={`cover cover-${size}`} src={w.cover_url} alt="" loading="lazy" />
  const seed = hash(w.title || w.id || w.kind)
  const k = FOLIO[seed % FOLIO.length]
  const pos = `${20 + (seed % 61)}% ${20 + ((seed >> 3) % 51)}%`
  return (
    <span className={`cover cover-${size} folio`} style={{ ['--folio' as string]: FOLIO_DEEP[k] }} aria-hidden>
      <img src={`/art/${k}.jpg`} alt="" loading="lazy" style={{ objectPosition: pos }} onError={e => { e.currentTarget.style.display = 'none' }} />
      {size !== 's' && (
        <span className="folio-band">
          <span className="folio-kind">{kindOf(w.kind).label}</span>
          <span className="folio-title">{w.title}</span>
        </span>
      )}
    </span>
  )
}

const FRAMES = ['white', 'gold', 'black', 'wood', 'white', 'gold'] as const

/* Chaque œuvre reçoit son propre cadre, comme dans un accrochage de salon */
export function Framed({ w, size = 'm', plain = false }: { w: CoverWork; size?: 's' | 'm' | 'l' | 'g'; plain?: boolean }) {
  const style = plain || size === 's' ? 'white' : FRAMES[hash((w.id ?? '') + (w.title ?? '')) % FRAMES.length]
  return <span className={`frame frame-${style}`}><Cover w={w} size={size} /></span>
}

export function WorkMeta({ w, effort }: { w: Pick<Work, 'kind' | 'creator' | 'year'>; effort?: string | null }) {
  const extra = [w.creator, w.year].filter(Boolean).join(', ')
  return (
    <div className="meta">
      <span className="kind">{kindOf(w.kind).label}</span>
      {extra ? `, ${extra}` : ''}
      {effort ? ` · ${effort}` : ''}
    </div>
  )
}

export function StarsView({ n }: { n?: number | null }) {
  if (!n) return null
  return <span className="rv" aria-label={`${n} sur 5`}>{starsTxt(n)}</span>
}

export function Countdown({ c, kind }: { c: Pick<Challenge, 'status' | 'deadline' | 'started_at'>; kind: string }) {
  const k = kindOf(kind)
  if (c.status === 'done') return <div className="days done">✓<small>{k.done}</small></div>
  if (c.status === 'dropped') return <div className="days">–<small>Abandon</small></div>
  const left = daysLeft(c.deadline)
  if (left < 0) return <div className="days late">{-left}<small>j de retard</small></div>
  return <div className="days">{left}<small>jour{left > 1 ? 's' : ''}</small></div>
}

export function TrackBar({ c }: { c: Pick<Challenge, 'deadline' | 'started_at'> }) {
  const end = new Date(c.deadline).getTime(), start = new Date(c.started_at).getTime()
  const pct = Math.max(0, Math.min(100, ((end - Date.now()) / Math.max(1, end - start)) * 100))
  return <div className="track"><span style={{ width: `${pct}%` }} /></div>
}

export function StatusChip({ c, kind, me, href }: { c: Challenge; kind: string; me: string; href?: string }) {
  const k = kindOf(kind)
  const late = c.status === 'active' && daysLeft(c.deadline) < 0
  const label = c.status === 'done' ? k.done : c.status === 'dropped' ? 'Abandon' : late ? 'En retard' : 'En cours'
  const inner = <><Avatar p={c.user} size={22} />{nameOf(c.user, me)} · {label}</>
  const cls = `st ${c.status}${late ? ' late' : ''}`
  return href ? <A className={cls} href={href}>{inner}</A> : <span className={cls}>{inner}</span>
}

export function Who({ p, me, text, date }: { p: Person | null; me: string; text: string; date?: string }) {
  return (
    <div className="who"><Avatar p={p} /><span>{nameOf(p, me)} {text}{date ? `, le ${fmtDate(date)}` : ''}</span></div>
  )
}
