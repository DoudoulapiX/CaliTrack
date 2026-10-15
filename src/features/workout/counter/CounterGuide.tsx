import type { CountedMovement } from '@/content/reps/types'
import { GUIDE_CHECKLIST, GUIDE_TEXT, GUIDE_TITLE, PLACEMENT_TEXT, WAKE_LOCK_TEXT } from './counter-view'

export interface CounterGuideProps {
  readonly movement: CountedMovement
  /** Annonces vocales coupées : on dit où les activer. */
  readonly voiceOff: boolean
  /** Le téléphone refuse de garder l'écran allumé. */
  readonly wakeLockUnavailable: boolean
  /** Mouvement encore « en essai » : chaque compte se vérifiera avant d'être enregistré. */
  readonly trial?: boolean
}

/**
 * « Place ton téléphone » : où poser le téléphone pour ce mouvement, et comment marche le compteur.
 * Que du texte (le bouton est en bas de la feuille) : la section prend le focus, pour que le texte qui
 * dépasse défile aussi au clavier.
 */
export function CounterGuide({ movement, voiceOff, wakeLockUnavailable, trial = false }: CounterGuideProps) {
  return (
    <section
      aria-labelledby="counter-guide-title"
      tabIndex={0}
      data-focus
      className="flex flex-col gap-3 rounded-xl text-[15px] text-ink-2"
    >
      <h3 id="counter-guide-title" className="text-[20px] font-semibold text-ink">
        {GUIDE_TITLE}
      </h3>
      <p className="text-ink">{PLACEMENT_TEXT[movement]}</p>
      <ul className="flex list-disc flex-col gap-1 pl-5">
        {GUIDE_CHECKLIST.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <p>{GUIDE_TEXT.how}</p>
      {trial && <p>{GUIDE_TEXT.trial}</p>}
      {voiceOff && <p>{GUIDE_TEXT.voiceOff}</p>}
      {wakeLockUnavailable && <p>{WAKE_LOCK_TEXT}</p>}
      <p className="text-[13px] text-ink-3">{GUIDE_TEXT.privacy}</p>
    </section>
  )
}
