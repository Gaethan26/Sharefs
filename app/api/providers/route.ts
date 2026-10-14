import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'
import { getProviders } from '@/lib/catalog'
import type { Work } from '@/lib/types'

export async function GET(req: Request) {
  const supabase = await supabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json(null, { status: 401 })
  const { searchParams } = new URL(req.url)
  const source = searchParams.get('source'), id = searchParams.get('id')
  if (!source || !id) return NextResponse.json(null)
  return NextResponse.json(await getProviders({ source, external_id: id } as Work))
}
