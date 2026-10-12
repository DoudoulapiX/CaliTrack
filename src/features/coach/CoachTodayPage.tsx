import { Sparkles } from 'lucide-react'
import { frenchSpacing } from '@/lib/typography'
import { EmptyState } from '@/ui/Controls'
import { Page } from '@/ui/Page'

/** Coach du jour (écran en préparation). */
export function CoachTodayPage() {
  return (
    <Page title="Coach du jour" back backTo="/training" backLabel="Entraînement">
      <EmptyState
        icon={<Sparkles size={36} aria-hidden />}
        title="Bientôt ici"
        text={frenchSpacing('Ta séance du jour, ajustée à ta forme par le coach.')}
      />
    </Page>
  )
}
