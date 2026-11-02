import { AppIconMark } from './AppIconMark'

/**
 * Écran de chargement : l'icône de l'appli, dont l'anneau se remplit à l'ouverture (`intro`). Le parent
 * apprend le début et la fin du remplissage pour garder l'écran jusqu'au bout.
 */
export function Splash({
  label = 'Chargement…',
  intro = false,
  onIntroStart,
  onIntroEnd,
}: {
  label?: string
  intro?: boolean
  onIntroStart?: () => void
  onIntroEnd?: () => void
}) {
  return (
    <div
      className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-canvas"
      role="status"
      aria-live="polite"
    >
      <AppIconMark className="size-20" animate={intro} onFillStart={onIntroStart} onFillEnd={onIntroEnd} />
      <p className="text-[15px] text-ink-3">{label}</p>
    </div>
  )
}
