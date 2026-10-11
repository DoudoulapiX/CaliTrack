import { useState, type ReactNode } from 'react'
import {
  CalendarDays,
  Dumbbell,
  Mountain,
  Palette,
  Target,
  Trophy,
  Weight,
  type LucideIcon,
} from 'lucide-react'
import { useSettings } from '@/app/data-context'
import { ALL_TAB_KEYS, TAB_DEFS } from '@/app/tabs'
import { ACCENT_PRESETS } from '@/app/theme'
import { useGoBack } from '@/app/useGoBack'
import { MAX_TABS } from '@/db/defaults'
import { updateSettings, type SettingsPatch } from '@/db/settings'
import type { DashboardCardKey } from '@/db/types'
import { userMessage } from '@/lib/errors'
import { frenchSpacing } from '@/lib/typography'
import { ColorPicker } from '@/ui/ColorPicker'
import { Segmented, Toggle } from '@/ui/Controls'
import { TextField } from '@/ui/Field'
import { ListGroup, ListRow } from '@/ui/List'
import { OrderedToggleList } from '@/ui/OrderedToggleList'
import { Page, Section } from '@/ui/Page'
import { useToast } from '@/ui/toast-context'
import {
  ALL_DASHBOARD_CARDS,
  climbingModulePatch,
  DASHBOARD_CARD_LABEL,
  GYM_NAME_MAX,
  THEME_OPTIONS,
  WEIGHT_UNIT_OPTIONS,
} from './settings-view'

const CARD_ICON: Record<DashboardCardKey, LucideIcon> = {
  todaySession: Dumbbell,
  week: CalendarDays,
  goals: Target,
  climbing: Mountain,
  weight: Weight,
  records: Trophy,
}

/** Une carte de réglages : réglages posés sur un fond, avec un petit titre au-dessus de chacun. */
function Panel({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-4 rounded-2xl bg-surface p-4">{children}</div>
}

function Caption({ children }: { children: string }) {
  return <p className="px-1 text-[13px] font-medium text-ink-2">{children}</p>
}

function Note({ children }: { children: string }) {
  return <p className="mt-2 px-1 text-[13px] text-ink-3">{frenchSpacing(children)}</p>
}

/** Le nom de la salle des nouvelles séances, enregistré en quittant le champ. */
function GymField({ value, onSave }: { value: string; onSave: (gym: string) => void }) {
  const [draft, setDraft] = useState(value)
  return (
    <TextField
      label="Salle des nouvelles séances"
      value={draft}
      maxLength={GYM_NAME_MAX}
      autoCapitalize="words"
      enterKeyHint="done"
      placeholder="Ex. Vertical’Art"
      onChange={setDraft}
      onBlur={() => {
        const gym = draft.trim()
        setDraft(gym)
        if (gym !== value) onSave(gym)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
      }}
    />
  )
}

/** Réglages de l'appli : apparence, onglets, accueil, séance, unités et escalade. */
export function SettingsPage() {
  const settings = useSettings()
  const toast = useToast()
  const goBack = useGoBack('/more')
  const climbing = !settings.hiddenModules.includes('climbing')

  const save = (patch: SettingsPatch, done?: string) => {
    updateSettings(patch).then(
      () => {
        if (done) toast(done)
      },
      (error: unknown) => {
        toast(userMessage(error, 'Enregistrement impossible, réessaie.'), 'error')
      },
    )
  }

  const tabItems = ALL_TAB_KEYS.filter((key) => climbing || key !== 'climbing').map((key) => {
    const Icon = TAB_DEFS[key].icon
    return { key, label: TAB_DEFS[key].label, icon: <Icon size={20} aria-hidden /> }
  })
  const cardItems = ALL_DASHBOARD_CARDS.filter((key) => climbing || key !== 'climbing').map((key) => {
    const Icon = CARD_ICON[key]
    return { key, label: DASHBOARD_CARD_LABEL[key], icon: <Icon size={20} aria-hidden /> }
  })

  return (
    <Page title="Réglages" back onBack={goBack} backLabel="Plus" large>
      <Section title="Apparence">
        <Panel>
          <div className="flex flex-col gap-2">
            <Caption>Thème</Caption>
            <Segmented
              label="Thème"
              value={settings.themeMode}
              options={THEME_OPTIONS}
              onChange={(themeMode) => {
                save({ themeMode })
              }}
            />
            <p className="px-1 text-[13px] text-ink-3">Auto suit le mode clair ou sombre de ton iPhone.</p>
          </div>
          <ColorPicker
            label="Couleur de l’appli"
            value={settings.accent}
            options={ACCENT_PRESETS}
            onChange={(accent) => {
              save({ accent })
            }}
          />
        </Panel>
      </Section>

      <Section title="Barre d’onglets">
        <OrderedToggleList
          label="Onglets de la barre"
          items={tabItems}
          selected={settings.tabs}
          max={MAX_TABS}
          min={1}
          onChange={(tabs) => {
            save({ tabs })
          }}
        />
        <Note>
          {`${String(MAX_TABS)} onglets au plus, puis « Plus » qui mène à tout le reste. Les flèches changent leur ordre.`}
        </Note>
      </Section>

      <Section title="Accueil">
        <OrderedToggleList
          label="Cartes de l’accueil"
          items={cardItems}
          selected={settings.dashboardCards}
          onChange={(dashboardCards) => {
            save({ dashboardCards })
          }}
        />
        <Note>Les cartes affichées sur l’écran Aujourd’hui, dans cet ordre.</Note>
      </Section>

      <Section title="Pendant la séance">
        <ListGroup>
          <li>
            <Toggle
              label="Son du minuteur"
              description="Bips et vibrations à la fin du repos."
              checked={settings.restTimerSound}
              onChange={(restTimerSound) => {
                save({ restTimerSound })
              }}
            />
          </li>
          <li>
            <Toggle
              label="Annonces vocales"
              description="La série suivante, dite à voix haute."
              checked={settings.voiceCues}
              onChange={(voiceCues) => {
                save({ voiceCues })
              }}
            />
          </li>
          <li>
            <Toggle
              label="Écran toujours allumé"
              description="L’iPhone ne se met pas en veille pendant une séance."
              checked={settings.keepScreenOn}
              onChange={(keepScreenOn) => {
                save({ keepScreenOn })
              }}
            />
          </li>
        </ListGroup>
      </Section>

      <Section title="Unités">
        <Panel>
          <div className="flex flex-col gap-2">
            <Caption>Poids et charges</Caption>
            <Segmented
              label="Poids et charges"
              value={settings.weightUnit}
              options={WEIGHT_UNIT_OPTIONS}
              onChange={(weightUnit) => {
                save({ weightUnit })
              }}
            />
          </div>
        </Panel>
      </Section>

      <Section title="Escalade">
        <ListGroup>
          <li>
            <Toggle
              label="Module escalade"
              description={
                climbing
                  ? 'Séances par couleur, statistiques, jours d’escalade.'
                  : frenchSpacing(
                      'Masqué : plus d’onglet, de carte ni de jours d’escalade. Tes séances restent gardées.',
                    )
              }
              checked={climbing}
              onChange={(shown) => {
                save(climbingModulePatch(settings, shown), shown ? 'Escalade affichée' : 'Escalade masquée')
              }}
            />
          </li>
          {climbing && (
            <ListRow
              leading={<Palette size={20} aria-hidden />}
              title="Couleurs et cotations"
              to="/climbing/grades"
            />
          )}
        </ListGroup>
        {climbing && (
          <div className="mt-3 rounded-2xl bg-surface p-4">
            <GymField
              value={settings.climbingGym}
              onSave={(climbingGym) => {
                save({ climbingGym }, 'Salle enregistrée')
              }}
            />
          </div>
        )}
      </Section>
    </Page>
  )
}
