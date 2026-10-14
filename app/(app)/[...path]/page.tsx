import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { artSrc } from '@/lib/art'
import { catalogEnabled } from '@/lib/catalog'
import { App } from '@/components/app/App'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Tu verras…' }

/* Point d'entrée unique de l'application : tout le reste se passe dans le navigateur */
export default async function AppPage({ params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  if (path.some(p => p.includes('.'))) notFound()
  const { user } = await requireUser()
  const [orrery, lune] = await Promise.all([artSrc('orrery', 1280), artSrc('lune', 960)])
  return (
    <App userId={user.id} email={user.email ?? ''} appUrl={process.env.NEXT_PUBLIC_APP_URL ?? ''}
      ai={!!process.env.ANTHROPIC_API_KEY} catalog={catalogEnabled()} art={{ orrery, lune }} />
  )
}
