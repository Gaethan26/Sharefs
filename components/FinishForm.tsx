'use client'

import { useState } from 'react'
import { StarsInput } from './client'

export function FinishForm({ doneLabel, initialRating = 0, initialBody = '', editing = false, onSubmit }: {
  doneLabel: string; initialRating?: number; initialBody?: string; editing?: boolean
  onSubmit: (rating: number, body: string) => Promise<{ error?: string }>
}) {
  const [rating, setRating] = useState(initialRating)
  const [body, setBody] = useState(initialBody)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!rating) { setErr('Donne une note de 1 à 5.'); return }
    setErr(''); setBusy(true)
    const r = await onSubmit(rating, body)
    setBusy(false)
    if (r.error) setErr(r.error)
  }
  return (
    <form onSubmit={submit} id="finir">
      <h3>{editing ? 'Modifier ton avis' : `${doneLabel} ? Note-le pour débloquer les avis`}</h3>
      <StarsInput value={rating} onChange={setRating} label="Ta note" />
      <label className="f" htmlFor="review">Ton avis</label>
      <textarea id="review" value={body} onChange={e => setBody(e.target.value)} maxLength={2000} placeholder="Il ne sera lu que par ceux qui ont fini." />
      {err && <p className="err">{err}</p>}
      <div className="actions"><button className="btn" disabled={busy}>{busy ? 'Enregistrement…' : editing ? 'Mettre à jour' : 'Enregistrer et débloquer'}</button></div>
    </form>
  )
}
