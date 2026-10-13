import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { NavLinks } from '@/components/client'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user } = await requireUser()
  const { count } = await supabase.from('challenges').select('reco_id', { count: 'exact', head: true })
    .eq('user_id', user.id).eq('status', 'active')
  return (
    <>
      <header className="top">
        <div className="top-in">
          <Link href="/a-faire" className="brand">Le Cercle</Link>
          <NavLinks pending={count ?? 0} />
          <Link href="/envoyer" className="btn small">Envoyer</Link>
        </div>
      </header>
      <main className="wrap">{children}</main>
    </>
  )
}
