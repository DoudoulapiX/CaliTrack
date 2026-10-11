import { Target } from 'lucide-react'
import { frenchSpacing } from '@/lib/typography'
import { ButtonLink } from '@/ui/Button'
import { Card } from '@/ui/Card'
import { ListGroup } from '@/ui/List'
import { Section } from '@/ui/Page'
import { GoalRow } from '@/features/goals/GoalRow'
import { progressLine, sortGoals } from '@/features/goals/goal-view'
import { useGoalEntries, useLineOptions } from '@/features/goals/useGoals'
import { SectionLink } from './SectionLink'

/** Les objectifs affichés sur l'accueil, avec leur barre : ceux en cours d'abord, puis ceux atteints. */
export function GoalsCard() {
  const entries = useGoalEntries()
  const options = useLineOptions()
  if (!entries) return null
  const { active, achieved } = sortGoals(entries)
  const pinned = [...active, ...achieved].filter((entry) => entry.goal.pinned)

  return (
    <Section
      title="Objectifs"
      action={
        <SectionLink to="/goals" label="Tous les objectifs">
          Tous
        </SectionLink>
      }
    >
      {pinned.length > 0 ? (
        <ListGroup>
          {pinned.map(({ goal, progress }) => (
            <GoalRow
              key={goal.id}
              goal={goal}
              progress={progress}
              line={progressLine(progress, options)}
              pinMark={false}
            />
          ))}
        </ListGroup>
      ) : (
        <Card className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-text">
            <Target size={20} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] text-ink-2">
              {entries.length === 0
                ? 'Une figure, un nombre de tractions, un poids… Sa barre de progression s’affichera ici.'
                : frenchSpacing(
                    'Dans un objectif, active « Afficher sur l’accueil » pour suivre sa barre ici.',
                  )}
            </p>
            <ButtonLink
              to={entries.length === 0 ? '/goals/new' : '/goals'}
              variant="soft"
              size="sm"
              className="mt-3"
            >
              {entries.length === 0 ? 'Créer un objectif' : 'Mes objectifs'}
            </ButtonLink>
          </div>
        </Card>
      )}
    </Section>
  )
}
