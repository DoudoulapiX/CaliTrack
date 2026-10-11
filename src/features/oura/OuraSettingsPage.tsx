import { useState, type ReactNode } from 'react'
import { CircleCheck, CircleAlert, Copy, Link2, RefreshCw } from 'lucide-react'
import { useSettings } from '@/app/data-context'
import {
  checkOuraRelay,
  normalizeRelayUrl,
  ouraAuthorizeUrl,
  ouraRedirectUri,
  parseOuraRedirect,
} from '@/content/oura/oura'
import { relayWorkerCode } from '@/content/oura/relay'
import { deleteSecret, saveSecret } from '@/db/secrets'
import { updateSettings } from '@/db/settings'
import { copyText } from '@/lib/clipboard'
import { today as todayISO } from '@/lib/dates'
import { userMessage } from '@/lib/errors'
import { leaveApp } from '@/lib/leave-app'
import { frenchSpacing } from '@/lib/typography'
import { Button } from '@/ui/Button'
import { TextField } from '@/ui/Field'
import { Page, Section } from '@/ui/Page'
import { PageSpinner } from '@/ui/PageSpinner'
import { ConfirmSheet } from '@/ui/Sheet'
import { useToast } from '@/ui/toast-context'
import { accessLine, acceptOuraLink, OURA_PROBLEM_TEXT, RELAY_CHECK_TEXT, syncLine } from './oura-view'
import { clearOuraState, newOuraState, storedOuraState, storeOuraState } from './oura-state'
import { syncOuraNow, useOura, useOuraAutoSync, useOuraSyncing, type OuraStatus } from './useOura'

const CLOUDFLARE_URL = 'https://dash.cloudflare.com/'
const OURA_APPS_URL = 'https://cloud.ouraring.com/oauth/applications'

/** L'adresse de l'appli (pour le relais et la fiche de l'appli chez Oura) et l'adresse de retour. */
function appAddresses() {
  const base = import.meta.env.BASE_URL
  return {
    origin: window.location.origin,
    app: `${window.location.origin}${base}`,
    redirect: ouraRedirectUri(window.location.origin, base),
  }
}

function Note({ children }: { children: string }) {
  return <p className="mt-2 px-1 text-[13px] text-ink-3">{frenchSpacing(children)}</p>
}

function Steps({ children }: { children: ReactNode }) {
  return <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-[14px] text-ink-2">{children}</ol>
}

function ExternalLink({ href, children }: { href: string; children: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="font-medium text-accent-text underline">
      {children}
    </a>
  )
}

/** Copie un texte, avec un message dans tous les cas. */
function useCopy() {
  const toast = useToast()
  return async (text: string, done: string) => {
    if (await copyText(text)) toast(done)
    else toast(frenchSpacing('Copie impossible : sélectionne le texte et copie-le à la main.'), 'error')
  }
}

/** Une adresse à recopier : affichée en entier, avec un bouton pour la copier. */
function CopyLine({
  label,
  value,
  copyLabel,
  done,
}: {
  label: string
  value: string
  copyLabel: string
  done: string
}) {
  const copy = useCopy()
  return (
    <div className="flex items-center gap-2 rounded-xl bg-surface-2 py-1.5 pr-1.5 pl-3">
      <div className="min-w-0 flex-1">
        <p className="text-[12px] text-ink-3">{label}</p>
        <p className="text-[13px] break-all text-ink">{value}</p>
      </div>
      <Button variant="ghost" size="sm" aria-label={copyLabel} onClick={() => void copy(value, done)}>
        <Copy size={18} aria-hidden />
      </Button>
    </div>
  )
}

/** L'adresse du relais : enregistrée puis vérifiée aussitôt. */
function RelayForm({ saved }: { saved: string }) {
  const toast = useToast()
  const [draft, setDraft] = useState(saved)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const check = async (relayUrl: string) => {
    setBusy(true)
    const result = await checkOuraRelay(relayUrl)
    setBusy(false)
    toast(RELAY_CHECK_TEXT[result], result === 'ok' ? 'success' : 'error')
  }

  const save = async () => {
    const relayUrl = normalizeRelayUrl(draft)
    if (relayUrl === null) {
      setError(frenchSpacing('Ce n’est pas une adresse de relais : colle l’adresse complète du Worker.'))
      return
    }
    try {
      await updateSettings({ ouraRelayUrl: relayUrl })
      setDraft(relayUrl)
      await check(relayUrl)
    } catch (e) {
      setError(userMessage(e, 'Enregistrement impossible, réessaie.'))
    }
  }

  const unchanged = normalizeRelayUrl(draft) === saved && saved !== ''
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        void (unchanged ? check(saved) : save())
      }}
    >
      <TextField
        label="Adresse du relais"
        inputMode="url"
        value={draft}
        placeholder="https://calitrack-oura.ton-compte.workers.dev"
        autoComplete="off"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        error={error}
        onChange={(value) => {
          setDraft(value)
          setError(null)
        }}
      />
      <Button type="submit" variant="secondary" disabled={busy || draft.trim() === ''}>
        {busy ? 'Vérification…' : unchanged ? 'Tester le relais' : 'Enregistrer et tester'}
      </Button>
    </form>
  )
}

/** Le Client ID de l'appli créée chez Oura. */
function ClientForm({ saved }: { saved: string }) {
  const toast = useToast()
  const [draft, setDraft] = useState(saved)
  const unchanged = draft.trim() === saved
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        void updateSettings({ ouraClientId: draft.trim() }).then(() => toast('Client ID enregistré'))
      }}
    >
      <TextField
        label="Client ID"
        value={draft}
        autoComplete="off"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        onChange={setDraft}
      />
      <Button type="submit" variant="secondary" disabled={unchanged || draft.trim() === ''}>
        Enregistrer le Client ID
      </Button>
    </form>
  )
}

/** Si le retour d'Oura s'ouvre dans Safari : coller ici le lien de la page affichée. */
function PasteLinkForm() {
  const toast = useToast()
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)

  const accept = async () => {
    const result = acceptOuraLink(parseOuraRedirect(draft), storedOuraState())
    if (!result.ok) {
      setError(result.error)
      return
    }
    await saveSecret('oura', result.token, result.expiresAt)
    clearOuraState()
    setDraft('')
    toast('Bague Oura connectée')
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        void accept()
      }}
    >
      <TextField
        label="Lien de retour"
        value={draft}
        placeholder="https://…/oura/callback#access_token=…"
        autoComplete="off"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        error={error}
        onChange={(value) => {
          setDraft(value)
          setError(null)
        }}
      />
      <Button type="submit" variant="secondary" disabled={draft.trim() === ''}>
        Valider le lien
      </Button>
    </form>
  )
}

/** L'état de la connexion, et ce qu'on peut faire. */
function ConnectionCard({ oura, clientId }: { oura: OuraStatus; clientId: string }) {
  const toast = useToast()
  const syncing = useOuraSyncing()
  const [confirm, setConfirm] = useState(false)
  const day = todayISO()

  const connect = () => {
    const state = newOuraState()
    storeOuraState(state)
    leaveApp(ouraAuthorizeUrl(clientId, appAddresses().redirect, state))
  }

  const sync = async () => {
    const result = await syncOuraNow()
    if (result.status === 'ok') toast('Données Oura à jour')
    else if (result.status === 'notSetUp') toast('Ajoute d’abord l’adresse du relais.', 'error')
    else toast(OURA_PROBLEM_TEXT[result.problem], 'error')
  }

  if (oura.connection === 'connected') {
    const expiresAt = oura.secret?.expiresAt ?? null
    return (
      <div className="flex flex-col gap-3 rounded-2xl bg-surface p-4">
        <div className="flex items-center gap-3">
          <CircleCheck size={22} className="shrink-0 text-success" aria-hidden />
          <div className="min-w-0">
            <p className="text-[16px] text-ink">Bague connectée</p>
            <p className="text-[13px] text-ink-3">{syncLine(oura.lastSync, day)}</p>
            {expiresAt && <p className="text-[13px] text-ink-3">{accessLine(expiresAt, new Date())}</p>}
          </div>
        </div>
        <Button
          variant="secondary"
          disabled={syncing}
          icon={<RefreshCw size={18} aria-hidden />}
          onClick={() => void sync()}
        >
          {syncing ? 'Synchronisation…' : 'Synchroniser maintenant'}
        </Button>
        <Button variant="ghost" onClick={() => setConfirm(true)}>
          Déconnecter la bague
        </Button>
        <ConfirmSheet
          open={confirm}
          onClose={() => setConfirm(false)}
          onConfirm={() => {
            void deleteSecret('oura').then(() => toast('Bague déconnectée'))
          }}
          title={frenchSpacing('Déconnecter la bague ?')}
          message="CaliTrack ne lira plus tes données Oura. Celles déjà enregistrées restent."
          confirmLabel="Déconnecter"
        />
      </div>
    )
  }

  const expired = oura.connection === 'expired'
  const ready = oura.connection !== 'setup' && clientId.trim() !== ''
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-surface p-4">
      <div className="flex items-center gap-3">
        <CircleAlert size={22} className="shrink-0 text-ink-3" aria-hidden />
        <p className="min-w-0 text-[15px] text-ink-2">
          {expired
            ? OURA_PROBLEM_TEXT.expired
            : ready
              ? frenchSpacing('Tout est prêt : connecte ta bague.')
              : 'Fais d’abord les deux étapes ci-dessous.'}
        </p>
      </div>
      <Button disabled={!ready} icon={<Link2 size={18} aria-hidden />} onClick={connect}>
        {expired ? 'Reconnecter ma bague' : 'Connecter ma bague'}
      </Button>
    </div>
  )
}

/** Réglages d'Oura : le relais, l'appli déclarée chez Oura, puis la connexion de la bague. */
export function OuraSettingsPage() {
  const settings = useSettings()
  const oura = useOura()
  const copy = useCopy()
  useOuraAutoSync(oura)
  const addresses = appAddresses()

  return (
    <Page title="Bague Oura" back backTo="/more" backLabel="Plus">
      {oura === undefined ? (
        <PageSpinner />
      ) : (
        <>
          <Section title="Connexion">
            <ConnectionCard oura={oura} clientId={settings.ouraClientId} />
            {oura.connection !== 'connected' && oura.connection !== 'setup' && (
              <Note>
                Le retour d’Oura s’ouvre parfois dans Safari au lieu de CaliTrack : copie alors le lien de la
                page affichée et colle-le ci-dessous.
              </Note>
            )}
          </Section>
          {oura.connection !== 'connected' && oura.connection !== 'setup' && (
            <Section title="Coller le lien de retour">
              <div className="rounded-2xl bg-surface p-4">
                <PasteLinkForm />
              </div>
            </Section>
          )}

          <Section title={frenchSpacing('Étape 1 : le relais')}>
            <div className="flex flex-col gap-4 rounded-2xl bg-surface p-4">
              <p className="text-[14px] text-ink-2">
                {frenchSpacing(
                  'Oura ne laisse pas une appli web lire tes données directement. Un petit relais gratuit, chez Cloudflare, transmet les demandes sans rien garder.',
                )}
              </p>
              <Steps>
                <li>
                  Crée un compte gratuit sur{' '}
                  <ExternalLink href={CLOUDFLARE_URL}>dash.cloudflare.com</ExternalLink>.
                </li>
                <li>
                  {frenchSpacing(
                    'Ouvre « Workers & Pages », puis « Create » et « Start with Hello World! ». Nomme-le calitrack-oura et déploie-le.',
                  )}
                </li>
                <li>
                  {frenchSpacing(
                    'Choisis « Edit code », remplace tout le code par celui de CaliTrack, puis « Deploy ».',
                  )}
                </li>
                <li>Colle l’adresse du Worker (elle finit par workers.dev) dans le champ ci-dessous.</li>
              </Steps>
              <Button
                variant="secondary"
                icon={<Copy size={18} aria-hidden />}
                onClick={() => void copy(relayWorkerCode(addresses.origin), 'Code du relais copié')}
              >
                Copier le code du relais
              </Button>
              <RelayForm saved={settings.ouraRelayUrl} />
            </div>
          </Section>

          <Section title={frenchSpacing('Étape 2 : l’appli chez Oura')}>
            <div className="flex flex-col gap-4 rounded-2xl bg-surface p-4">
              <Steps>
                <li>
                  Ouvre{' '}
                  <ExternalLink href={OURA_APPS_URL}>cloud.ouraring.com/oauth/applications</ExternalLink> et
                  connecte-toi avec ton compte Oura.
                </li>
                <li>
                  {frenchSpacing(
                    'Crée une application : nom CaliTrack, une courte description et ton e-mail. Pour les adresses du site, de confidentialité et des conditions, mets l’adresse de l’appli.',
                  )}
                </li>
                <li>{frenchSpacing('Dans « Redirect URIs », colle l’adresse de retour.')}</li>
                <li>
                  Coche les accès Daily, Heart rate et Personal, enregistre, puis colle le Client ID
                  ci-dessous.
                </li>
              </Steps>
              <CopyLine
                label="Adresse de l’appli"
                value={addresses.app}
                copyLabel="Copier l’adresse de l’appli"
                done="Adresse de l’appli copiée"
              />
              <CopyLine
                label="Adresse de retour"
                value={addresses.redirect}
                copyLabel="Copier l’adresse de retour"
                done="Adresse de retour copiée"
              />
              <ClientForm saved={settings.ouraClientId} />
            </div>
          </Section>

          <Section title="Confidentialité">
            <p className="rounded-2xl bg-surface p-4 text-[14px] text-ink-2">
              {frenchSpacing(
                'L’accès à Oura reste sur cet iPhone, hors des sauvegardes. Il passe seulement par ton relais, qui le transmet à Oura sans rien garder. Il dure 30 jours : CaliTrack te prévient quand il faut reconnecter ta bague. Tes données Oura enregistrées font partie de tes sauvegardes.',
              )}
            </p>
          </Section>
        </>
      )}
    </Page>
  )
}
