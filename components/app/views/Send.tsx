'use client'

import { useStore } from '../store'
import { usePageTint } from '../tint'
import { monthKey, monthLabel } from '@/lib/format'
import type { Kind } from '@/lib/kinds'
import { SendForm } from '@/components/SendForm'

export function Send({ work, circle, reply, ai, catalog }: { work: string | null; circle: string | null; reply: string | null; ai: boolean; catalog: Record<Kind, boolean> }) {
  const s = useStore()
  usePageTint(null)
  const used = new Set(s.recos.filter(r => r.sender_id === s.userId && !r.reply_to && r.month === monthKey()).map(r => r.circle_id))
  const circles = s.circles
    .map(c => ({ id: c.id, name: c.name, used: used.has(c.id), members: c.members.filter(m => m.id !== s.userId) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
  const src = reply ? s.recos.find(r => r.id === reply) : null
  const canReply = !!src && src.challenges.some(c => c.user_id === s.userId && c.status === 'done')
  return (
    <div className="narrow" style={{ margin: '0 auto' }}>
      <h1>{reply ? 'Répondre par une œuvre' : 'Recommandation du mois'}</h1>
      <p className="sub">{src ? `Tu as fini « ${src.work.title} ». Renvoie une œuvre à ${src.sender?.display_name || 'ton ami'}.` : `Une seule recommandation par groupe en ${monthLabel()}. Tes amis auront un mois.`}</p>
      {reply && !canReply ? <p className="empty">Termine et note l’œuvre avant d’y répondre.</p> : (
        <SendForm key={`${work}|${circle}|${reply}`} circles={circles} library={s.library.map(i => i.work)} preWorkId={work} preCircleId={circle}
          replyTo={src && canReply && src.sender ? { id: src.id, title: src.work.title, sender: src.sender } : null} ai={ai} catalog={catalog} />
      )}
    </div>
  )
}
