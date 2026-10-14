import 'server-only'

/** Tableaux du domaine public, résolus via l'API Wikipédia (image Wikimedia Commons) */
export const ART = {
  orrery: {
    page: 'A_Philosopher_Lecturing_on_the_Orrery',
    title: 'Un philosophe faisant une conférence sur le planétaire',
    artist: 'Joseph Wright of Derby', date: 'vers 1766', place: 'Derby Museum and Art Gallery',
  },
  liseuse: {
    page: 'A_Young_Girl_Reading',
    title: 'La Liseuse',
    artist: 'Jean-Honoré Fragonard', date: 'vers 1769', place: 'National Gallery of Art, Washington',
  },
  lettre: {
    page: 'Girl_Reading_a_Letter_at_an_Open_Window',
    title: 'Jeune fille lisant une lettre à une fenêtre',
    artist: 'Johannes Vermeer', date: 'vers 1657-1659', place: 'Gemäldegalerie Alte Meister, Dresde',
  },
  tricheur: {
    page: 'The_Cheat_with_the_Ace_of_Diamonds',
    title: 'Le Tricheur à l’as de carreau',
    artist: 'Georges de La Tour', date: 'vers 1636-1638', place: 'Musée du Louvre, Paris',
  },
  lune: {
    page: 'Two_Men_Contemplating_the_Moon',
    title: 'Deux hommes contemplant la lune',
    artist: 'Caspar David Friedrich', date: '1819-1820', place: 'Galerie Neue Meister, Dresde',
  },
} as const

export type ArtKey = keyof typeof ART

export async function artSrc(key: ArtKey, width = 1280): Promise<string | null> {
  try {
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${ART[key].page}`, {
      headers: { 'User-Agent': 'TuVerras/1.0 (https://github.com/Gaethan26/Sharefs)', accept: 'application/json' },
      next: { revalidate: 60 * 60 * 24 * 7 },
    })
    if (!res.ok) return null
    const j = await res.json()
    const orig = j.originalimage as { source: string; width: number } | undefined
    const thumb = j.thumbnail as { source: string } | undefined
    if (orig?.source && orig.width <= width) return orig.source
    if (thumb?.source && /\/\d+px-/.test(thumb.source)) return thumb.source.replace(/\/\d+px-/, `/${width}px-`)
    return orig?.source ?? null
  } catch {
    return null
  }
}
