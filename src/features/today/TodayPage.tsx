import { Fragment, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { LayoutGrid, SlidersHorizontal } from 'lucide-react'
import { useSettings } from '@/app/data-context'
import { db } from '@/db/db'
import type { DashboardCardKey } from '@/db/types'
import { capitalize, formatDay, today as todayISO, weekDates } from '@/lib/dates'
import { frenchSpacing } from '@/lib/typography'
import { ButtonLink } from '@/ui/Button'
import { EmptyState } from '@/ui/Controls'
import { Page } from '@/ui/Page'
import { PageSpinner } from '@/ui/PageSpinner'
import { backupReminder } from '@/features/backup/describe'
import { useAgenda } from '@/features/calendar/useAgenda'
import { shownCards } from '@/features/settings/settings-view'
import { useActiveProgram } from '@/features/training/useTraining'
import { BackupReminderCard } from './BackupReminderCard'
import { ClimbingCard } from './ClimbingCard'
import { GoalsCard } from './GoalsCard'
import { NutritionCard } from './NutritionCard'
import { RecordsCard } from './RecordsCard'
import { RecoveryCard } from './RecoveryCard'
import { TodaySessionCard } from './TodaySessionCard'
import { climbingPlanned } from './today-view'
import { WeekCard } from './WeekCard'
import { WeightCard } from './WeightCard'

/** Y a-t-il des données qui méritent une sauvegarde (séances, escalade, objectifs, pesées, agenda, repas) ? */
async function hasUserData(): Promise<boolean> {
  const counts = await Promise.all([
    db.workouts.count(),
    db.climbingSessions.count(),
    db.goals.count(),
    db.bodyMetrics.count(),
    db.events.count(),
    db.foodEntries.count(),
  ])
  return counts.some((count) => count > 0)
}

/** Onglet Aujourd'hui : les cartes choisies dans les réglages, dans leur ordre. */
export function TodayPage() {
  const settings = useSettings()
  const program = useActiveProgram()
  const day = todayISO()
  const dates = weekDates(day)
  const agenda = useAgenda(program, dates[0] ?? day, dates[6] ?? day)
  const hasData = useLiveQuery(hasUserData, [])
  if (program === undefined || agenda === undefined || hasData === undefined) return <PageSpinner />

  const items = agenda.get(day) ?? []
  const reminder = backupReminder(settings, day, hasData)
  const cards = shownCards(settings)
  const card: Record<DashboardCardKey, () => ReactNode> = {
    todaySession: () => <TodaySessionCard program={program} items={items} day={day} />,
    recovery: () => <RecoveryCard day={day} />,
    nutrition: () => <NutritionCard day={day} />,
    week: () => <WeekCard agenda={agenda} dates={dates} day={day} />,
    goals: () => <GoalsCard />,
    climbing: () => <ClimbingCard planned={climbingPlanned(items)} day={day} />,
    weight: () => <WeightCard day={day} />,
    records: () => <RecordsCard day={day} />,
  }

  return (
    <Page title="Aujourd’hui" eyebrow={capitalize(formatDay(day))}>
      {reminder && <BackupReminderCard reminder={reminder} />}
      {cards.length === 0 ? (
        <EmptyState
          icon={<LayoutGrid size={36} aria-hidden />}
          title="Aucune carte sur l’accueil"
          text={frenchSpacing('Choisis ce que tu veux voir ici : séance du jour, semaine, objectifs, poids…')}
          action={<ButtonLink to="/more/settings">Choisir mes cartes</ButtonLink>}
        />
      ) : (
        cards.map((key) => <Fragment key={key}>{card[key]()}</Fragment>)
      )}
      {cards.length > 0 && (
        <ButtonLink
          to="/more/settings"
          variant="ghost"
          block
          icon={<SlidersHorizontal size={18} aria-hidden />}
        >
          Personnaliser l’accueil
        </ButtonLink>
      )}
    </Page>
  )
}
