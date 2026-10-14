import Link from 'next/link'
import { redirect } from 'next/navigation'
import { supabaseServer } from '@/lib/supabase/server'
import { Artwork, ArtBackdrop, Cartel } from '@/components/Artwork'
import type { ArtKey } from '@/lib/art'

const ROOMS: { k: ArtKey; title: string; text: string }[] = [
  { k: 'liseuse', title: 'Une œuvre par mois', text: 'Pas un fil sans fin. Une seule recommandation par mois et par cercle : celle qui compte vraiment pour toi, celle qui t’a changé un peu.' },
  { k: 'lettre', title: 'Des avis scellés', text: 'Comme une lettre qu’on ouvre seul. Tu ne lis ce que les autres en ont pensé qu’après avoir livré ton propre regard.' },
  { k: 'tricheur', title: 'Le pari', text: 'Celui qui recommande parie sur ta note. À la fin, on découvre s’il te connaît vraiment, ou s’il s’est trahi.' },
  { k: 'lune', title: 'Le salon', text: 'Quand vous avez tous fini, la conversation s’ouvre. Celle qu’on ne peut pas avoir sans tout dévoiler.' },
]

export default async function Home() {
  const supabase = await supabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/a-faire')
  return (
    <main className="landing">
      <section className="hero">
        <ArtBackdrop k="orrery" width={1920} />
        <div className="hero-top">
          <span className="brand">Le Cercle</span>
          <Link className="hero-link" href="/login">Se connecter</Link>
        </div>
        <div className="hero-in">
          <div>
            <h1>On s’est toujours rassemblés autour d’une lumière pour se raconter le monde.</h1>
            <p>Le Cercle est une veillée entre amis. Chaque mois, tu confies à tes proches un livre, un film, une série ou un jeu qui t’a marqué. Ils ont un mois pour le vivre. Ensuite, vous en parlez.</p>
            <Link className="btn" href="/login">Entrer dans le cercle</Link>
          </div>
          <Cartel k="orrery" />
        </div>
      </section>

      <section className="epigraph">
        <blockquote>« Chaque lecteur est, quand il lit, le propre lecteur de soi-même. »</blockquote>
        <cite>Marcel Proust, Le Temps retrouvé</cite>
      </section>

      <div className="rooms">
        {ROOMS.map(r => (
          <section key={r.k} className="room">
            <Artwork k={r.k} width={1280} />
            <div>
              <h2>{r.title}</h2>
              <p>{r.text}</p>
            </div>
          </section>
        ))}
      </div>

      <section className="coda">
        <h2>Ta première veillée commence quand tu veux.</h2>
        <Link className="btn" href="/login">Créer mon compte</Link>
      </section>
    </main>
  )
}
