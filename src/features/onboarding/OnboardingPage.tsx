import { useNavigate } from 'react-router'
import { updateSettings } from '@/db/settings'
import { Button } from '@/ui/Button'
import { Page } from '@/ui/Page'

export function OnboardingPage() {
  const navigate = useNavigate()
  return (
    <Page title="Bienvenue" noTabBar>
      <Button
        block
        size="lg"
        onClick={() => {
          void updateSettings({ onboardingDone: true }).then(() => navigate('/', { replace: true }))
        }}
      >
        Commencer
      </Button>
    </Page>
  )
}
