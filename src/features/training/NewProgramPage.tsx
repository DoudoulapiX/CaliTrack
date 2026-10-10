import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { PencilRuler, SlidersHorizontal } from 'lucide-react'
import { useProfile, useSettings } from '@/app/data-context'
import { useGoBack } from '@/app/useGoBack'
import { emptyProgram } from '@/content/programs/edit'
import { defaultProgramLocation, generateProgram } from '@/content/programs/generator'
import { GOAL_FOCUS_LABEL, GOAL_FOCUS_ORDER } from '@/content/profile'
import { saveProgram } from '@/db/programs'
import type { Program } from '@/db/types'
import { newId } from '@/lib/ids'
import { nowISO, today } from '@/lib/dates'
import { userMessage } from '@/lib/errors'
import { frenchSpacing } from '@/lib/typography'
import { Button } from '@/ui/Button'
import { Card } from '@/ui/Card'
import { Toggle } from '@/ui/Controls'
import { SelectField } from '@/ui/Field'
import { ListGroup, ListRow } from '@/ui/List'
import { Page, Section } from '@/ui/Page'
import { PageSpinner } from '@/ui/PageSpinner'
import { useToast } from '@/ui/toast-context'
import { useCatalog } from '@/features/library/catalog-context'
import { PROFILE_FROM_NEW_PROGRAM } from '@/features/profile/links'
import { daysLabel, sessionSummary } from './program-view'
import { RationaleList } from './RationaleList'
import { useActiveProgram, useInventory, type Inventory } from './useTraining'

const EVERYWHERE = 'everywhere'

/** Aperçu d'une séance : ses blocs et leurs exercices, en une ligne chacun. */
function SessionPreview({ session }: { session: Program['sessions'][number] }) {
  const catalog = useCatalog()
  const name = (id: string) => catalog.byId.get(id)?.name ?? id
  return (
    <Card>
      <h3 className="text-[16px] font-semibold text-ink">{session.name}</h3>
      <p className="mt-0.5 text-[13px] text-ink-3">
        {daysLabel(session.weekdays)} · {sessionSummary(session, catalog.byId)}
      </p>
      <dl className="mt-3 flex flex-col gap-2">
        {session.blocks
          .filter((block) => block.kind !== 'warmup' && block.kind !== 'cooldown')
          .map((block) => (
            <div key={block.id}>
              <dt className="text-[12px] font-semibold tracking-wide text-ink-3 uppercase">{block.title}</dt>
              <dd className="text-[14px] leading-snug text-ink-2">
                {block.slots.map((slot) => name(slot.exerciseId)).join(' · ')}
              </dd>
            </div>
          ))}
      </dl>
    </Card>
  )
}

function NewProgramContent({ inventory, active }: { inventory: Inventory; active: Program | null }) {
  const profile = useProfile()
  const settings = useSettings()
  const catalog = useCatalog()
  const navigate = useNavigate()
  const toast = useToast()
  const goBack = useGoBack('/training')
  const [location, setLocation] = useState<string>(
    () => defaultProgramLocation(inventory.locations, settings.currentLocationId) ?? EVERYWHERE,
  )
  const [keepProgress, setKeepProgress] = useState(true)
  const [saving, setSaving] = useState(false)
  const locationId = location === EVERYWHERE ? null : location

  const program = useMemo(
    () =>
      generateProgram({
        profile,
        items: inventory.items,
        locations: inventory.locations,
        locationId,
        exercises: catalog.byId,
        previous: keepProgress ? active : null,
        startDate: today(),
        now: nowISO(),
      }),
    [profile, inventory, locationId, catalog, keepProgress, active],
  )

  const follow = async () => {
    setSaving(true)
    try {
      await saveProgram({ ...program, active: true })
      toast('Nouveau programme enregistré', 'success')
      void navigate('/training', { replace: true })
    } catch (e) {
      setSaving(false)
      toast(userMessage(e, 'Enregistrement impossible, réessaie.'), 'error')
    }
  }

  const buildMyself = async () => {
    setSaving(true)
    try {
      const custom = emptyProgram({
        name: 'Mon programme',
        focuses: profile.focuses,
        locationId,
        startDate: today(),
        now: nowISO(),
        newId,
      })
      await saveProgram(custom)
      void navigate(`/training/programs/${custom.id}`, { replace: true })
    } catch (e) {
      setSaving(false)
      toast(userMessage(e, 'Création impossible, réessaie.'), 'error')
    }
  }

  return (
    <Page
      title="Nouveau programme"
      back
      onBack={goBack}
      noTabBar
      className="pt-2"
      footer={
        <Button block size="lg" disabled={saving} onClick={() => void follow()}>
          Suivre ce programme
        </Button>
      }
    >
      <p className="mb-4 px-1 text-[14px] text-ink-3">
        Calculé d’après ton profil (jours, durée, objectifs, niveau) et ton matériel. Tu pourras tout modifier
        ensuite.
      </p>

      {inventory.locations.length > 0 && (
        <Section>
          <div className="rounded-2xl bg-surface p-4">
            <SelectField
              label="Matériel à utiliser"
              value={location}
              options={[
                { value: EVERYWHERE, label: 'Tout mon matériel' },
                ...inventory.locations.map((l) => ({ value: l.id, label: `${l.name} seulement` })),
              ]}
              onChange={setLocation}
            />
          </div>
        </Section>
      )}

      <Section>
        <ListGroup>
          <ListRow
            title="Jours, durée et objectifs"
            subtitle={[
              daysLabel(profile.trainingDays),
              `${String(profile.sessionMinutes)} min`,
              ...GOAL_FOCUS_ORDER.filter((f) => profile.focuses.includes(f)).map((f) => GOAL_FOCUS_LABEL[f]),
            ].join(' · ')}
            leading={<SlidersHorizontal size={20} aria-hidden />}
            to={PROFILE_FROM_NEW_PROGRAM}
          />
          {active && (
            <li>
              <Toggle
                checked={keepProgress}
                onChange={setKeepProgress}
                label="Garder ma progression"
                description={frenchSpacing(`Les exercices reprennent où tu en es dans « ${active.name} ».`)}
              />
            </li>
          )}
        </ListGroup>
      </Section>

      <Section title={frenchSpacing(`Aperçu : ${program.name}`)}>
        <div className="flex flex-col gap-3">
          {program.sessions.map((session) => (
            <SessionPreview key={session.id} session={session} />
          ))}
        </div>
      </Section>

      <Section title="Pourquoi ce programme">
        <RationaleList lines={program.rationale} />
      </Section>

      <Section>
        <Button
          variant="ghost"
          block
          disabled={saving}
          icon={<PencilRuler size={18} aria-hidden />}
          onClick={() => void buildMyself()}
        >
          Je préfère le construire moi-même
        </Button>
      </Section>
    </Page>
  )
}

/** Prépare un programme, montre l'aperçu et l'enregistre comme programme suivi. */
export function NewProgramPage() {
  const inventory = useInventory()
  const active = useActiveProgram()
  if (!inventory || active === undefined) return <PageSpinner />
  return <NewProgramContent inventory={inventory} active={active} />
}
