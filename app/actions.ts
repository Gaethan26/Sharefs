'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { supabaseServer } from '@/lib/supabase/server'
import type { WorkInput } from '@/lib/types'
import { KINDS } from '@/lib/kinds'

type Result = { error?: string; id?: string }
type Sb = Awaited<ReturnType<typeof supabaseServer>>

async function me() {
  const supabase = await supabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return { supabase, user }
}

const clean = (m?: string) => (m ? m.replace(/^.*?:\s*(?=[A-ZÀ-Ý])/, '').replace(/cercle/g, 'groupe') : 'Action impossible pour le moment.')

async function ensureWork(supabase: Sb, w: WorkInput) {
  if (!w.title?.trim()) throw new Error('Indique un titre.')
  if (!(w.kind in KINDS)) throw new Error('Type inconnu.')
  const { data, error } = await supabase.rpc('ensure_work', {
    p_kind: w.kind, p_title: w.title.trim().slice(0, 200), p_creator: w.creator || null,
    p_year: w.year || null, p_cover: w.cover_url || null, p_synopsis: w.synopsis || null,
    p_source: w.source || null, p_external_id: w.external_id || null,
  })
  if (error) throw new Error(error.message)
  return data as string
}

/* ---------- Liste ---------- */
export async function addToLibrary(w: WorkInput, note?: string): Promise<Result> {
  const { supabase, user } = await me()
  try {
    const workId = await ensureWork(supabase, w)
    const { error } = await supabase.from('library_items')
      .upsert({ user_id: user.id, work_id: workId, note: note?.trim() || null }, { onConflict: 'user_id,work_id', ignoreDuplicates: true })
    if (error) return { error: clean(error.message) }
    revalidatePath('/liste')
    return { id: workId }
  } catch (e) { return { error: clean((e as Error).message) } }
}

export async function addWorkToLibrary(workId: string, note?: string) {
  const { supabase, user } = await me()
  await supabase.from('library_items')
    .upsert({ user_id: user.id, work_id: workId, note: note?.slice(0, 300) || null }, { onConflict: 'user_id,work_id', ignoreDuplicates: true })
  revalidatePath('/', 'layout')
}

export async function removeFromLibrary(id: string) {
  const { supabase } = await me()
  await supabase.from('library_items').delete().eq('id', id)
  revalidatePath('/liste')
}

/* ---------- Envoi ---------- */
export async function sendReco(input: {
  circleId: string | null; workId?: string; work?: WorkInput; recipients: string[]
  why: string; pitch: string; effort: string; link: string; rating: number; bet: number; replyTo?: string | null
}): Promise<Result> {
  const { supabase } = await me()
  try {
    const workId = input.workId ?? (input.work ? await ensureWork(supabase, input.work) : null)
    if (!workId) return { error: 'Choisis une référence.' }
    const { data, error } = await supabase.rpc('send_reco', {
      p_circle: input.circleId, p_work: workId, p_recipients: input.recipients,
      p_why: input.why, p_pitch: input.pitch, p_effort: input.effort, p_link: input.link,
      p_rating: input.rating, p_bet: input.bet, p_reply_to: input.replyTo ?? null,
    })
    if (error) return { error: clean(error.message) }
    revalidatePath('/', 'layout')
    return { id: data as string }
  } catch (e) { return { error: clean((e as Error).message) } }
}

/* ---------- Défis ---------- */
export async function finishChallenge(recoId: string, rating: number, body: string): Promise<Result> {
  const { supabase } = await me()
  const { error } = await supabase.rpc('finish_challenge', { p_reco: recoId, p_rating: rating, p_body: body })
  if (error) return { error: clean(error.message) }
  revalidatePath('/', 'layout')
  return {}
}

async function rpcThenBack(fn: string, args: Record<string, unknown>, recoId: string, back?: string) {
  const { supabase } = await me()
  const { error } = await supabase.rpc(fn, args)
  revalidatePath('/', 'layout')
  const to = back ?? `/r/${recoId}`
  if (error) redirect(`${to}${to.includes('?') ? '&' : '?'}err=${encodeURIComponent(clean(error.message))}`)
  redirect(to)
}

export async function jokerAction(recoId: string, back?: string) {
  await rpcThenBack('use_joker', { p_reco: recoId }, recoId, back)
}
export async function dropAction(recoId: string, back?: string) {
  await rpcThenBack('set_challenge_status', { p_reco: recoId, p_status: 'dropped' }, recoId, back)
}
export async function resumeAction(recoId: string, back?: string) {
  await rpcThenBack('set_challenge_status', { p_reco: recoId, p_status: 'active' }, recoId, back)
}
export async function joinChallengeAction(recoId: string) {
  await rpcThenBack('join_challenge', { p_reco: recoId }, recoId)
}

/* ---------- Groupes ---------- */
export async function createCircle(fd: FormData) {
  const { supabase } = await me()
  const name = String(fd.get('name') ?? '').trim()
  if (!name) redirect('/groupes?err=' + encodeURIComponent('Donne un nom au groupe.'))
  const { data, error } = await supabase.rpc('create_circle', { p_name: name.slice(0, 60) })
  if (error) redirect('/groupes?err=' + encodeURIComponent(clean(error.message)))
  revalidatePath('/', 'layout')
  redirect(`/g/${data}`)
}

export async function joinCircle(fd: FormData) {
  const { supabase } = await me()
  const raw = String(fd.get('code') ?? '').trim()
  const code = raw.split('/').filter(Boolean).pop() ?? ''
  const { data, error } = await supabase.rpc('join_circle', { p_code: code })
  if (error) redirect('/groupes?err=' + encodeURIComponent(clean(error.message)))
  revalidatePath('/', 'layout')
  redirect(`/g/${data}`)
}

export async function joinInvite(code: string) {
  const { supabase } = await me()
  const { data, error } = await supabase.rpc('join_circle', { p_code: code })
  if (error) redirect(`/invite/${code}?err=` + encodeURIComponent(clean(error.message)))
  revalidatePath('/', 'layout')
  redirect(`/g/${data}`)
}

export async function leaveCircle(circleId: string) {
  const { supabase, user } = await me()
  await supabase.from('circle_members').delete().eq('circle_id', circleId).eq('user_id', user.id)
  revalidatePath('/', 'layout')
  redirect('/groupes')
}

/* ---------- Profil ---------- */
export async function updateProfile(fd: FormData) {
  const { supabase, user } = await me()
  const display_name = String(fd.get('display_name') ?? '').trim().slice(0, 40)
  const email_reminders = fd.get('email_reminders') === 'on'
  const { error } = await supabase.from('profiles').update({ display_name, email_reminders }).eq('id', user.id)
  revalidatePath('/', 'layout')
  redirect('/profil?' + (error ? 'err=' + encodeURIComponent('Enregistrement impossible.') : 'ok=1'))
}

export async function signOut() {
  const supabase = await supabaseServer()
  await supabase.auth.signOut()
  redirect('/')
}
