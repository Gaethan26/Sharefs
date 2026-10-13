import type { Kind } from './kinds'

export type Person = { id: string; display_name: string | null; avatar_url: string | null }
export type Work = {
  id: string; kind: Kind; title: string; creator: string | null; year: number | null
  cover_url: string | null; synopsis?: string | null; source?: string | null; external_id?: string | null
}
export type WorkInput = {
  kind: Kind; title: string; creator?: string | null; year?: number | null
  cover_url?: string | null; synopsis?: string | null; source?: string | null; external_id?: string | null
}
export type Challenge = {
  user_id: string; status: 'active' | 'done' | 'dropped'; deadline: string; started_at: string
  joker_used: boolean; done_at: string | null; invited: boolean; user?: Person | null
}
export type Review = { user_id: string; rating: number; body: string | null; updated_at?: string }
export type Reco = {
  id: string; circle_id: string; sender_id: string; month: string; why: string | null; pitch: string | null
  effort: string | null; link: string | null; reply_to: string | null; sent_at: string
  work: Work; sender: Person | null; circle: { id: string; name: string } | null; challenges: Challenge[]
}
export type RecoFull = Reco & {
  secret: { sender_rating: number | null; bet: number | null } | null
  reviews: Review[]
}

export const RECO_SELECT = `id, circle_id, sender_id, month, why, pitch, effort, link, reply_to, sent_at,
  work:works(id, kind, title, creator, year, cover_url, synopsis, source, external_id),
  sender:profiles!recos_sender_id_fkey(id, display_name, avatar_url),
  circle:circles(id, name),
  challenges(user_id, status, deadline, started_at, joker_used, done_at, invited, user:profiles(id, display_name, avatar_url))`
