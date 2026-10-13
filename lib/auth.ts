import { redirect } from 'next/navigation'
import { supabaseServer } from '@/lib/supabase/server'

export async function requireUser() {
  const supabase = await supabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return { supabase, user }
}
