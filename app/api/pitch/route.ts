import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'
import { KINDS, type Kind } from '@/lib/kinds'

export async function POST(req: Request) {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return NextResponse.json({ error: 'Non configuré' }, { status: 404 })
  const supabase = await supabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Connexion requise' }, { status: 401 })

  const b = await req.json().catch(() => ({}))
  const kind = (b.kind in KINDS ? b.kind : 'livre') as Kind
  const title = String(b.title ?? '').slice(0, 200)
  if (!title) return NextResponse.json({ error: 'Titre manquant' }, { status: 400 })
  const creator = b.creator ? String(b.creator).slice(0, 120) : ''
  const year = b.year ? String(b.year).slice(0, 4) : ''

  const prompt = `Tu rédiges une fiche de recommandation entre amis, SANS AUCUN SPOILER.
Œuvre : ${KINDS[kind].label} « ${title} »${creator ? `, de ${creator}` : ''}${year ? ` (${year})` : ''}.
Réponds uniquement avec ce JSON, sans texte autour :
{"known": true, "pitch": "...", "effort": "..."}
- known : false si tu n'es pas certain d'identifier précisément cette œuvre ; pitch et effort vides dans ce cas.
- pitch : 2 phrases maximum en français, qui donnent envie, sans rien révéler au-delà du point de départ.
- effort : temps à prévoir pour la terminer, très court. Exemples : "2 h 10", "3 saisons, environ 25 h", "320 pages, environ 8 h", "environ 15 h de jeu".`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5', max_tokens: 400, messages: [{ role: 'user', content: prompt }] }),
    })
    if (!res.ok) return NextResponse.json({ error: 'Claude est indisponible pour le moment.' }, { status: 502 })
    const j = await res.json()
    const text: string = (j.content ?? []).filter((c: { type: string }) => c.type === 'text').map((c: { text: string }) => c.text).join('')
    const json = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1))
    return NextResponse.json({
      known: !!json.known,
      pitch: String(json.pitch ?? '').slice(0, 500),
      effort: String(json.effort ?? '').slice(0, 80),
    })
  } catch {
    return NextResponse.json({ error: 'Réponse illisible, réessaie.' }, { status: 502 })
  }
}
