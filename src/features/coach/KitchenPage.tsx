import { Sparkles } from 'lucide-react'
import { frenchSpacing } from '@/lib/typography'
import { EmptyState } from '@/ui/Controls'
import { Page } from '@/ui/Page'

/** Frigo et placards (écran en préparation). */
export function KitchenPage() {
  return (
    <Page title="Frigo et placards" back backTo="/nutrition" backLabel="Nutrition">
      <EmptyState
        icon={<Sparkles size={36} aria-hidden />}
        title="Bientôt ici"
        text={frenchSpacing('Ce que tu as chez toi, pour des idées de repas.')}
      />
    </Page>
  )
}
