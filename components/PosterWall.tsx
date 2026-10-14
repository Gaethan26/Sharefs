import { classicPosters } from '@/lib/catalog'

/** Mur d'affiches de classiques : n'apparaît que si la clé TMDB est configurée */
export async function PosterWall() {
  const posters = await classicPosters()
  if (!posters.length) return null
  return (
    <section className="posters">
      <h2>Les histoires qu’on se transmet depuis toujours.</h2>
      <p>Celles qu’un ami t’a mises entre les mains un jour, en te disant simplement : tu verras.</p>
      <ul className="poster-row">
        {posters.map(p => (
          <li key={p.title}>
            <span className="frame"><img src={p.poster} alt={`Affiche : ${p.title}`} loading="lazy" /></span>
            <div className="cartel"><span className="cartel-title">{p.title}</span><span className="cartel-meta">{p.year}</span></div>
          </li>
        ))}
      </ul>
    </section>
  )
}
