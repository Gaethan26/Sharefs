import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'
import { searchCatalog } from '@/lib/catalog'
import { KINDS, type Kind } from '@/lib/kinds'

export async function GET(req: Request) {
  const supabase = await supabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Connexion requise' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const kind = searchParams.get('kind') as Kind
  const q = (searchParams.get('q') ?? '').trim().slice(0, 100)
  if (!(kind in KINDS) || q.length < 2) return NextResponse.json({ results: [] })
  try {
    return NextResponse.json({ results: await searchCatalog(kind, q) })
  } catch {
    return NextResponse.json({ results: [], error: 'Catalogue indisponible' }, { status: 502 })
  }
}
