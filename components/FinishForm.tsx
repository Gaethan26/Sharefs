'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { finishChallenge } from '@/app/actions'
import { StarsInput } from './client'

export function FinishForm({ recoId, doneLabel, initialRating = 0, initialBody = '', editing = false }: {
  recoId: string; doneLabel: string; initialRating?: number; initialBody?: string; editing?: boolean
}) {
  const [rating, setRating] = useState(initialRating)
  const [body, setBody] = useState(initialBody)
  const [err, setErr] = useState('')
  const [pending, start] = useTransition()
  const router = useRouter()
  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!rating) { setErr('Donne une note de 1 à 5.'); return }
    setErr('')
    start(async () => {
      const r = await finishChallenge(recoId, rating, body)
      if (r.error) setErr(r.error); else router.refresh()
    })
  }
  return (
    <form onSubmit={submit} id="finir">
      <h3>{editing ? 'Modifier ton avis' : `${doneLabel} ? Note-le pour débloquer les avis`}</h3>
      <StarsInput value={rating} onChange={setRating} label="Ta note" />
      <label className="f" htmlFor="review">Ton avis</label>
      <textarea id="review" value={body} onChange={e => setBody(e.target.value)} maxLength={2000}
        placeholder="Il ne sera lu que par ceux qui ont fini." />
      {err && <p className="err">{err}</p>}
      <div className="actions"><button className="btn" disabled={pending}>{pending ? 'Enregistrement…' : editing ? 'Mettre à jour' : 'Enregistrer et débloquer'}</button></div>
    </form>
  )
}
