'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { supabaseBrowser } from '@/lib/supabase/client'
import { RECO_SELECT, type Challenge, type Person, type RecoFull, type Work, type WorkInput } from '@/lib/types'

export type Member = Person & { role: string }
export type Circle = { id: string; name: string; invite_code: string; created_at: string; members: Member[] }
export type Item = { id: string; note: string | null; created_at: string; work: Work }
export type Profile = { id: string; display_name: string; avatar_url: string | null; email_reminders: boolean }
export type Res = { error?: string; id?: string }
export type SendInput = {
  circleId: string | null; workId?: string; work?: WorkInput; recipients: string[]
  why: string; pitch: string; effort: string; link: string; rating: number; bet: number; replyTo?: string | null
}

const RECO_FULL = `${RECO_SELECT}, secret:reco_secrets(sender_rating, bet), reviews(user_id, rating, body, updated_at)`
const CIRCLE_SELECT = 'id, name, invite_code, created_at, circle_members(role, user:profiles(id, display_name, avatar_url))'
const ITEM_SELECT = 'id, note, created_at, work:works(id, kind, title, creator, year, cover_url, synopsis, source, external_id)'

export const errText = (e: unknown) =>
  ((e as { message?: string })?.message ?? 'Action impossible pour le moment.').replace(/cercle/g, 'groupe')

function useStoreValue(userId: string, email: string) {
  const sb = useMemo(() => supabaseBrowser(), [])
  const [ready, setReady] = useState(false)
  const [fatal, setFatal] = useState<string | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [circles, setCircles] = useState<Circle[]>([])
  const [library, setLibrary] = useState<Item[]>([])
  const [recos, setRecos] = useState<RecoFull[]>([])
  const [toast, setToast] = useState('')

  /* ---------- Chargements ---------- */
  const loadProfile = useCallback(async () => {
    const { data, error } = await sb.from('profiles').select('id, display_name, avatar_url, email_reminders').eq('id', userId).maybeSingle()
    if (error) throw error
    setProfile(data as Profile | null)
  }, [sb, userId])
  const loadCircles = useCallback(async () => {
    const { data, error } = await sb.from('circles').select(CIRCLE_SELECT).order('created_at')
    if (error) throw error
    setCircles(((data ?? []) as any[]).map(c => ({
      id: c.id, name: c.name, invite_code: c.invite_code, created_at: c.created_at,
      members: (c.circle_members ?? []).filter((m: any) => m.user).map((m: any) => ({ ...m.user, role: m.role })),
    })))
  }, [sb])
  const loadLibrary = useCallback(async () => {
    const { data, error } = await sb.from('library_items').select(ITEM_SELECT).eq('user_id', userId).order('created_at', { ascending: false }).limit(1000)
    if (error) throw error
    setLibrary(((data ?? []) as unknown as Item[]).filter(i => i.work))
  }, [sb, userId])
  const loadRecos = useCallback(async () => {
    const { data, error } = await sb.from('recos').select(RECO_FULL).order('sent_at', { ascending: false }).limit(500)
    if (error) throw error
    setRecos(((data ?? []) as unknown as RecoFull[]).filter(r => r.work))
  }, [sb])
  const loadReco = useCallback(async (id: string) => {
    const { data, error } = await sb.from('recos').select(RECO_FULL).eq('id', id).maybeSingle()
    if (error) throw error
    if (data) setRecos(prev => {
      const r = data as unknown as RecoFull
      const i = prev.findIndex(x => x.id === r.id)
      return i < 0 ? [r, ...prev] : prev.map(x => (x.id === r.id ? r : x))
    })
    return data as unknown as RecoFull | null
  }, [sb])

  useEffect(() => {
    Promise.all([loadProfile(), loadCircles(), loadLibrary(), loadRecos()])
      .catch(e => setFatal(errText(e)))
      .finally(() => setReady(true))
  }, [loadProfile, loadCircles, loadLibrary, loadRecos])

  // Données fraîches quand on revient sur l'onglet
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') { loadRecos().catch(() => {}); loadCircles().catch(() => {}) } }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [loadRecos, loadCircles])

  /* ---------- Actions ---------- */
  const ensureWork = useCallback(async (w: WorkInput) => {
    if (!w.title?.trim()) throw new Error('Indique un titre.')
    const { data, error } = await sb.rpc('ensure_work', {
      p_kind: w.kind, p_title: w.title.trim().slice(0, 200), p_creator: w.creator || null, p_year: w.year || null,
      p_cover: w.cover_url || null, p_synopsis: w.synopsis || null, p_source: w.source || null, p_external_id: w.external_id || null,
    })
    if (error) throw error
    return data as string
  }, [sb])

  const addWorkId = useCallback(async (workId: string, note?: string): Promise<Res> => {
    const { error } = await sb.from('library_items')
      .upsert({ user_id: userId, work_id: workId, note: note?.trim().slice(0, 300) || null }, { onConflict: 'user_id,work_id', ignoreDuplicates: true })
    if (error) return { error: errText(error) }
    await loadLibrary().catch(() => {})
    return { id: workId }
  }, [sb, userId, loadLibrary])

  // Ajout instantané à l'écran, puis enregistrement
  const addToLibrary = useCallback(async (w: WorkInput, note?: string): Promise<Res> => {
    const tmp = `tmp-${Math.random().toString(36).slice(2)}`
    setLibrary(prev => [{ id: tmp, note: note ?? null, created_at: new Date().toISOString(),
      work: { id: tmp, kind: w.kind, title: w.title, creator: w.creator ?? null, year: w.year ?? null, cover_url: w.cover_url ?? null } }, ...prev])
    try {
      const r = await addWorkId(await ensureWork(w), note)
      if (r.error) throw new Error(r.error)
      return r
    } catch (e) {
      setLibrary(prev => prev.filter(i => i.id !== tmp))
      return { error: errText(e) }
    }
  }, [ensureWork, addWorkId])

  const removeItem = useCallback(async (id: string): Promise<Res> => {
    setLibrary(prev => prev.filter(i => i.id !== id))
    const { error } = await sb.from('library_items').delete().eq('id', id)
    if (error) { await loadLibrary().catch(() => {}); return { error: errText(error) } }
    return {}
  }, [sb, loadLibrary])

  const createCircle = useCallback(async (name: string): Promise<Res> => {
    const { data, error } = await sb.rpc('create_circle', { p_name: name.trim().slice(0, 60) })
    if (error) return { error: errText(error) }
    try { await loadCircles() } catch (e) { return { error: `Groupe créé, mais lecture impossible : ${errText(e)}` } }
    return { id: data as string }
  }, [sb, loadCircles])

  const joinCircle = useCallback(async (raw: string): Promise<Res> => {
    const code = raw.trim().split('/').filter(Boolean).pop() ?? ''
    const { data, error } = await sb.rpc('join_circle', { p_code: code })
    if (error) return { error: errText(error) }
    await Promise.all([loadCircles(), loadRecos()]).catch(() => {})
    return { id: data as string }
  }, [sb, loadCircles, loadRecos])

  const leaveCircle = useCallback(async (id: string): Promise<Res> => {
    const { error } = await sb.from('circle_members').delete().eq('circle_id', id).eq('user_id', userId)
    if (error) return { error: errText(error) }
    await Promise.all([loadCircles(), loadRecos()]).catch(() => {})
    return {}
  }, [sb, userId, loadCircles, loadRecos])

  const sendReco = useCallback(async (input: SendInput): Promise<Res> => {
    try {
      const workId = input.workId ?? (input.work ? await ensureWork(input.work) : null)
      if (!workId) return { error: 'Choisis une œuvre.' }
      const { data, error } = await sb.rpc('send_reco', {
        p_circle: input.circleId, p_work: workId, p_recipients: input.recipients, p_why: input.why, p_pitch: input.pitch,
        p_effort: input.effort, p_link: input.link, p_rating: input.rating, p_bet: input.bet, p_reply_to: input.replyTo ?? null,
      })
      if (error) return { error: errText(error) }
      await Promise.all([loadRecos(), loadLibrary()]).catch(() => {})
      return { id: data as string }
    } catch (e) { return { error: errText(e) } }
  }, [sb, ensureWork, loadRecos, loadLibrary])

  // Mise à jour immédiate de l'écran, puis confirmation par la base
  const patchMine = useCallback((recoId: string, patch: Partial<Challenge>) => {
    setRecos(prev => prev.map(r => (r.id !== recoId ? r : {
      ...r, challenges: r.challenges.map(c => (c.user_id === userId ? { ...c, ...patch } : c)),
    })))
  }, [userId])

  const rpcThenReload = useCallback(async (fn: string, args: Record<string, unknown>, recoId: string): Promise<Res> => {
    const { error } = await sb.rpc(fn, args)
    await loadReco(recoId).catch(() => {})
    return error ? { error: errText(error) } : {}
  }, [sb, loadReco])

  const finish = useCallback((recoId: string, rating: number, body: string) =>
    rpcThenReload('finish_challenge', { p_reco: recoId, p_rating: rating, p_body: body }, recoId), [rpcThenReload])
  const joker = useCallback((recoId: string) => {
    patchMine(recoId, { joker_used: true })
    return rpcThenReload('use_joker', { p_reco: recoId }, recoId)
  }, [patchMine, rpcThenReload])
  const drop = useCallback((recoId: string) => {
    patchMine(recoId, { status: 'dropped' })
    return rpcThenReload('set_challenge_status', { p_reco: recoId, p_status: 'dropped' }, recoId)
  }, [patchMine, rpcThenReload])
  const resume = useCallback((recoId: string) => {
    patchMine(recoId, { status: 'active' })
    return rpcThenReload('set_challenge_status', { p_reco: recoId, p_status: 'active' }, recoId)
  }, [patchMine, rpcThenReload])
  const join = useCallback((recoId: string) => rpcThenReload('join_challenge', { p_reco: recoId }, recoId), [rpcThenReload])

  const updateProfile = useCallback(async (display_name: string, email_reminders: boolean): Promise<Res> => {
    const { error } = await sb.from('profiles').update({ display_name: display_name.trim().slice(0, 40), email_reminders }).eq('id', userId)
    if (error) return { error: errText(error) }
    await loadProfile().catch(() => {})
    return {}
  }, [sb, userId, loadProfile])

  const signOut = useCallback(async () => { await sb.auth.signOut(); window.location.assign('/') }, [sb])

  const pending = recos.filter(r => r.sender_id !== userId && r.challenges.some(c => c.user_id === userId && c.status === 'active')).length

  return {
    sb, userId, email, ready, fatal, profile, circles, library, recos, pending, toast, setToast,
    loadReco, addToLibrary, addWorkId, removeItem, createCircle, joinCircle, leaveCircle, sendReco,
    finish, joker, drop, resume, join, updateProfile, signOut,
  }
}

export type Store = ReturnType<typeof useStoreValue>
const Ctx = createContext<Store | null>(null)

export function StoreProvider({ userId, email, children }: { userId: string; email: string; children: React.ReactNode }) {
  const value = useStoreValue(userId, email)
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore() {
  const s = useContext(Ctx)
  if (!s) throw new Error('StoreProvider manquant')
  return s
}
