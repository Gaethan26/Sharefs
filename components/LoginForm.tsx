'use client'

import { useMemo, useState } from 'react'
import { supabaseBrowser } from '@/lib/supabase/client'

export function LoginForm({ next, google }: { next: string; google: boolean }) {
  const supabase = useMemo(() => supabaseBrowser(), [])
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const redirectTo = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`

  async function sendLink(e: React.FormEvent) {
    e.preventDefault(); setErr(''); setBusy(true)
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: redirectTo() } })
    setBusy(false)
    if (error) setErr(error.status === 429 ? 'Trop de demandes. Réessaie dans une minute.' : 'Envoi impossible. Vérifie l’adresse.')
    else setSent(true)
  }
  async function verify(e: React.FormEvent) {
    e.preventDefault(); setErr(''); setBusy(true)
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' })
    setBusy(false)
    if (error) setErr('Code invalide ou expiré.'); else window.location.assign(next)
  }
  async function withGoogle() {
    setErr('')
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirectTo() } })
    if (error) setErr('Connexion Google indisponible.')
  }

  return (
    <div className="panel">
      {google && (
        <>
          <button type="button" className="btn google block" onClick={withGoogle}>Continuer avec Google</button>
          <p className="meta" style={{ textAlign: 'center', margin: '14px 0 2px' }}>ou par e-mail, sans mot de passe</p>
        </>
      )}
      {!sent ? (
        <form onSubmit={sendLink}>
          <label className="f" htmlFor="email">Adresse e-mail</label>
          <input id="email" type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} />
          <div className="actions"><button className="btn block" disabled={busy}>{busy ? 'Envoi…' : 'Recevoir mon lien de connexion'}</button></div>
        </form>
      ) : (
        <form onSubmit={verify}>
          <p style={{ margin: '0 0 6px' }}>Lien envoyé à <strong>{email}</strong>. Ouvre-le sur cet appareil, ou saisis le code reçu.</p>
          <label className="f" htmlFor="code">Code à 6 chiffres</label>
          <input id="code" inputMode="numeric" autoComplete="one-time-code" maxLength={10} value={code} onChange={e => setCode(e.target.value)} />
          <div className="actions">
            <button className="btn" disabled={busy || code.trim().length < 6}>Se connecter</button>
            <button type="button" className="linkbtn" onClick={() => { setSent(false); setCode('') }}>Changer d’adresse</button>
          </div>
        </form>
      )}
      {err && <p className="err" role="alert">{err}</p>}
    </div>
  )
}
