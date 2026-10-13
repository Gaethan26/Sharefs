import Link from 'next/link'
import { redirect } from 'next/navigation'
import { supabaseServer } from '@/lib/supabase/server'

export default async function Home() {
  const supabase = await supabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/a-faire')
  return (
    <main className="wrap">
      <div className="brand" style={{ marginTop: 8 }}>Le Cercle</div>
      <section className="hero">
        <h1>Une reco par mois. Un mois pour la vivre.</h1>
        <p>Envoie à tes amis le livre, le film, la série ou le jeu qui compte. Ils ont un mois. Tu sauras enfin ce qu’ils en ont pensé.</p>
        <Link className="btn" href="/login">Entrer dans le cercle</Link>
      </section>
      <div className="rules">
        <div className="panel"><h3>Une seule par mois</h3><p className="meta">La rareté donne du poids : tu choisis vraiment ce que tu recommandes.</p></div>
        <div className="panel"><h3>Avis scellés</h3><p className="meta">Tu ne lis l’avis des autres qu’après avoir posté le tien. Zéro spoiler, zéro influence.</p></div>
        <div className="panel"><h3>Le pari</h3><p className="meta">Celui qui recommande parie sur ta note. Révélé à la fin : il te connaît, ou pas.</p></div>
        <div className="panel"><h3>Le salon</h3><p className="meta">Une discussion ouverte seulement à ceux qui ont fini. Spoilers permis.</p></div>
      </div>
    </main>
  )
}
