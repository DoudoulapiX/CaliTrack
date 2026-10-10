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

  if (!settings.onboardingDone && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />
  }

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
