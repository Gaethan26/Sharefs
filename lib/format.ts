const TZ = 'Europe/Paris'
export const DAY = 86_400_000

export const fmtDate = (d: string | number | Date) =>
  new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: TZ })
export const fmtDateTime = (d: string | number | Date) =>
  new Date(d).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: TZ })
export const monthLabel = (d: Date = new Date()) =>
  d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: TZ })

/** "2026-10", calé sur l'heure de Paris comme le défaut SQL */
export function monthKey(d: Date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', { year: 'numeric', month: '2-digit', timeZone: TZ }).formatToParts(d)
  return `${parts.find(p => p.type === 'year')!.value}-${parts.find(p => p.type === 'month')!.value}`
}

export const daysLeft = (deadline: string) => Math.ceil((new Date(deadline).getTime() - Date.now()) / DAY)
export const starsTxt = (n?: number | null) => (n ? '★'.repeat(n) + '☆'.repeat(5 - n) : '')
export const avg1 = (n: number) => n.toFixed(1).replace('.', ',')

export function betVerdict(bet: number, rating: number) {
  const d = Math.abs(bet - rating)
  return d === 0 ? 'dans le mille' : d === 1 ? 'à une étoile près' : 'raté'
}
