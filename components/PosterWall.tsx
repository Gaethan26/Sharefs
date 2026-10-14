import { classicPosters } from '@/lib/catalog'
import { PosterRow } from './PosterRow'

/* Mur d'affiches de classiques : n'apparaît que si la clé TMDB est configurée */
export async function PosterWall() {
  const posters = await classicPosters()
  if (!posters.length) return null
  return (
    <section className="posters">
      <h2>Les histoires qu’on se transmet depuis toujours.</h2>
      <p>Celles qu’un ami t’a mises entre les mains un jour, en te disant simplement : tu verras.</p>
      <PosterRow posters={posters} />
    </section>
  )
}
