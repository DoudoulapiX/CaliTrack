import { Sparkles } from 'lucide-react'
import { frenchSpacing } from '@/lib/typography'
import { EmptyState } from '@/ui/Controls'
import { Page } from '@/ui/Page'

/** Photo du frigo (écran en préparation). */
export function KitchenPhotoPage() {
  return (
    <Page title="Photo du frigo" back backTo="/nutrition/kitchen" backLabel="Frigo" noTabBar>
      <EmptyState
        icon={<Sparkles size={36} aria-hidden />}
        title="Bientôt ici"
        text={frenchSpacing('Photographie ton frigo : le coach note ce qu’il y voit.')}
      />
    </Page>
  )
}
