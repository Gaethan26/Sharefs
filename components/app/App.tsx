'use client'

import { useCallback, useEffect, useState } from 'react'
import { A, parseRoute, useLocation } from './router'
import { StoreProvider, useStore } from './store'
import { TintCtx } from './tint'
import { ArtCtx, type ArtMap } from './RoomHeader'
import type { Palette } from '@/lib/palettes'
import type { Kind } from '@/lib/kinds'
import { Toast } from '@/components/client'
import { Todo } from './views/Todo'
import { Library } from './views/Library'
import { Group, Groups } from './views/Groups'
import { Reco } from './views/Reco'
import { Send } from './views/Send'
import { Profile, UserView } from './views/Profile'

type Props = {
  userId: string; email: string; appUrl: string; ai: boolean
  catalog: Record<Kind, boolean>; art: ArtMap
}

export function App(props: Props) {
  return (
    <StoreProvider userId={props.userId} email={props.email}>
      <Shell {...props} />
    </StoreProvider>
  )
}

const I = (d: string) => <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>
const NAV = [
  { href: '/a-faire', label: 'À découvrir', match: ['todo', 'reco'], icon: I('M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2') },
  { href: '/liste', label: 'Ma galerie', match: ['library'], icon: I('M4 5h16v14H4zM8 15l3-3 2 2 3-4 2 3') },
  { href: '/groupes', label: 'Salons', match: ['groups', 'group'], icon: I('M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM16 11a3 3 0 1 0 0-6M2 20c0-3 3-5 6-5s6 2 6 5M16 15c3 0 6 2 6 5') },
  { href: '/profil', label: 'Atelier', match: ['profile', 'user'], icon: I('M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 4-6 8-6s8 2 8 6') },
]

function Shell({ appUrl, ai, catalog, art }: Props) {
  const s = useStore()
  const loc = useLocation()
  const route = parseRoute(loc)
  const [tint, setTint] = useState<Palette | null>(null)
  const set = useCallback((p: Palette | null) => setTint(p), [])
  const clearToast = useCallback(() => s.setToast(''), [s])

  // Ancre (#finir, #salon) au premier affichage, une fois les données chargées
  useEffect(() => {
    if (!s.ready || !window.location.hash) return
    requestAnimationFrame(() => document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ block: 'start' }))
  }, [s.ready])

  useEffect(() => {
    const titles: Record<string, string> = { todo: 'À découvrir', library: 'Ma galerie', groups: 'Salons', group: 'Salon', reco: 'Œuvre', send: 'Partager', profile: 'Atelier', user: 'Galerie' }
    document.title = titles[route.name] ? `${titles[route.name]} | Sharefs` : 'Sharefs'
  }, [route.name])

  let view: React.ReactNode
  if (!s.ready || route.name === 'loading') view = <Skeleton />
  else if (s.fatal) view = (
    <div className="notice" role="alert">
      <strong>Impossible de charger tes données.</strong>
      <p className="meta" style={{ margin: '6px 0 0' }}>Message de la base : {s.fatal}</p>
    </div>
  )
  else switch (route.name) {
    case 'todo': view = <Todo />; break
    case 'library': view = <Library catalog={catalog} />; break
    case 'groups': view = <Groups />; break
    case 'group': view = <Group id={route.id} appUrl={appUrl} />; break
    case 'reco': view = <Reco id={route.id} />; break
    case 'send': view = <Send work={route.work} circle={route.circle} reply={route.reply} ai={ai} catalog={catalog} />; break
    case 'profile': view = <Profile />; break
    case 'user': view = <UserView id={route.id} />; break
    default: view = <div className="empty"><h1>Page introuvable</h1><A className="btn" href="/a-faire">Retour</A></div>
  }

  return (
    <TintCtx.Provider value={set}>
      <ArtCtx.Provider value={art}>
      <div className={`app${tint ? ' has-tint' : ''}`} style={tint ? { ['--page' as string]: tint.soft, ['--page-deep' as string]: tint.deep, ['--page-mid' as string]: tint.mid } : undefined}>
        <header className="top">
          <div className="top-in">
            <A href="/a-faire" className="brand" aria-label="Sharefs, accueil"><span className="logo">Sharefs</span><span className="tagline">Tu verras<span className="dots">…</span></span></A>
            <nav className="tabs" aria-label="Navigation principale">
              {NAV.map(n => (
                <A key={n.href} href={n.href} className="tab" aria-current={n.match.includes(route.name) ? 'page' : undefined}>
                  {n.icon}<span>{n.label}</span>{n.href === '/a-faire' && s.pending ? <span className="count">{s.pending}</span> : null}
                </A>
              ))}
            </nav>
            <A href="/envoyer" className="btn small">Partager</A>
          </div>
        </header>
        <main className="wrap">{view}</main>
        <Toast msg={s.toast} onDone={clearToast} />
      </div>
      </ArtCtx.Provider>
    </TintCtx.Provider>
  )
}

function Skeleton() {
  return (
    <div aria-busy="true" aria-label="Chargement">
      <div className="sk sk-banner" />
      <div className="sk sk-card" /><div className="sk sk-card" />
    </div>
  )
}
