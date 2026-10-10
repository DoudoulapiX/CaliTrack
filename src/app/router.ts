import { createBrowserRouter } from 'react-router'
import { appRoutes } from './routes'

/** GitHub Pages sert l'appli sous /CaliTrack/ : les adresses internes sont relatives à ce chemin. */
export const BASENAME = import.meta.env.BASE_URL.replace(/\/$/, '')

let router: ReturnType<typeof createBrowserRouter> | null = null

/** Routeur unique de l'appli (créé au premier affichage). */
export function appRouter(): ReturnType<typeof createBrowserRouter> {
  router ??= createBrowserRouter(appRoutes, { basename: BASENAME })
  return router
}
