import { Sparkles } from 'lucide-react'
import { frenchSpacing } from '@/lib/typography'
import { EmptyState } from '@/ui/Controls'
import { Page } from '@/ui/Page'

/** Discussion avec le coach (écran en préparation). */
export function CoachChatPage() {
  return (
    <Page title="Discussion avec le coach" back backTo="/more" backLabel="Plus" noTabBar>
      <EmptyState
        icon={<Sparkles size={36} aria-hidden />}
        title="Bientôt ici"
        text={frenchSpacing('Pose tes questions au coach.')}
      />
    </Page>
  )
}
