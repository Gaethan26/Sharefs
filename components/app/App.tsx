'use client'

import { useCallback, useEffect, useState } from 'react'
import { A, parseRoute, useLocation } from './router'
import { StoreProvider, useStore } from './store'
import { TintCtx } from './tint'
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
  catalog: Record<Kind, boolean>; art: { orrery: string | null; lune: string | null }
}

export function App(props: Props) {
  return (
    <StoreProvider userId={props.userId} email={props.email}>
      <Shell {...props} />
    </StoreProvider>
  )
}

const NAV = [
  { href: '/a-faire', label: 'À faire', match: ['todo', 'reco'] },
  { href: '/liste', label: 'Ma galerie', match: ['library'] },
  { href: '/groupes', label: 'Groupes', match: ['groups', 'group'] },
  { href: '/profil', label: 'Profil', match: ['profile', 'user'] },
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
    const titles: Record<string, string> = { todo: 'À faire', library: 'Ma galerie', groups: 'Groupes', group: 'Groupe', reco: 'Œuvre', send: 'Recommander', profile: 'Profil', user: 'Profil' }
    document.title = titles[route.name] ? `${titles[route.name]}, Tu verras…` : 'Tu verras…'
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
    case 'todo': view = <Todo art={art} />; break
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
      <div className={`app${tint ? ' has-tint' : ''}`} style={tint ? { ['--page' as string]: tint.soft, ['--page-deep' as string]: tint.deep } : undefined}>
        <header className="top">
          <div className="top-in">
            <A href="/a-faire" className="brand">Tu verras…</A>
            <nav className="tabs" aria-label="Navigation principale">
              {NAV.map(n => (
                <A key={n.href} href={n.href} className="tab" aria-current={n.match.includes(route.name) ? 'page' : undefined}>
                  {n.label}{n.href === '/a-faire' && s.pending ? <span className="count">{s.pending}</span> : null}
                </A>
              ))}
            </nav>
            <A href="/envoyer" className="btn small">Recommander</A>
          </div>
        </header>
        <main className="wrap">{view}</main>
        <Toast msg={s.toast} onDone={clearToast} />
      </div>
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
