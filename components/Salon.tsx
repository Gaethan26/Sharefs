'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { supabaseBrowser } from '@/lib/supabase/client'
import { fmtDateTime } from '@/lib/format'
import type { Person } from '@/lib/types'
import { Avatar, nameOf } from './ui'

type Msg = { id: string; user_id: string; body: string; created_at: string }

export function Salon({ recoId, me, initial, people }: { recoId: string; me: string; initial: Msg[]; people: Record<string, Person> }) {
  const supabase = useMemo(() => supabaseBrowser(), [])
  const [msgs, setMsgs] = useState(initial)
  const [text, setText] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const ch = supabase.channel(`salon-${recoId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `reco_id=eq.${recoId}` }, payload => {
        const m = payload.new as Msg
        setMsgs(prev => (prev.some(x => x.id === m.id) ? prev : [...prev, m]))
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [recoId, supabase])

  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }) }, [msgs.length])

  async function send(e: React.FormEvent) {
    e.preventDefault()
    const body = text.trim()
    if (!body) return
    setBusy(true); setErr('')
    const { data, error } = await supabase.from('messages').insert({ reco_id: recoId, body }).select('id, user_id, body, created_at').single()
    setBusy(false)
    if (error || !data) { setErr('Message non publié. Réessaie.'); return }
    setText('')
    setMsgs(prev => (prev.some(x => x.id === data.id) ? prev : [...prev, data as Msg]))
  }

  return (
    <section className="panel" id="salon">
      <h3>Salon</h3>
      <p className="meta" style={{ marginTop: -6 }}>Tout le monde ici a fini : les spoilers sont permis.</p>
      <div className="salon-list" ref={listRef}>
        {msgs.length === 0 && <p className="meta">Personne n’a encore parlé. Lance la discussion.</p>}
        {msgs.map(m => (
          <div className="msg" key={m.id}>
            <div className="who"><Avatar p={people[m.user_id]} /><span>{nameOf(people[m.user_id], me)}, {fmtDateTime(m.created_at)}</span></div>
            <p>{m.body}</p>
          </div>
        ))}
      </div>
      <form onSubmit={send} className="row">
        <input className="grow" value={text} onChange={e => setText(e.target.value)} maxLength={1000} placeholder="Ton message" aria-label="Message" />
        <button className="btn fit" disabled={busy || !text.trim()}>Publier</button>
      </form>
      {err && <p className="err">{err}</p>}
    </section>
  )
}
