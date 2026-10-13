type AffReco = {
  sender_id: string
  secret: { sender_rating: number | null } | null
  reviews: { user_id: string; rating: number }[]
}

/** Affinité de goût : 100 % = mêmes notes, 0 % = 4 étoiles d'écart en moyenne */
export function affinities(recos: AffReco[], me: string) {
  const acc = new Map<string, { sum: number; n: number }>()
  for (const r of recos) {
    const ratings = new Map<string, number>()
    if (r.secret?.sender_rating) ratings.set(r.sender_id, r.secret.sender_rating)
    for (const v of r.reviews ?? []) ratings.set(v.user_id, v.rating)
    const mine = ratings.get(me)
    if (!mine) continue
    for (const [u, v] of ratings) {
      if (u === me) continue
      const a = acc.get(u) ?? { sum: 0, n: 0 }
      a.sum += Math.abs(mine - v); a.n++
      acc.set(u, a)
    }
  }
  const out = new Map<string, { pct: number; n: number }>()
  for (const [u, a] of acc) out.set(u, { pct: Math.round(100 - (a.sum / a.n) * 25), n: a.n })
  return out
}
