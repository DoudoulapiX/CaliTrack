import { LoaderCircle } from 'lucide-react'

/** Attente courte à l'intérieur de l'appli (chargement d'un écran ou des exercices). */
export function PageSpinner() {
  return (
    <div className="flex min-h-dvh items-center justify-center" role="status">
      <LoaderCircle size={28} className="animate-spin text-ink-3" aria-hidden />
      <span className="sr-only">Chargement…</span>
    </div>
  )
}
