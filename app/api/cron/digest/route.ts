import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { fmtDate } from '@/lib/format'

/** E-mail quotidien : recos reçues, échéances à J-7 et J-1, nouveaux avis sur mes recos */
export async function GET(req: Request) {
  if (!process.env.CRON_SECRET || req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) return NextResponse.json({ skipped: 'RESEND_API_KEY ou EMAIL_FROM manquant' })

  const db = supabaseAdmin()
  const app = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const now = new Date()
  const day = 86_400_000
  const emails = new Map<string, string>()
  for (let page = 1; page < 50; page++) {
    const { data } = await db.auth.admin.listUsers({ page, perPage: 1000 })
    data.users.forEach(u => u.email && emails.set(u.id, u.email))
    if (data.users.length < 1000) break
  }
  const { data: profiles } = await db.from('profiles').select('id, display_name, last_digest_at').eq('email_reminders', true)
  let sent = 0
  for (const p of profiles ?? []) {
    const to = emails.get(p.id)
    if (!to) continue
    const since = p.last_digest_at ?? new Date(now.getTime() - day).toISOString()
    const [{ data: fresh }, { data: due }, { data: reviews }] = await Promise.all([
      db.from('challenges').select('reco:recos(id, sender:profiles!recos_sender_id_fkey(display_name), work:works(title))')
        .eq('user_id', p.id).eq('invited', true).gt('started_at', since),
      db.from('challenges').select('deadline, reco:recos(id, work:works(title))').eq('user_id', p.id).eq('status', 'active')
        .gt('deadline', now.toISOString()).lte('deadline', new Date(now.getTime() + 7 * day).toISOString()),
      db.from('reviews').select('rating, user:profiles(display_name), reco:recos!inner(id, sender_id, work:works(title))')
        .eq('reco.sender_id', p.id).gt('created_at', since),
    ])
    const lines: string[] = []
    const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
    const link = (id: string, t: string) => `<a href="${app}/r/${id}">${esc(t)}</a>`
    for (const f of (fresh ?? []) as any[]) lines.push(`📬 ${esc(f.reco.sender?.display_name || 'Un ami')} t’a envoyé ${link(f.reco.id, f.reco.work.title)}. Tu as un mois.`)
    const left = (d: string) => new Date(d).getTime() - now.getTime()
    // Rappels à J-7 et à J-1 uniquement
    for (const d of ((due ?? []) as any[]).filter(d => left(d.deadline) > 6 * day || left(d.deadline) <= day)) lines.push(`⏳ ${link(d.reco.id, d.reco.work.title)} : à finir avant le ${fmtDate(d.deadline)}.`)
    for (const r of (reviews ?? []) as any[]) lines.push(`⭐ ${esc(r.user?.display_name || 'Un ami')} a noté ${link(r.reco.id, r.reco.work.title)} : ${'★'.repeat(r.rating)}. Découvre si ton pari était juste.`)
    if (!lines.length) continue
    const html = `<div style="font-family:system-ui,sans-serif;font-size:16px;line-height:1.6;color:#18213D">
      <p>Bonjour ${esc(p.display_name || '')},</p>${lines.map(l => `<p>${l}</p>`).join('')}
      <p><a href="${app}/a-faire" style="display:inline-block;background:#2F47E8;color:#fff;padding:10px 18px;border-radius:999px;text-decoration:none">Ouvrir Le Cercle</a></p>
      <p style="color:#5D6580;font-size:13px">Tu peux couper ces e-mails dans ton profil.</p></div>`
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to, subject: lines.length > 1 ? `Le Cercle : ${lines.length} nouvelles` : 'Le Cercle : du nouveau', html }),
    })
    if (res.ok) { sent++; await db.from('profiles').update({ last_digest_at: now.toISOString() }).eq('id', p.id) }
  }
  return NextResponse.json({ sent })
}
