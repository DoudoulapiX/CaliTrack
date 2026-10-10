import { Suspense } from 'react'
import { Navigate, Outlet, ScrollRestoration, useLocation, useMatches } from 'react-router'
import { CatalogProvider } from '@/features/library/CatalogProvider'
import { PageSpinner } from '@/ui/PageSpinner'
import { useSettings } from './data-context'
import { TabBar } from './TabBar'

export interface RouteHandle {
  /** Écran plein (séance en cours, accueil) : pas de barre d'onglets. */
  hideTabBar?: boolean
}

function isRouteHandle(value: unknown): value is RouteHandle {
  return typeof value === 'object' && value !== null && 'hideTabBar' in value
}

export function AppShell() {
  const settings = useSettings()
  const location = useLocation()
  const matches = useMatches()
  const hideTabBar = matches.some((m) => isRouteHandle(m.handle) && m.handle.hideTabBar === true)

  // L'accueil s'ouvre et se ferme ici, d'après le réglage enregistré : une fois l'accueil terminé,
  // on n'en sort qu'après la mise à jour des réglages (sinon on y serait renvoyé aussitôt).
  const onOnboarding = location.pathname === '/onboarding'
  if (!settings.onboardingDone && !onOnboarding) return <Navigate to="/onboarding" replace />
  if (settings.onboardingDone && onOnboarding) return <Navigate to="/" replace />

  return (
    <>
      <Suspense fallback={<PageSpinner />}>
        <CatalogProvider>
          <Outlet />
        </CatalogProvider>
      </Suspense>
      {!hideTabBar && <TabBar />}
      <ScrollRestoration />
    </>
  )
}
