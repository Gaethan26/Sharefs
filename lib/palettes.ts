/** Palettes tirées des tableaux : chaque section prend la couleur de son image */
export type Palette = { deep: string; soft: string; mid: string }

export const NEUTRAL: Palette = { deep: '#22211E', soft: '#ECEAE4', mid: '#77726A' }

export const ART_PALETTES: Record<'orrery' | 'liseuse' | 'lettre' | 'tricheur' | 'lune', Palette> = {
  orrery: { deep: '#1C130C', soft: '#F2E6D2', mid: '#B4773C' },   /* ombres brunes, lampe ambrée */
  liseuse: { deep: '#3B2F1B', soft: '#F3EBCB', mid: '#B98F2E' },  /* robe jaune citron, fond olive */
  lettre: { deep: '#283024', soft: '#E3E5D9', mid: '#5D6B4A' },   /* rideau vert, mur gris clair */
  tricheur: { deep: '#1B130E', soft: '#F1E0D3', mid: '#A9472F' }, /* nuit, manches vermillon */
  lune: { deep: '#25221B', soft: '#ECE6D1', mid: '#8A7D52' },     /* crépuscule olive, lune pâle */
}

export const paletteVars = (p?: Palette | null): React.CSSProperties =>
  (p ? { ['--deep' as string]: p.deep, ['--soft' as string]: p.soft, ['--mid' as string]: p.mid } : {})
