'use client'

import { useMemo, useState } from 'react'
import { supabaseBrowser } from '@/lib/supabase/client'

type Mode = 'login' | 'signup'

function authMessage(error: { status?: number; message?: string; code?: string }) {
  const code = error.code ?? ''
  const msg = (error.message ?? '').toLowerCase()
  if (code === 'invalid_credentials' || msg.includes('invalid login')) return 'E-mail ou mot de passe incorrect.'
  if (code === 'user_already_exists' || msg.includes('already registered')) return 'Un compte existe déjà avec cet e-mail : connecte-toi.'
  if (code === 'weak_password' || msg.includes('password should')) return 'Mot de passe trop faible : 8 caractères minimum.'
  if (code === 'email_not_confirmed') return 'Compte non confirmé : désactive « Confirm email » dans Supabase.'
  if (code === 'email_address_invalid') return 'Adresse e-mail invalide.'
  if (code === 'signup_disabled' || msg.includes('signups not allowed')) return 'Les inscriptions sont fermées.'
  if (error.status === 429) return 'Trop de tentatives. Réessaie dans une minute.'
  return `Connexion impossible : ${error.message ?? 'erreur inconnue'}`
}

export function LoginForm({ next, google }: { next: string; google: boolean }) {
  const supabase = useMemo(() => supabaseBrowser(), [])
  const [mode, setMode] = useState<Mode>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr('')
    if (password.length < 8) { setErr('Mot de passe : 8 caractères minimum.'); return }
    setBusy(true)
    if (mode === 'signup') {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(), password,
        options: { data: { full_name: name.trim() } },
      })
      setBusy(false)
      if (error) { setErr(authMessage(error)); return }
      if (!data.session) { setErr('Compte créé mais non connecté : désactive « Confirm email » dans Supabase.'); return }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      setBusy(false)
      if (error) { setErr(authMessage(error)); return }
    }
    window.location.assign(next)
  }

  async function withGoogle() {
    setErr('')
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    })
    if (error) setErr('Connexion Google indisponible.')
  }

  return (
    <div className="panel">
      <div className="chips" role="group" aria-label="Mode">
        <button type="button" className="chip" aria-pressed={mode === 'login'} onClick={() => { setMode('login'); setErr('') }}>Se connecter</button>
        <button type="button" className="chip" aria-pressed={mode === 'signup'} onClick={() => { setMode('signup'); setErr('') }}>Créer un compte</button>
      </div>
      {google && (
        <>
          <button type="button" className="btn google block" onClick={withGoogle}>Continuer avec Google</button>
          <p className="meta" style={{ textAlign: 'center', margin: '14px 0 2px' }}>ou avec ton e-mail</p>
        </>
      )}
      <form onSubmit={submit}>
        {mode === 'signup' && (
          <>
            <label className="f" htmlFor="name">Prénom ou pseudo</label>
            <input id="name" required maxLength={40} autoComplete="nickname" value={name} onChange={e => setName(e.target.value)} />
          </>
        )}
        <label className="f" htmlFor="email">Adresse e-mail</label>
        <input id="email" type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} />
        <label className="f" htmlFor="password">Mot de passe</label>
        <input id="password" type="password" required minLength={8}
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          value={password} onChange={e => setPassword(e.target.value)} />
        <div className="actions">
          <button className="btn block" disabled={busy}>
            {busy ? '…' : mode === 'signup' ? 'Créer mon compte' : 'Se connecter'}
          </button>
        </div>
      </form>
      {err && <p className="err" role="alert">{err}</p>}
    </div>
  )
}