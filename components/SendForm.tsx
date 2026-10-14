'use client'

import Link from 'next/link'
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { sendReco } from '@/app/actions'
import { kindOf, type Kind } from '@/lib/kinds'
import type { Person, Work, WorkInput } from '@/lib/types'
import { Avatar, Cover, WorkMeta } from './ui'
import { StarsInput } from './client'
import { WorkPicker } from './WorkPicker'

type CircleOpt = { id: string; name: string; used: boolean; members: Person[] }

export function SendForm({ circles, library, preWorkId, preCircleId, replyTo, ai, catalog }: {
  circles: CircleOpt[]; library: Work[]; preWorkId?: string | null; preCircleId?: string | null
  replyTo?: { id: string; title: string; sender: Person } | null; ai: boolean; catalog: Record<Kind, boolean>
}) {
  const router = useRouter()
  const firstFree = circles.find(c => c.id === preCircleId && !c.used)?.id ?? circles.find(c => !c.used)?.id ?? ''
  const [mode, setMode] = useState<'liste' | 'catalogue'>(library.length ? 'liste' : 'catalogue')
  const [workId, setWorkId] = useState(preWorkId && library.some(w => w.id === preWorkId) ? preWorkId : library[0]?.id ?? '')
  const [picked, setPicked] = useState<WorkInput | null>(null)
  const [circleId, setCircleId] = useState(firstFree)
  const circle = circles.find(c => c.id === circleId)
  const [recipients, setRecipients] = useState<Set<string>>(new Set(circle?.members.map(m => m.id) ?? []))
  const [why, setWhy] = useState(''), [pitch, setPitch] = useState(''), [effort, setEffort] = useState(''), [link, setLink] = useState('')
  const [rating, setRating] = useState(0), [bet, setBet] = useState(0)
  const [err, setErr] = useState(''), [aiNote, setAiNote] = useState(''), [aiBusy, setAiBusy] = useState(false), [aiOn, setAiOn] = useState(ai)
  const [pending, start] = useTransition()

  const work: (WorkInput & { id?: string }) | null = useMemo(
    () => (mode === 'liste' ? library.find(w => w.id === workId) ?? null : picked), [mode, library, workId, picked])

  if (!replyTo && circles.length === 0) {
    return <div className="panel empty">Tu n’as pas encore de cercle.<br /><Link className="btn" href="/cercles">Créer ou rejoindre un cercle</Link></div>
  }
  if (!replyTo && !circles.some(c => !c.used)) {
    return <div className="panel empty">Tu as déjà envoyé ta référence du mois dans tous tes cercles. Rendez-vous le 1er du mois prochain.</div>
  }

  function changeCircle(id: string) {
    setCircleId(id)
    setRecipients(new Set(circles.find(c => c.id === id)?.members.map(m => m.id) ?? []))
  }
  function toggle(id: string) {
    const s = new Set(recipients); s.has(id) ? s.delete(id) : s.add(id); setRecipients(s)
  }

  async function genPitch() {
    if (!work) { setAiNote('Choisis d’abord une référence.'); return }
    setAiBusy(true); setAiNote('Claude rédige la fiche…')
    try {
      const res = await fetch('/api/pitch', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: work.kind, title: work.title, creator: work.creator, year: work.year }) })
      if (res.status === 404) { setAiOn(false); setAiNote(''); return }
      const j = await res.json()
      if (!res.ok) { setAiNote(j.error ?? 'Rédaction impossible pour le moment.'); return }
      if (!j.known) { setAiNote('Claude n’identifie pas cette œuvre avec certitude. Écris le pitch toi-même.'); return }
      setPitch(j.pitch ?? ''); if (j.effort) setEffort(j.effort)
      setAiNote('Fiche rédigée par Claude. Relis-la avant d’envoyer.')
    } catch { setAiNote('Rédaction impossible pour le moment.') }
    finally { setAiBusy(false) }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault(); setErr('')
    if (!work) { setErr('Choisis une référence.'); return }
    if (!replyTo && !circleId) { setErr('Choisis un cercle.'); return }
    if (!replyTo && recipients.size === 0) { setErr('Choisis au moins un destinataire.'); return }
    if (link && !/^https:\/\/\S+$/i.test(link)) { setErr('Le lien doit commencer par https://'); return }
    start(async () => {
      const r = await sendReco({
        circleId: replyTo ? null : circleId,
        workId: mode === 'liste' ? workId : undefined, work: mode === 'catalogue' ? picked ?? undefined : undefined,
        recipients: [...recipients], why, pitch, effort, link, rating, bet, replyTo: replyTo?.id ?? null,
      })
      if (r.error) setErr(r.error); else router.push(`/r/${r.id}`)
    })
  }

  return (
    <form onSubmit={submit}>
      <section className="panel">
        <h3>La référence</h3>
        <div className="chips" role="group" aria-label="Source">
          <button type="button" className="chip" aria-pressed={mode === 'liste'} onClick={() => setMode('liste')} disabled={!library.length}>Depuis ma galerie</button>
          <button type="button" className="chip" aria-pressed={mode === 'catalogue'} onClick={() => setMode('catalogue')}>Chercher</button>
        </div>
        {mode === 'liste' ? (
          <select value={workId} onChange={e => setWorkId(e.target.value)} aria-label="Œuvre de ta galerie">
            {library.map(w => <option key={w.id} value={w.id}>{w.title} ({kindOf(w.kind).label})</option>)}
          </select>
        ) : (
          <WorkPicker enabled={catalog} onPick={w => setPicked(w)} actionLabel="Choisir"
            selectedKey={picked ? `${picked.source}:${picked.external_id}` : null} />
        )}
        {work && (
          <div className={`selected-work k-${work.kind}`}>
            <Cover w={{ kind: work.kind, cover_url: work.cover_url ?? null }} size="s" />
            <div><div className="work">{work.title}</div><WorkMeta w={{ kind: work.kind, creator: work.creator ?? null, year: work.year ?? null }} /></div>
          </div>
        )}
      </section>

      <section className="panel">
        {replyTo ? (
          <>
            <h3>Pour {replyTo.sender.display_name || 'ton ami'}</h3>
            <div className="who"><Avatar p={replyTo.sender} /><span>En réponse à « {replyTo.title} ». Ne compte pas dans ton envoi du mois.</span></div>
          </>
        ) : (
          <>
            <h3>Pour qui</h3>
            <label className="f" htmlFor="circle">Cercle</label>
            <select id="circle" value={circleId} onChange={e => changeCircle(e.target.value)}>
              {circles.map(c => <option key={c.id} value={c.id} disabled={c.used}>{c.name}{c.used ? ' (envoi du mois fait)' : ''}</option>)}
            </select>
            <label className="f">Destinataires</label>
            {circle && circle.members.length ? (
              <div className="pick">
                {circle.members.map(p => (
                  <label key={p.id}><input type="checkbox" checked={recipients.has(p.id)} onChange={() => toggle(p.id)} /><Avatar p={p} />{p.display_name || 'Sans nom'}</label>
                ))}
              </div>
            ) : <p className="meta">Personne d’autre dans ce cercle. Invite tes amis depuis la page du cercle.</p>}
          </>
        )}
      </section>

      <section className="panel">
        <h3>Ton mot</h3>
        <label className="f" htmlFor="why">Pourquoi toi, tu la recommandes</label>
        <textarea id="why" value={why} onChange={e => setWhy(e.target.value)} maxLength={500} placeholder="Ce qui t’a marqué, sans rien dévoiler" />
        <div className="row">
          <div><label className="f">Ta note</label><StarsInput value={rating} onChange={setRating} clearable label="Ta note" /></div>
          <div><label className="f">Ton pari sur leur note</label><StarsInput value={bet} onChange={setBet} clearable label="Ton pari" /></div>
        </div>
        <p className="meta" style={{ margin: '6px 0 0' }}>Ta note et ton pari restent cachés jusqu’à ce qu’ils aient fini.</p>
        <hr className="sep" />
        <div className="fhead">
          <label className="f" htmlFor="pitch">Pitch sans spoiler</label>
          {aiOn && <button type="button" className="btn small ghost" onClick={genPitch} disabled={aiBusy}>{aiBusy ? 'Rédaction…' : 'Rédiger avec Claude'}</button>}
        </div>
        <textarea id="pitch" value={pitch} onChange={e => setPitch(e.target.value)} maxLength={500} placeholder="Le point de départ, rien de plus" />
        {aiNote && <p className="meta" style={{ margin: '6px 0 0' }}>{aiNote}</p>}
        <div className="row">
          <div><label className="f" htmlFor="effort">Temps à prévoir</label><input id="effort" value={effort} onChange={e => setEffort(e.target.value)} maxLength={80} placeholder="2 h 10, 3 saisons…" /></div>
          <div className="grow"><label className="f" htmlFor="link">Lien direct (facultatif)</label><input id="link" type="url" value={link} onChange={e => setLink(e.target.value)} maxLength={500} placeholder="https://… bande-annonce, plateforme, librairie" /></div>
        </div>
      </section>

      {err && <p className="err" role="alert">{err}</p>}
      <div className="actions"><button className="btn" disabled={pending}>{pending ? 'Envoi…' : replyTo ? 'Envoyer ma réponse' : 'Confier cette œuvre'}</button></div>
    </form>
  )
}
