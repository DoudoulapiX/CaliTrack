import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { DataProvider } from '@/app/DataProvider'
import { appRoutes } from '@/app/routes'
import { ensureSeeded } from '@/db/seed'
import { updateSettings } from '@/db/settings'
import { ToastProvider } from '@/ui/Toast'
import { resetDb } from './db'

/** Ouvre l'appli complète sur une adresse, avec une base neuve (accueil déjà passé). */
export async function renderApp(path: string, { onboarded = true }: { onboarded?: boolean } = {}) {
  await resetDb()
  await ensureSeeded()
  if (onboarded) await updateSettings({ onboardingDone: true })
  const router = createMemoryRouter(appRoutes, { initialEntries: [path] })
  const user = userEvent.setup()
  render(
    <DataProvider>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </DataProvider>,
  )
  return { router, user }
}
