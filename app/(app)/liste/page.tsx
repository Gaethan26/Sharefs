import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { KINDS, KIND_LIST, kindOf, type Kind } from '@/lib/kinds'
import { catalogEnabled } from '@/lib/catalog'
import type { Work } from '@/lib/types'
import { Framed } from '@/components/ui'
import { LibraryAdd } from '@/components/LibraryAdd'
import { removeFromLibrary } from '@/app/actions'

export const metadata = { title: 'Ma galerie' }
type Item = { id: string; note: string | null; created_at: string; work: Work }

export default async function Liste({ searchParams }: { searchParams: Promise<{ k?: string }> }) {
  const { k } = await searchParams
  const filter = (k && k in KINDS ? k : null) as Kind | null
  const { supabase, user } = await requireUser()
  const { data } = await supabase.from('library_items').select('id, note, created_at, work:works(id, kind, title, creator, year, cover_url)')
    .eq('user_id', user.id).order('created_at', { ascending: false }).limit(1000)
  const all = (data ?? []) as unknown as Item[]
  const items = filter ? all.filter(i => i.work.kind === filter) : all
  return (
    <>
      <h1>Ma galerie</h1>
      <p className="sub">Les œuvres qui t’ont construit. Tes amis peuvent la parcourir et y piocher.</p>
      <LibraryAdd enabled={catalogEnabled()} />
      <nav className="chips" aria-label="Filtrer" style={{ marginTop: 30 }}>
        <Link className="chip" href="/liste" aria-current={!filter ? 'true' : undefined}>Tout ({all.length})</Link>
        {KIND_LIST.map(kk => (
          <Link key={kk} className="chip" href={`/liste?k=${kk}`} aria-current={filter === kk ? 'true' : undefined}>
            {KINDS[kk].plural} ({all.filter(i => i.work.kind === kk).length})
          </Link>
        ))}
      </nav>
      {items.length ? (
        <ul className="gallery">
          {items.map(i => (
            <li key={i.id} className={`tile k-${i.work.kind}`}>
              <Framed w={i.work} size="g" />
              <div className="cartel">
                <span className="cartel-title">{i.work.title}</span>
                <span>{[i.work.creator, i.work.year].filter(Boolean).join(', ')}</span>
                <span className="kind">{kindOf(i.work.kind).label}</span>
              </div>
              {i.note && <p className="tile-note">{i.note}</p>}
              <div className="tile-actions">
                <Link className="btn small" href={`/envoyer?work=${i.work.id}`}>Recommander</Link>
                <form action={removeFromLibrary.bind(null, i.id)}><button className="btn small ghost" aria-label={`Retirer ${i.work.title}`}>Retirer</button></form>
              </div>
            </li>
          ))}
        </ul>
      ) : <p className="empty">{all.length ? 'Rien dans cette catégorie.' : 'Ta galerie est vide. Cherche une œuvre ci-dessus pour l’accrocher.'}</p>}
    </>
  )
}
