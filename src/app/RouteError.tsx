import { isRouteErrorResponse, Link, useRouteError } from 'react-router'
import { TriangleAlert } from 'lucide-react'
import { buttonClass } from '@/ui/button-class'

/** Écran affiché si une page plante : l'appli reste utilisable et les données sont intactes. */
export function RouteError() {
  const error = useRouteError()
  const notFound = isRouteErrorResponse(error) && error.status === 404
  const detail = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : String(error)

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-canvas p-8 pt-safe text-center">
      <TriangleAlert size={40} className="text-warning" aria-hidden />
      <h1 className="text-[22px] font-bold text-ink">
        {notFound ? 'Page introuvable' : 'Oups, un souci sur cet écran'}
      </h1>
      <p className="max-w-sm text-[15px] text-ink-2">
        {notFound
          ? 'Cette adresse n’existe pas dans CaliTrack.'
          : 'Tes données sont intactes. Recharge l’appli ; si le problème revient, fais une sauvegarde depuis Plus › Sauvegarde.'}
      </p>
      {!notFound && <p className="max-w-sm text-[12px] break-words text-ink-3">{detail}</p>}
      <div className="flex gap-2">
        <Link to="/" className={buttonClass('secondary')}>
          Accueil
        </Link>
        <button
          type="button"
          className={buttonClass('primary')}
          onClick={() => {
            window.location.reload()
          }}
        >
          Recharger
        </button>
      </div>
    </div>
  )
}
