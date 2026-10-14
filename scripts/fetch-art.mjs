/* Télécharge les tableaux (domaine public, Wikimedia Commons) dans public/art au moment du build.
   Ils sont ensuite servis par l'app elle-même : plus de dépendance à Wikipédia à l'affichage. */
import fs from 'node:fs/promises'

const ART = {
  orrery: 'A_Philosopher_Lecturing_on_the_Orrery',
  liseuse: 'A_Young_Girl_Reading',
  lettre: 'Girl_Reading_a_Letter_at_an_Open_Window',
  tricheur: 'The_Cheat_with_the_Ace_of_Diamonds',
  lune: 'Two_Men_Contemplating_the_Moon',
}
const UA = 'Sharefs/1.0 (https://github.com/Gaethan26/Sharefs)'
const ok = {}
await fs.mkdir('public/art', { recursive: true })

for (const [key, page] of Object.entries(ART)) {
  try {
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${page}`, { headers: { 'User-Agent': UA, accept: 'application/json' } })
    const s = await res.json()
    const urls = []
    if (s.thumbnail?.source) for (const w of [1280, 960, 1920, 640]) urls.push(s.thumbnail.source.replace(/\/\d+px-/, `/${w}px-`))
    if (s.originalimage?.source) urls.push(s.originalimage.source)
    for (const url of urls) {
      const r = await fetch(url, { headers: { 'User-Agent': UA } })
      if (!r.ok || !(r.headers.get('content-type') ?? '').startsWith('image/')) continue
      const buf = Buffer.from(await r.arrayBuffer())
      if (buf.length < 15_000 || buf.length > 15_000_000) continue
      await fs.writeFile(`public/art/${key}.jpg`, buf)
      ok[key] = true
      break
    }
  } catch { /* on garde la version distante en secours */ }
  console.log(`tableau ${key} : ${ok[key] ? 'téléchargé' : 'échec, secours distant'}`)
}
await fs.writeFile('lib/art-manifest.json', JSON.stringify(ok, null, 2) + '\n')
