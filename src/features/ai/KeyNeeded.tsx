import { Sparkles } from 'lucide-react'
import { frenchSpacing } from '@/lib/typography'
import { ButtonLink } from '@/ui/Button'
import { EmptyState } from '@/ui/Controls'
import { AI_SETTINGS_PATH } from './ai-view'

/** Le coach passe par Claude : sans clé, on renvoie vers les réglages de l'IA. */
export function KeyNeeded({
  text = 'Le coach passe par Claude, avec ta propre clé, gardée sur cet iPhone.',
}: {
  text?: string
}) {
  return (
    <EmptyState
      icon={<Sparkles size={36} aria-hidden />}
      title="Ajoute ta clé Claude pour utiliser le coach."
      text={frenchSpacing(text)}
      action={<ButtonLink to={AI_SETTINGS_PATH}>Ajouter ma clé</ButtonLink>}
    />
  )
}
