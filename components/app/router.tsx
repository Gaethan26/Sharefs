'use client'

import { useSyncExternalStore } from 'react'

/* Routeur côté navigateur : on change l'URL sans recharger la page ni interroger le serveur */
const listeners = new Set<() => void>()
function subscribe(cb: () => void) {
  listeners.add(cb)
  window.addEventListener('popstate', cb)
  return () => { listeners.delete(cb); window.removeEventListener('popstate', cb) }
}
const snapshot = () => window.location.pathname + window.location.search

export function useLocation() {
  return useSyncExternalStore(subscribe, snapshot, () => '')
}

export function navigate(to: string, opts: { replace?: boolean } = {}) {
  const [path, hash] = to.split('#')
  if (path !== snapshot()) {
    window.history[opts.replace ? 'replaceState' : 'pushState'](null, '', to)
    listeners.forEach(l => l())
  }
  requestAnimationFrame(() => {
    const el = hash ? document.getElementById(hash) : null
    if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' })
    else window.scrollTo({ top: 0 })
  })
}

export function A({ href, onClick, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return (
    <a href={href} {...rest} onClick={e => {
      onClick?.(e)
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      e.preventDefault()
      navigate(href)
    }} />
  )
}

export type Route =
  | { name: 'todo' } | { name: 'library' } | { name: 'groups' } | { name: 'group'; id: string }
  | { name: 'reco'; id: string } | { name: 'send'; work: string | null; circle: string | null; reply: string | null }
  | { name: 'profile' } | { name: 'user'; id: string } | { name: 'loading' } | { name: 'notfound' }

export function parseRoute(loc: string): Route {
  if (!loc) return { name: 'loading' }
  const url = new URL(loc, 'http://x')
  const [a, b] = url.pathname.split('/').filter(Boolean)
  const q = url.searchParams
  switch (a) {
    case 'a-faire': return { name: 'todo' }
    case 'liste': return { name: 'library' }
    case 'groupes': return { name: 'groups' }
    case 'g': return b ? { name: 'group', id: b } : { name: 'groups' }
    case 'r': return b ? { name: 'reco', id: b } : { name: 'todo' }
    case 'envoyer': return { name: 'send', work: q.get('work'), circle: q.get('circle'), reply: q.get('reply') }
    case 'profil': return { name: 'profile' }
    case 'u': return b ? { name: 'user', id: b } : { name: 'profile' }
    default: return { name: 'notfound' }
  }
}
