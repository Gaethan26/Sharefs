import Link from 'next/link'
import { redirect } from 'next/navigation'
import { supabaseServer } from '@/lib/supabase/server'
import { Artwork, ArtBackdrop, Cartel } from '@/components/Artwork'
import { PosterWall } from '@/components/PosterWall'
import { ART_PALETTES, paletteVars } from '@/lib/palettes'
import type { ArtKey } from '@/lib/art'

/* Chaque salle prend les couleurs de son propre tableau */
const ROOMS: { k: Exclude<ArtKey, 'orrery'>; tone: 'light' | 'dark'; title: string; text: string }[] = [
  { k: 'liseuse', tone: 'light', title: 'Une œuvre par mois', text: 'Pas un fil sans fin. Une seule recommandation par mois et par salon : celle qui compte vraiment pour toi.' },
  { k: 'lettre', tone: 'light', title: 'Des avis scellés', text: 'Comme une lettre qu’on ouvre seul. Tu ne lis ce que les autres en ont pensé qu’après avoir livré ton propre regard.' },
  { k: 'tricheur', tone: 'dark', title: 'Le pari', text: 'Celui qui recommande parie sur ta note. À la fin, on découvre s’il te connaît vraiment.' },
  { k: 'lune', tone: 'dark', title: 'Les échanges', text: 'Quand vous avez tous fini, la conversation s’ouvre. Celle qu’on ne peut pas avoir sans tout dévoiler.' },
]

export default async function Home() {
  const supabase = await supabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/a-faire')
  return (
    <main className="landing">
      <section className="hero" style={paletteVars(ART_PALETTES.orrery)}>
        <ArtBackdrop k="orrery" width={1920} />
        <div className="hero-top">
          <span className="brand"><span className="logo">Sharefs</span></span>
          <Link className="hero-link" href="/login">Se connecter</Link>
        </div>
        <div className="hero-in">
          <div>
            <p className="kicker">Tu verras…</p>
            <h1>On s’est toujours rassemblés autour d’une lumière pour se raconter le monde.</h1>
            <p>Sur Sharefs, chacun expose les œuvres qui l’ont construit. Chaque mois, tu en offres une à tes proches, avec ces deux mots : tu verras. Ils ont un mois pour la vivre. Ensuite, vous en parlez.</p>
            <Link className="btn" href="/login">Commencer</Link>
          </div>
          <Cartel k="orrery" />
        </div>
      </section>

      <PosterWall />

      <section className="epigraph">
        <blockquote>« Chaque lecteur est, quand il lit, le propre lecteur de soi-même. »</blockquote>
        <cite>Marcel Proust, Le Temps retrouvé</cite>
      </section>

      {ROOMS.map((r, i) => (
        <section key={r.k} className={`wall-band ${r.tone}`} style={paletteVars(ART_PALETTES[r.k])}>
          <div className={`room${i % 2 ? ' flip' : ''}`}>
            <Artwork k={r.k} width={1280} />
            <div>
              <h2>{r.title}</h2>
              <p>{r.text}</p>
            </div>
          </div>
        </section>
      ))}

      <section className="coda">
        <h2>Ton exposition t’attend.</h2>
        <Link className="btn" href="/login">Créer mon compte</Link>
      </section>
      <p className="credits">Tableaux du domaine public via Wikimedia Commons. Affiches : TMDB. Ce produit utilise l’API TMDB sans être approuvé ni certifié par TMDB.</p>
    </main>
  )
}
