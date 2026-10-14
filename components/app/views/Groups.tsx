'use client'

import { useState } from 'react'
import { A, navigate } from '../router'
import { useStore } from '../store'
import { usePalette } from '../palette'
import { RoomHeader, MosaicHeader } from '../RoomHeader'
import { ART_PALETTES } from '@/lib/palettes'
import { monthKey } from '@/lib/format'
import { Avatar, nameOf } from '@/components/ui'
import { CopyButton } from '@/components/client'
import { RecoCard } from '@/components/RecoCard'

export function Groups() {
  const s = useStore()
  const [name, setName] = useState(''), [code, setCode] = useState('')
  const [busy, setBusy] = useState<'' | 'create' | 'join'>(''), [err, setErr] = useState('')
  const used = new Set(s.recos.filter(r => r.sender_id === s.userId && !r.reply_to && r.month === monthKey()).map(r => r.circle_id))

  async function create(e: React.FormEvent) {
    e.preventDefault(); if (!name.trim()) return
    setBusy('create'); setErr('')
    const r = await s.createCircle(name)
    setBusy('')
    if (r.error) setErr(r.error); else { setName(''); navigate(`/g/${r.id}`) }
  }
  async function join(e: React.FormEvent) {
    e.preventDefault(); if (!code.trim()) return
    setBusy('join'); setErr('')
    const r = await s.joinCircle(code)
    setBusy('')
    if (r.error) setErr(r.error); else { setCode(''); navigate(`/g/${r.id}`) }
  }

  return (
    <>
      <RoomHeader k="lune" title="Groupes" sub="Un groupe par bande : amis proches, collègues, club de lecture. Une recommandation par mois dans chacun." />
      {err && <div className="notice" role="alert">{err}</div>}
      {s.circles.length > 0 ? (
        <ul className="list panel">
          {s.circles.map(c => (
            <li key={c.id} className="item">
              <div className="body">
                <A href={`/g/${c.id}`} className="work t-l" style={{ fontStyle: 'normal' }}>{c.name}</A>
                <div className="meta">{c.members.length} membre{c.members.length > 1 ? 's' : ''}, {used.has(c.id) ? 'recommandation du mois faite' : 'recommandation du mois à faire'}</div>
              </div>
              <div className="side">
                {!used.has(c.id) && <A className="btn small" href={`/envoyer?circle=${c.id}`}>Recommander</A>}
                <A className="btn small ghost" href={`/g/${c.id}`}>Ouvrir</A>
              </div>
            </li>
          ))}
        </ul>
      ) : <p className="empty">Tu n’as pas encore de groupe. Crée le premier et invite tes amis avec un lien.</p>}
      <div className="row">
        <form onSubmit={create} className="panel">
          <h3>Créer un groupe</h3>
          <label className="f" htmlFor="gname">Nom</label>
          <input id="gname" value={name} onChange={e => setName(e.target.value)} required maxLength={60} placeholder="Les potes du lycée" />
          <div className="actions"><button className="btn" disabled={busy !== ''}>{busy === 'create' ? 'Création…' : 'Créer'}</button></div>
        </form>
        <form onSubmit={join} className="panel">
          <h3>Rejoindre un groupe</h3>
          <label className="f" htmlFor="gcode">Lien ou code d’invitation</label>
          <input id="gcode" value={code} onChange={e => setCode(e.target.value)} required maxLength={200} placeholder="https://…/invite/3fa9c1…" />
          <div className="actions"><button className="btn ghost" disabled={busy !== ''}>{busy === 'join' ? '…' : 'Rejoindre'}</button></div>
        </form>
      </div>
    </>
  )
}

export function Group({ id, appUrl }: { id: string; appUrl: string }) {
  const s = useStore()
  const c = s.circles.find(x => x.id === id)
  const list = s.recos.filter(r => r.circle_id === id)
  const covers = list.map(r => r.work.cover_url).filter((u): u is string => !!u)
  const p = usePalette(covers[0], ART_PALETTES.lune)
  if (!c) return (
    <div className="empty">
      <h1>Groupe introuvable</h1>
      <p>Tu n’en fais pas partie, ou il a été supprimé.</p>
      <A className="btn" href="/groupes">Mes groupes</A>
    </div>
  )
  const used = list.some(r => r.sender_id === s.userId && !r.reply_to && r.month === monthKey())
  const invite = `${appUrl || window.location.origin}/invite/${c.invite_code}`
  return (
    <>
      {covers.length ? (
        <MosaicHeader covers={covers} palette={p} title={c.name} sub={`${c.members.length} membre${c.members.length > 1 ? 's' : ''}. ${used ? 'Ta recommandation du mois est faite ici.' : 'Ta recommandation du mois reste à faire ici.'}`}>
          {!used && <A className="btn" href={`/envoyer?circle=${id}`}>Recommander une œuvre</A>}
        </MosaicHeader>
      ) : (
        <RoomHeader k="lune" title={c.name} sub={`${c.members.length} membre${c.members.length > 1 ? 's' : ''}. Accroche la première œuvre de ce groupe.`}>
          {!used && <A className="btn" href={`/envoyer?circle=${id}`}>Recommander une œuvre</A>}
        </RoomHeader>
      )}
      <section className="panel">
        <h3>Membres</h3>
        <div className="recips" style={{ marginTop: 0 }}>
          {c.members.map(m => (
            <A key={m.id} className="st" href={m.id === s.userId ? '/profil' : `/u/${m.id}`}>
              <Avatar p={m} size={22} />{nameOf(m, s.userId)}{m.role === 'owner' ? ', créateur' : ''}
            </A>
          ))}
        </div>
        <label className="f" htmlFor="invite">Lien d’invitation</label>
        <div className="row">
          <input id="invite" className="grow" readOnly value={invite} onFocus={e => e.currentTarget.select()} />
          <div className="fit"><CopyButton text={invite} /></div>
        </div>
      </section>
      <h2>Les œuvres du groupe</h2>
      {list.length ? <div className="wall">{list.map(r => <RecoCard key={r.id} r={r} me={s.userId} />)}</div>
        : <p className="empty">Aucune œuvre dans ce groupe pour l’instant. Recommande la première.</p>}
      <button className="linkbtn" style={{ marginTop: 30 }} onClick={async () => {
        if (!confirm(`Quitter « ${c.name} » ?`)) return
        const r = await s.leaveCircle(id)
        if (r.error) s.setToast(r.error); else navigate('/groupes')
      }}>Quitter ce groupe</button>
    </>
  )
}
