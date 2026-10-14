'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useFormStatus } from 'react-dom'
import { useEffect, useState } from 'react'

export function NavLinks({ pending }: { pending: number }) {
  const path = usePathname()
  const links = [
    { href: '/a-faire', label: 'À faire', badge: pending },
    { href: '/liste', label: 'Ma galerie' },
    { href: '/cercles', label: 'Cercles' },
    { href: '/profil', label: 'Profil' },
  ]
  return (
    <nav className="tabs" aria-label="Navigation principale">
      {links.map(l => {
        const active = path === l.href || path.startsWith(l.href + '/') || (l.href === '/cercles' && path.startsWith('/c/'))
        return (
          <Link key={l.href} href={l.href} className="tab" aria-current={active ? 'page' : undefined}>
            {l.label}{l.badge ? <span className="count">{l.badge}</span> : null}
          </Link>
        )
      })}
    </nav>
  )
}

export function Submit({ children, className = 'btn', pendingText }: { children: React.ReactNode; className?: string; pendingText?: string }) {
  const { pending } = useFormStatus()
  return <button className={className} disabled={pending}>{pending && pendingText ? pendingText : children}</button>
}

export function StarsInput({ value, onChange, clearable = false, label }: { value: number; onChange: (n: number) => void; clearable?: boolean; label: string }) {
  return (
    <div className="stars" role="group" aria-label={label}>
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} type="button" className={n <= value ? 'on' : ''} aria-label={`${n} sur 5`} aria-pressed={n === value}
          onClick={() => onChange(clearable && n === value ? 0 : n)}>★</button>
      ))}
    </div>
  )
}

export function CopyButton({ text, label = 'Copier le lien' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false)
  async function copy() {
    try {
      if (navigator.share && /Mobi/i.test(navigator.userAgent)) { await navigator.share({ title: 'Rejoins mon cercle', url: text }); return }
      await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 2000)
    } catch { /* partage annulé */ }
  }
  return <button type="button" className="btn small" onClick={copy}>{done ? 'Lien copié' : label}</button>
}

export function Toast({ msg, onDone }: { msg: string; onDone: () => void }) {
  useEffect(() => { if (!msg) return; const t = setTimeout(onDone, 2600); return () => clearTimeout(t) }, [msg, onDone])
  return msg ? <div className="toast" role="status">{msg}</div> : null
}
