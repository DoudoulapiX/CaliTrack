import { Sparkles } from 'lucide-react'
import { frenchSpacing } from '@/lib/typography'
import { EmptyState } from '@/ui/Controls'
import { Page } from '@/ui/Page'

/** Coach physique (écran en préparation). */
export function BodyCoachPage() {
  return (
    <Page title="Coach physique" back backTo="/nutrition" backLabel="Nutrition">
      <EmptyState
        icon={<Sparkles size={36} aria-hidden />}
        title="Bientôt ici"
        text={frenchSpacing('Le point sur ta silhouette, ta phase et tes objectifs.')}
      />
    </Page>
  )
}
