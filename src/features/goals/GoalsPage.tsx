import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Plus, Target } from 'lucide-react'
import { useProfile } from '@/app/data-context'
import { skillFor, type Skill } from '@/content/skills'
import { addSkillGoals } from '@/db/goals'
import { userMessage } from '@/lib/errors'
import { frenchSpacing } from '@/lib/typography'
import { Button, ButtonLink, IconButton } from '@/ui/Button'
import { EmptyState } from '@/ui/Controls'
import { ListGroup, ListRow } from '@/ui/List'
import { Page, Section } from '@/ui/Page'
import { PageSpinner } from '@/ui/PageSpinner'
import { useToast } from '@/ui/toast-context'
import { useCatalog } from '@/features/library/catalog-context'
import { GoalIcon, GoalRow } from './GoalRow'
import { goalPath, progressLine, sortGoals, type LineOptions } from './goal-view'
import { useGoalEntries, useLineOptions, type GoalEntry } from './useGoals'

function GoalList({ entries, options }: { entries: GoalEntry[]; options: LineOptions }) {
  return (
    <ListGroup>
      {entries.map(({ goal, progress }) => (
        <GoalRow key={goal.id} goal={goal} progress={progress} line={progressLine(progress, options)} />
      ))}
    </ListGroup>
  )
}

/** Les objectifs : en cours (avec leur barre), les figures visées à suivre, ceux atteints et archivés. */
export function GoalsPage() {
  const entries = useGoalEntries()
  const options = useLineOptions()
  const profile = useProfile()
  const catalog = useCatalog()
  const navigate = useNavigate()
  const toast = useToast()
  const [showArchived, setShowArchived] = useState(false)
  const [busy, setBusy] = useState(false)
  if (!entries) return <PageSpinner />

  const { active, achieved, archived } = sortGoals(entries)
  const followed = new Set(
    entries.filter((e) => e.goal.kind === 'skill' && !e.goal.archived).map((e) => e.goal.skillId),
  )
  const suggestions = profile.targetSkills.flatMap((id) => {
    const skill = skillFor(id)
    return skill && !followed.has(id) ? [skill] : []
  })

  const follow = async (skill: Skill) => {
    setBusy(true)
    try {
      const [goal] = await addSkillGoals([skill.id], (id) => catalog.byId.get(id)?.name ?? id)
      toast('Objectif ajouté', 'success')
      if (goal) void navigate(goalPath(goal.id))
    } catch (e) {
      toast(userMessage(e, 'Création impossible, réessaie.'), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Page
      title="Objectifs"
      actions={
        <IconButton
          label="Nouvel objectif"
          onClick={() => {
            void navigate('/goals/new')
          }}
        >
          <Plus size={24} aria-hidden />
        </IconButton>
      }
    >
      {entries.length === 0 && (
        <Section>
          <EmptyState
            icon={<Target size={36} aria-hidden />}
            title="Fixe-toi un cap"
            text="Une figure comme le muscle-up, un nombre de tractions, un poids, un niveau d’escalade… Ta barre de progression avance toute seule à chaque séance."
            action={<ButtonLink to="/goals/new">Créer un objectif</ButtonLink>}
          />
        </Section>
      )}

      {active.length > 0 && (
        <Section title="En cours">
          <GoalList entries={active} options={options} />
        </Section>
      )}

      {suggestions.length > 0 && (
        <Section title="Tes figures visées">
          <ListGroup>
            {suggestions.map((skill) => (
              <ListRow
                key={skill.id}
                leading={<GoalIcon kind="skill" />}
                title={skill.name}
                subtitle={`Suivre ses ${String(skill.steps.length)} étapes`}
                trailing={<Plus size={20} className="text-accent-text" aria-hidden />}
                chevron={false}
                onClick={() => {
                  if (!busy) void follow(skill)
                }}
              />
            ))}
          </ListGroup>
          <p className="mt-2 px-1 text-[13px] text-ink-3">
            {frenchSpacing('Choisies dans ton profil : touche une figure pour en faire un objectif.')}
          </p>
        </Section>
      )}

      {achieved.length > 0 && (
        <Section title="Atteints">
          <GoalList entries={achieved} options={options} />
        </Section>
      )}

      {archived.length > 0 && (
        <Section>
          <Button
            variant="ghost"
            block
            aria-expanded={showArchived}
            onClick={() => {
              setShowArchived(!showArchived)
            }}
          >
            {showArchived
              ? 'Masquer les objectifs archivés'
              : `Voir les objectifs archivés (${String(archived.length)})`}
          </Button>
          {showArchived && (
            <div className="mt-2">
              <GoalList entries={archived} options={options} />
            </div>
          )}
        </Section>
      )}
    </Page>
  )
}
