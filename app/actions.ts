'use server'

import { redirect } from 'next/navigation'
import { supabaseServer } from '@/lib/supabase/server'

/* Seule action serveur restante : rejoindre un groupe depuis un lien d'invitation */
export async function joinInvite(code: string) {
  const supabase = await supabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=${encodeURIComponent('/invite/' + code)}`)
  const { data, error } = await supabase.rpc('join_circle', { p_code: code })
  if (error) redirect(`/invite/${code}?err=` + encodeURIComponent(error.message.replace(/cercle/g, 'groupe')))
  redirect(`/g/${data}`)
}
