import { Link } from 'react-router'
import { ChevronRight, Dumbbell, LibraryBig, Plus, RefreshCw } from 'lucide-react'
import { useProfile } from '@/app/data-context'
import { isDeloadWeek, programWeek } from '@/content/programs/schedule'
import type { Program } from '@/db/types'
import { today } from '@/lib/dates'
import { ButtonLink } from '@/ui/Button'
import { Badge, EmptyState } from '@/ui/Controls'
import { Card } from '@/ui/Card'
import { ListGroup, ListRow } from '@/ui/List'
import { Page, Section } from '@/ui/Page'
import { PageSpinner } from '@/ui/PageSpinner'
import { TodayWorkoutCard } from '@/features/workout/TodayWorkoutCard'
import { WorkoutLinks } from '@/features/workout/WorkoutLinks'
import { locationLabel, programOutdated } from './program-view'
import { RationaleList } from './RationaleList'
import { useActiveProgram, useInventory, usePrograms } from './useTraining'
import { WeekSection } from './WeekSection'

function ActiveProgram({ program }: { program: Program }) {
  const profile = useProfile()
  const inventory = useInventory()
  const day = today()
  const week = programWeek(program, day)
  const deload = isDeloadWeek(program, day)

  return (
    <>
      <TodayWorkoutCard program={program} />

      <Card className="mb-6">
        <Link to={`/training/programs/${program.id}`} className="-m-4 flex items-center gap-3 p-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-text">
            <Dumbbell size={22} aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[17px] font-semibold text-ink">{program.name}</span>
            <span className="mt-0.5 block text-[13px] text-ink-3">
              {week >= 1 ? `Semaine ${week}` : 'Commence bientôt'}
              {inventory ? ` · ${locationLabel(program, inventory.locations)}` : ''}
            </span>
          </span>
          {deload && <Badge tone="success">Semaine allégée</Badge>}
          <ChevronRight size={18} className="shrink-0 text-ink-3" aria-hidden />
        </Link>
      </Card>

      {programOutdated(program, profile) && (
        <Card className="mb-6">
          <p className="text-[14px] text-ink-2">
            Tes jours ou tes objectifs ne correspondent plus à ce programme.
          </p>
          <ButtonLink to="/training/new" variant="soft" size="sm" className="mt-3">
            Refaire mon programme
          </ButtonLink>
        </Card>
      )}

      {deload && (
        <p className="mb-6 rounded-2xl bg-success/10 px-4 py-3 text-[14px] text-ink-2">
          Semaine allégée&nbsp;: moitié moins de séries pour récupérer. Les objectifs ne changent pas.
        </p>
      )}

      <WeekSection program={program} />

      <Section title="Séances">
        <WorkoutLinks />
      </Section>

      {program.rationale.length > 0 && (
        <Section title="Pourquoi ce programme">
          <RationaleList lines={program.rationale} />
        </Section>
      )}

      <Section>
        <ListGroup>
          <ListRow
            title="Refaire mon programme"
            subtitle="D’après ton profil et ton matériel du moment"
            leading={<RefreshCw size={20} aria-hidden />}
            to="/training/new"
          />
          <ListRow
            title="Mes programmes"
            leading={<LibraryBig size={20} aria-hidden />}
            to="/training/programs"
          />
        </ListGroup>
      </Section>
    </>
  )
}

/** Onglet Entraînement : le programme suivi et sa semaine type. */
export function TrainingPage() {
  const active = useActiveProgram()
  const programs = usePrograms()
  if (active === undefined || programs === undefined) return <PageSpinner />

  return (
    <Page title="Entraînement">
      {active ? (
        <ActiveProgram program={active} />
      ) : (
        <>
          <TodayWorkoutCard program={null} />
          <EmptyState
            icon={<Dumbbell size={36} aria-hidden />}
            title="Pas encore de programme"
            text="CaliTrack le prépare d’après ton profil, ton niveau et ton matériel. Tu pourras tout modifier."
            action={
              <ButtonLink to="/training/new" icon={<Plus size={18} aria-hidden />}>
                Créer mon programme
              </ButtonLink>
            }
          />
          {programs.length > 0 && (
            <Section title="Mes programmes" className="mt-6">
              <ListGroup>
                {programs.map((program) => (
                  <ListRow key={program.id} title={program.name} to={`/training/programs/${program.id}`} />
                ))}
              </ListGroup>
            </Section>
          )}
          <Section title="Séances" className="mt-6">
            <WorkoutLinks />
          </Section>
        </>
      )}
    </Page>
  )
}
