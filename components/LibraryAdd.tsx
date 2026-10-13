'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { addToLibrary } from '@/app/actions'
import type { Kind } from '@/lib/kinds'
import type { WorkInput } from '@/lib/types'
import { WorkPicker } from './WorkPicker'
import { Toast } from './client'

export function LibraryAdd({ enabled }: { enabled: Record<Kind, boolean> }) {
  const [toast, setToast] = useState('')
  const router = useRouter()
  const clear = useCallback(() => setToast(''), [])
  async function pick(w: WorkInput) {
    const r = await addToLibrary(w)
    setToast(r.error ?? `« ${w.title} » ajouté à ta liste`)
    if (!r.error) router.refresh()
  }
  return (
    <section className="panel">
      <h3>Ajouter une référence</h3>
      <WorkPicker enabled={enabled} onPick={pick} actionLabel="Ajouter" />
      <Toast msg={toast} onDone={clear} />
    </section>
  )
}
