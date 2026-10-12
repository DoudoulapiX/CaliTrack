import { Sparkles } from 'lucide-react'
import { frenchSpacing } from '@/lib/typography'
import { EmptyState } from '@/ui/Controls'
import { Page } from '@/ui/Page'

/** Idées de repas (écran en préparation). */
export function KitchenIdeasPage() {
  return (
    <Page title="Idées de repas" back backTo="/nutrition/kitchen" backLabel="Frigo">
      <EmptyState
        icon={<Sparkles size={36} aria-hidden />}
        title="Bientôt ici"
        text={frenchSpacing('Des idées de repas avec ce que tu as.')}
      />
    </Page>
  )
}
