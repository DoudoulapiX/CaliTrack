import { useState, type ReactNode } from 'react'
import { ExternalLink, HardDriveDownload } from 'lucide-react'
import { useGoBack } from '@/app/useGoBack'
import { formatDay } from '@/lib/dates'
import { userMessage } from '@/lib/errors'
import { frenchSpacing } from '@/lib/typography'
import { Button } from '@/ui/Button'
import { ListGroup, ListRow } from '@/ui/List'
import { Page, Section } from '@/ui/Page'
import { useToast } from '@/ui/toast-context'

/** Ouverte depuis l'écran d'accueil de l'iPhone (en plein écran), et pas dans un onglet de Safari. */
function isInstalled(): boolean {
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true
  return (
    standalone ||
    (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches)
  )
}

type UpdateCheck = 'unavailable' | 'downloading' | 'upToDate'

/** Demande au service de l'appli s'il existe une version plus récente (elle s'installe alors toute seule). */
async function checkForUpdate(): Promise<UpdateCheck> {
  if (!('serviceWorker' in navigator)) return 'unavailable'
  const registration = await navigator.serviceWorker.getRegistration()
  if (!registration) return 'unavailable'
  await registration.update()
  return registration.installing || registration.waiting ? 'downloading' : 'upToDate'
}

const UPDATE_MESSAGE: Record<UpdateCheck, string> = {
  unavailable: 'Recherche indisponible ici : ouvre CaliTrack depuis l’écran d’accueil.',
  downloading: 'Nouvelle version en cours de chargement…',
  upToDate: 'CaliTrack est à jour',
}

function Credit({ title, text, href }: { title: string; text: string; href?: string }) {
  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] text-ink">{title}</span>
        <span className="mt-0.5 block text-[13px] text-ink-3">{frenchSpacing(text)}</span>
      </span>
      {href && <ExternalLink size={18} className="shrink-0 text-ink-3" aria-hidden />}
    </>
  )
  return (
    <li>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="flex min-h-13 items-center gap-3 px-4 py-2.5 active:bg-surface-2"
        >
          {body}
        </a>
      ) : (
        <div className="flex min-h-13 items-center gap-3 px-4 py-2.5">{body}</div>
      )}
    </li>
  )
}

function Paragraph({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl bg-surface p-4 text-[15px] leading-relaxed text-ink-2">{children}</div>
}

/** Version, données, installation sur l'iPhone et crédits. */
export function AboutPage() {
  const toast = useToast()
  const goBack = useGoBack('/more')
  const [checking, setChecking] = useState(false)
  const installed = isInstalled()

  const check = () => {
    setChecking(true)
    checkForUpdate()
      .then((result) => {
        toast(frenchSpacing(UPDATE_MESSAGE[result]), result === 'upToDate' ? 'success' : undefined)
      })
      .catch((error: unknown) => {
        toast(userMessage(error, frenchSpacing('Recherche impossible : vérifie ta connexion.')), 'error')
      })
      .finally(() => {
        setChecking(false)
      })
  }

  return (
    <Page title="À propos" back onBack={goBack} backLabel="Plus" large>
      <Section>
        <div className="flex items-center gap-4 rounded-2xl bg-surface p-4">
          <img
            src={`${import.meta.env.BASE_URL}icons/icon-192.png`}
            alt=""
            width={56}
            height={56}
            className="size-14 rounded-2xl"
          />
          <div className="min-w-0">
            <p className="text-[19px] font-bold text-ink">CaliTrack</p>
            <p className="text-[14px] text-ink-3">
              Version {__APP_VERSION__} du {formatDay(__BUILD_DATE__, 'd MMMM yyyy')}
            </p>
          </div>
        </div>
        <Button variant="secondary" block className="mt-3" disabled={checking} onClick={check}>
          Rechercher une mise à jour
        </Button>
      </Section>

      <Section title="Tes données">
        <Paragraph>
          {frenchSpacing(
            'Tout reste sur ton iPhone, dans l’appli : pas de compte, pas de serveur. Enregistre une sauvegarde dans Fichiers de temps en temps pour ne rien perdre.',
          )}
        </Paragraph>
        <ListGroup className="mt-3">
          <ListRow
            leading={<HardDriveDownload size={20} aria-hidden />}
            title="Sauvegarde"
            to="/more/backup"
          />
        </ListGroup>
      </Section>

      <Section title="Sur l’écran d’accueil">
        {installed ? (
          <Paragraph>
            CaliTrack est installée&nbsp;: elle s’ouvre en plein écran et marche sans connexion.
          </Paragraph>
        ) : (
          <Paragraph>
            <p>Pour l’ouvrir comme une appli, en plein écran et sans connexion&nbsp;:</p>
            <ol className="mt-2 list-decimal pl-5">
              <li>ouvre CaliTrack dans Safari&nbsp;;</li>
              <li>touche le bouton Partager&nbsp;;</li>
              <li>choisis «&nbsp;Sur l’écran d’accueil&nbsp;».</li>
            </ol>
          </Paragraph>
        )}
      </Section>

      <Section title="Crédits">
        <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-surface">
          <Credit
            title="Exercices et images"
            text="free-exercise-db, domaine public, traduite en français pour CaliTrack."
            href="https://github.com/yuhonas/free-exercise-db"
          />
          <Credit
            title="Progressions de calisthénie"
            text="Écrites pour CaliTrack : levers, planche, drapeau, muscle-up…"
          />
          <Credit
            title="Couleurs Vertical’Art"
            text="Équivalences Fontainebleau d’après la table publique de Kaskad Coaching, à titre indicatif."
          />
          <Credit title="Icônes" text="Lucide, licence ISC." href="https://lucide.dev" />
        </ul>
      </Section>
    </Page>
  )
}
