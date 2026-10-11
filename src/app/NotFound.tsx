import { Compass } from 'lucide-react'
import { ButtonLink } from '@/ui/Button'
import { EmptyState } from '@/ui/Controls'
import { Page } from '@/ui/Page'

/** Adresse inconnue (lien ancien ou mal tapé). */
export function NotFound() {
  return (
    <Page title="Page introuvable" back backTo="/">
      <EmptyState
        icon={<Compass size={32} aria-hidden />}
        title="Cette page n’existe pas"
        text="Le lien est peut-être ancien."
        action={<ButtonLink to="/">Retour à l’accueil</ButtonLink>}
      />
    </Page>
  )
}
