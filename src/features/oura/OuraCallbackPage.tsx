import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { CircleAlert, Copy, Link2 } from 'lucide-react'
import { ouraRedirectUri, parseOuraRedirect } from '@/content/oura/oura'
import { saveSecret } from '@/db/secrets'
import { copyText } from '@/lib/clipboard'
import { userMessage } from '@/lib/errors'
import { frenchSpacing } from '@/lib/typography'
import { Button, ButtonLink } from '@/ui/Button'
import { Page } from '@/ui/Page'
import { PageSpinner } from '@/ui/PageSpinner'
import { useToast } from '@/ui/toast-context'
import { acceptOuraLink, OURA_SETTINGS_PATH } from './oura-view'
import { clearOuraState, storedOuraState } from './oura-state'

type Outcome =
  | { kind: 'save'; token: string; expiresAt: string }
  | { kind: 'copy'; link: string }
  | { kind: 'error'; title: string; text: string }

/**
 * Ce qu'Oura renvoie, lu une fois à l'arrivée. Le jeton est gardé seulement si la demande vient de
 * cette appli (même `state`) ; sinon la page s'est ouverte ailleurs (Safari) : on propose de copier
 * le lien pour le coller dans CaliTrack.
 */
function readOutcome(hash: string): Outcome {
  const redirect = parseOuraRedirect(hash)
  const stored = storedOuraState()
  if (redirect.status === 'ok') {
    return stored !== null && redirect.state === stored
      ? { kind: 'save', token: redirect.token, expiresAt: redirect.expiresAt }
      : { kind: 'copy', link: `${ouraRedirectUri(window.location.origin, import.meta.env.BASE_URL)}${hash}` }
  }
  const accepted = acceptOuraLink(redirect, null)
  return {
    kind: 'error',
    title: redirect.status === 'denied' ? 'Accès refusé' : 'Lien incomplet',
    text: accepted.ok ? '' : accepted.error,
  }
}

/** Le retour d'Oura après l'autorisation. */
export function OuraCallbackPage() {
  const { hash } = useLocation()
  const navigate = useNavigate()
  const toast = useToast()
  const [outcome, setOutcome] = useState(() => readOutcome(hash))
  const saved = useRef(false)

  useEffect(() => {
    if (outcome.kind !== 'save' || saved.current) return
    saved.current = true
    saveSecret('oura', outcome.token, outcome.expiresAt)
      .then(() => {
        clearOuraState()
        toast('Bague Oura connectée')
        // Remplace l'adresse : le jeton ne reste pas dans l'historique.
        void navigate(OURA_SETTINGS_PATH, { replace: true })
      })
      .catch((e: unknown) => {
        setOutcome({
          kind: 'error',
          title: 'Connexion impossible',
          text: userMessage(e, 'Enregistrement impossible, réessaie.'),
        })
      })
  }, [outcome, navigate, toast])

  const pageProps = {
    title: 'Connexion à Oura',
    back: true,
    backTo: OURA_SETTINGS_PATH,
    backLabel: 'Oura',
    noTabBar: true,
  } as const

  if (outcome.kind === 'save') {
    return (
      <Page {...pageProps}>
        <PageSpinner />
      </Page>
    )
  }

  if (outcome.kind === 'copy') {
    const link = outcome.link
    return (
      <Page {...pageProps}>
        <div className="flex flex-col gap-3 rounded-2xl bg-surface p-4">
          <div className="flex items-center gap-3">
            <Link2 size={22} className="shrink-0 text-accent-text" aria-hidden />
            <h2 className="text-[17px] font-semibold text-ink">Dernière étape</h2>
          </div>
          <p className="text-[14px] text-ink-2">
            {frenchSpacing(
              'Cette page s’est ouverte en dehors de CaliTrack. Copie ce lien, ouvre CaliTrack, puis colle-le dans Plus, Bague Oura, « Lien de retour ».',
            )}
          </p>
          <textarea
            readOnly
            value={link}
            rows={4}
            aria-label="Lien de retour"
            className="w-full resize-none rounded-xl bg-surface-2 p-3 text-[13px] break-all text-ink"
            onFocus={(e) => e.target.select()}
          />
          <Button
            icon={<Copy size={18} aria-hidden />}
            onClick={() => {
              void copyText(link).then((copied) =>
                copied
                  ? toast('Lien copié')
                  : toast(frenchSpacing('Copie impossible : sélectionne le lien et copie-le.'), 'error'),
              )
            }}
          >
            Copier le lien
          </Button>
        </div>
      </Page>
    )
  }

  return (
    <Page {...pageProps}>
      <div className="flex flex-col items-center gap-2 rounded-2xl bg-surface px-6 py-6 text-center">
        <CircleAlert size={32} className="mb-1 text-ink-3" aria-hidden />
        <h2 className="text-[17px] font-semibold text-ink">{outcome.title}</h2>
        <p className="text-[14px] text-ink-2">{outcome.text}</p>
        <ButtonLink to={OURA_SETTINGS_PATH} block className="mt-3">
          Revenir aux réglages Oura
        </ButtonLink>
      </div>
    </Page>
  )
}
