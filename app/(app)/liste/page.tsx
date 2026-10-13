import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { KINDS, KIND_LIST, type Kind } from '@/lib/kinds'
import { catalogEnabled } from '@/lib/catalog'
import type { Work } from '@/lib/types'
import { Cover, WorkMeta } from '@/components/ui'
import { LibraryAdd } from '@/components/LibraryAdd'
import { removeFromLibrary } from '@/app/actions'

export const metadata = { title: 'Ma liste' }
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
      <h1>Ma liste</h1>
      <p className="sub">Les œuvres qui t’ont construit. Tes amis du cercle peuvent la consulter et y piocher.</p>
      <LibraryAdd enabled={catalogEnabled()} />
      <nav className="chips" aria-label="Filtrer">
        <Link className="chip" href="/liste" aria-current={!filter ? 'true' : undefined}>Tout ({all.length})</Link>
        {KIND_LIST.map(kk => (
          <Link key={kk} className="chip" href={`/liste?k=${kk}`} aria-current={filter === kk ? 'true' : undefined}>
            {KINDS[kk].plural} ({all.filter(i => i.work.kind === kk).length})
          </Link>
        ))}
      </nav>
      <section className="panel">
        {items.length ? (
          <ul className="list">
            {items.map(i => (
              <li key={i.id} className={`item k-${i.work.kind}`}>
                <Cover w={i.work} size="s" />
                <div className="body">
                  <div className="work">{i.work.title}</div>
                  <WorkMeta w={i.work} />
                  {i.note && <p className="why" style={{ marginTop: 4 }}>{i.note}</p>}
                </div>
                <div className="side">
                  <Link className="btn small" href={`/envoyer?work=${i.work.id}`}>Envoyer</Link>
                  <form action={removeFromLibrary.bind(null, i.id)}><button className="btn small ghost" aria-label={`Retirer ${i.work.title}`}>Retirer</button></form>
                </div>
              </li>
            ))}
          </ul>
        ) : <p className="empty">{all.length ? 'Rien dans cette catégorie.' : 'Ta liste est vide. Cherche un titre ci-dessus pour commencer.'}</p>}
      </section>
    </>
  )
}
