import type { Work } from './types'

export type Providers = { link: string | null; flatrate: { name: string; logo: string }[]; rent: { name: string; logo: string }[]; buy: { name: string; logo: string }[] }

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
