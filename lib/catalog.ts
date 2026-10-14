import 'server-only'
import type { Kind } from './kinds'
import type { Work, WorkInput } from './types'

const TMDB_IMG = 'https://image.tmdb.org/t/p/'

async function tmdb(path: string, params: Record<string, string> = {}, revalidate = 3600) {
  const key = process.env.TMDB_API_KEY
  if (!key) return null
  const url = new URL('https://api.themoviedb.org/3' + path)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  const bearer = key.startsWith('eyJ')
  if (!bearer) url.searchParams.set('api_key', key)
  const res = await fetch(url, { headers: bearer ? { Authorization: `Bearer ${key}` } : {}, next: { revalidate } })
  return res.ok ? res.json() : null
}

const year = (s?: string) => (s && /^\d{4}/.test(s) ? Number(s.slice(0, 4)) : null)
const https = (u?: string | null) => (u ? u.replace(/^http:\/\//, 'https://') : null)

export const catalogEnabled = (): Record<Kind, boolean> => ({
  film: !!process.env.TMDB_API_KEY,
  serie: !!process.env.TMDB_API_KEY,
  livre: true,
  jeu: !!process.env.RAWG_API_KEY,
})

export async function searchCatalog(kind: Kind, q: string): Promise<WorkInput[]> {
  if (kind === 'film' || kind === 'serie') {
    const type = kind === 'film' ? 'movie' : 'tv'
    const j = await tmdb(`/search/${type}`, { query: q, language: 'fr-FR', include_adult: 'false' })
    return (j?.results ?? []).slice(0, 10).map((r: any) => ({
      kind, title: r.title ?? r.name, creator: null,
      year: year(r.release_date ?? r.first_air_date),
      cover_url: r.poster_path ? TMDB_IMG + 'w342' + r.poster_path : null,
      synopsis: r.overview || null, source: `tmdb-${type === 'movie' ? 'movie' : 'tv'}`, external_id: String(r.id),
    }))
  }
  if (kind === 'livre') {
    const url = new URL('https://www.googleapis.com/books/v1/volumes')
    url.searchParams.set('q', q); url.searchParams.set('maxResults', '10'); url.searchParams.set('printType', 'books')
    if (process.env.GOOGLE_BOOKS_API_KEY) url.searchParams.set('key', process.env.GOOGLE_BOOKS_API_KEY)
    const res = await fetch(url, { next: { revalidate: 3600 } })
    const j = res.ok ? await res.json() : null
    return (j?.items ?? []).map((b: any) => ({
      kind, title: b.volumeInfo?.title ?? 'Sans titre', creator: (b.volumeInfo?.authors ?? []).join(', ') || null,
      year: year(b.volumeInfo?.publishedDate), cover_url: https(b.volumeInfo?.imageLinks?.thumbnail),
      synopsis: b.volumeInfo?.description?.slice(0, 1200) ?? null, source: 'gbooks', external_id: b.id,
    }))
  }
  const key = process.env.RAWG_API_KEY
  if (!key) return []
  const res = await fetch(`https://api.rawg.io/api/games?key=${key}&page_size=10&search=${encodeURIComponent(q)}`, { next: { revalidate: 3600 } })
  const j = res.ok ? await res.json() : null
  return (j?.results ?? []).map((g: any) => ({
    kind, title: g.name, creator: null, year: year(g.released), cover_url: https(g.background_image),
    synopsis: null, source: 'rawg', external_id: String(g.id),
  }))
}

/** Classiques du cinéma pour le mur d'affiches de l'accueil (via TMDB, attribution affichée) */
const CLASSICS: { q: string; y: number; t: 'movie' | 'tv' }[] = [
  { q: 'Pulp Fiction', y: 1994, t: 'movie' },
  { q: 'The Lord of the Rings: The Fellowship of the Ring', y: 2001, t: 'movie' },
  { q: 'The Godfather', y: 1972, t: 'movie' },
  { q: 'Spirited Away', y: 2001, t: 'movie' },
  { q: 'In the Mood for Love', y: 2000, t: 'movie' },
  { q: 'Amélie', y: 2001, t: 'movie' },
  { q: '2001: A Space Odyssey', y: 1968, t: 'movie' },
  { q: 'Interstellar', y: 2014, t: 'movie' },
  { q: 'Breaking Bad', y: 2008, t: 'tv' },
]

export type Poster = { title: string; year: number; poster: string }

export async function classicPosters(): Promise<Poster[]> {
  if (!process.env.TMDB_API_KEY) return []
  const found = await Promise.all(CLASSICS.map(async c => {
    const params: Record<string, string> = { query: c.q, language: 'fr-FR' }
    params[c.t === 'movie' ? 'year' : 'first_air_date_year'] = String(c.y)
    const j = await tmdb(`/search/${c.t}`, params, 60 * 60 * 24 * 7).catch(() => null)
    const r = j?.results?.[0]
    return r?.poster_path ? { title: (r.title ?? r.name) as string, year: c.y, poster: TMDB_IMG + 'w500' + r.poster_path } : null
  }))
  return found.filter((p): p is Poster => !!p)
}

export type Providers = { link: string | null; flatrate: P[]; rent: P[]; buy: P[] }
type P = { name: string; logo: string }

/** Disponibilités en France (données JustWatch via TMDB) */
export async function getProviders(w: Work): Promise<Providers | null> {
  if (!w.source?.startsWith('tmdb-') || !w.external_id) return null
  const type = w.source === 'tmdb-tv' ? 'tv' : 'movie'
  const j = await tmdb(`/${type}/${w.external_id}/watch/providers`, {}, 86400).catch(() => null)
  if (!j) return null
  const fr = j.results?.FR
  const map = (a?: any[]) => (a ?? []).map(p => ({ name: p.provider_name, logo: TMDB_IMG + 'w92' + p.logo_path }))
  return { link: fr?.link ?? null, flatrate: map(fr?.flatrate), rent: map(fr?.rent), buy: map(fr?.buy) }
}

export function searchLinks(w: Pick<Work, 'kind' | 'title' | 'creator'>) {
  const qt = encodeURIComponent(w.title)
  const q = encodeURIComponent([w.title, w.creator].filter(Boolean).join(' '))
  if (w.kind === 'film' || w.kind === 'serie') return [
    { label: 'JustWatch', url: `https://www.justwatch.com/fr/recherche?q=${qt}` },
    { label: 'Bande-annonce', url: `https://www.youtube.com/results?search_query=${encodeURIComponent(w.title + ' bande annonce VF')}` },
  ]
  if (w.kind === 'livre') return [
    { label: 'Chez un libraire', url: `https://www.leslibraires.fr/recherche/?q=${q}` },
    { label: 'Extrait', url: `https://www.google.com/search?tbm=bks&q=${q}` },
  ]
  return [
    { label: 'Steam', url: `https://store.steampowered.com/search/?term=${qt}` },
    { label: 'Durée de jeu', url: `https://howlongtobeat.com/?q=${qt}` },
  ]
}
