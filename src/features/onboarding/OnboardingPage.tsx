import { updateSettings } from '@/db/settings'
import { Button } from '@/ui/Button'
import { Page } from '@/ui/Page'

export function OnboardingPage() {
  return (
    <Page title="Bienvenue" noTabBar>
      <Button
        block
        size="lg"
        onClick={() => {
          // L'appli quitte l'accueil d'elle-même dès que le réglage est enregistré.
          void updateSettings({ onboardingDone: true })
        }}
      >
        Commencer
      </Button>
    </Page>
  )
}
