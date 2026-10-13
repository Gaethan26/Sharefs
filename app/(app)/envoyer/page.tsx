import { requireUser } from '@/lib/auth'
import { catalogEnabled } from '@/lib/catalog'
import { monthKey, monthLabel } from '@/lib/format'
import type { Person, Work } from '@/lib/types'
import { SendForm } from '@/components/SendForm'

export const metadata = { title: 'Envoyer' }

export default async function Envoyer({ searchParams }: { searchParams: Promise<{ work?: string; circle?: string; reply?: string }> }) {
  const sp = await searchParams
  const { supabase, user } = await requireUser()
  const [{ data: mem }, { data: lib }, { data: sent }, replyRes] = await Promise.all([
    supabase.from('circle_members').select('circle_id, user:profiles(id, display_name, avatar_url), circle:circles(id, name)'),
    supabase.from('library_items').select('work:works(id, kind, title, creator, year, cover_url)').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1000),
    supabase.from('recos').select('circle_id').eq('sender_id', user.id).eq('month', monthKey()).is('reply_to', null),
    sp.reply
      ? supabase.from('recos').select('id, sender:profiles!recos_sender_id_fkey(id, display_name, avatar_url), work:works(title), challenges!inner(user_id, status)')
          .eq('id', sp.reply).eq('challenges.user_id', user.id).eq('challenges.status', 'done').maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  const used = new Set((sent ?? []).map(s => s.circle_id))
  const circles = new Map<string, { id: string; name: string; used: boolean; members: Person[] }>()
  for (const m of (mem ?? []) as unknown as { circle_id: string; user: Person; circle: { id: string; name: string } }[]) {
    const c = circles.get(m.circle_id) ?? { id: m.circle.id, name: m.circle.name, used: used.has(m.circle_id), members: [] }
    if (m.user.id !== user.id) c.members.push(m.user)
    circles.set(m.circle_id, c)
  }
  const reply = replyRes.data as unknown as { id: string; sender: Person; work: { title: string } } | null
  const library = ((lib ?? []) as unknown as { work: Work }[]).map(l => l.work)
  return (
    <div className="narrow" style={{ margin: '0 auto' }}>
      <h1>{reply ? 'Répondre par une reco' : 'Envoi du mois'}</h1>
      <p className="sub">{reply ? `Tu as fini « ${reply.work.title} ». Renvoie une référence à ${reply.sender.display_name || 'ton ami'}.` : `Une seule référence par cercle en ${monthLabel()}. Tes amis auront un mois.`}</p>
      {sp.reply && !reply ? <p className="empty">Termine et note la référence avant d’y répondre.</p> : (
        <SendForm circles={[...circles.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr'))} library={library}
          preWorkId={sp.work} preCircleId={sp.circle}
          replyTo={reply ? { id: reply.id, title: reply.work.title, sender: reply.sender } : null}
          ai={!!process.env.ANTHROPIC_API_KEY} catalog={catalogEnabled()} />
      )}
    </div>
  )
}
