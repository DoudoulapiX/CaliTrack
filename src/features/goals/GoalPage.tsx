import { useState } from 'react'
import { useParams } from 'react-router'
import {
  Archive,
  ArchiveRestore,
  CircleCheck,
  CircleDashed,
  Pencil,
  Plus,
  Target,
  Trash2,
} from 'lucide-react'
import { useSettings } from '@/app/data-context'
import { useGoBack } from '@/app/useGoBack'
import { formatGoalValue } from '@/content/goals/create'
import { withAchieved, withManualProgress } from '@/content/goals/edit'
import {
  goalProgress,
  performancesOf,
  type BodyweightProgress,
  type ClimbingProgress,
  type ExerciseProgress,
  type GoalContext,
} from '@/content/goals/progress'
import { skillFor } from '@/content/skills'
import { deleteBodyMetric, deleteGoal, saveGoal } from '@/db/goals'
import type { Goal } from '@/db/types'
import { cn } from '@/lib/cn'
import { nowISO, today } from '@/lib/dates'
import { userMessage } from '@/lib/errors'
import { frenchSpacing } from '@/lib/typography'
import { formatBodyWeight } from '@/lib/units'
import { Button, ButtonLink, IconButton } from '@/ui/Button'
import { Card } from '@/ui/Card'
import { Badge, EmptyState, Stepper, Toggle } from '@/ui/Controls'
import { ListGroup, ListRow } from '@/ui/List'
import { Page, Section } from '@/ui/Page'
import { PageSpinner } from '@/ui/PageSpinner'
import { ConfirmSheet } from '@/ui/Sheet'
import { useToast } from '@/ui/toast-context'
import { ExerciseThumb } from '@/features/library/ExerciseThumb'
import { useCatalog } from '@/features/library/catalog-context'
import { GoalEditSheet } from './GoalEditSheet'
import { GoalBar, GoalIcon } from './GoalRow'
import { SkillSteps } from './SkillSteps'
import { WeightSheet } from './WeightSheet'
import {
  dayLabel,
  deadlineLine,
  GOAL_KIND_LABEL,
  percentLabel,
  progressLine,
  remainingLine,
} from './goal-view'
import { useBodyMetrics, useGoal, useGoalContext, useLineOptions } from './useGoals'

const RECENT = 5

/** Chiffres clés d'un objectif, en trois tuiles. */
function Figures({ items }: { items: { label: string; value: string }[] }) {
  return (
    <dl className="grid grid-cols-3 gap-2">
      {items.map((item) => (
        <div key={item.label} className="rounded-2xl bg-surface px-3 py-2.5">
          <dt className="text-[13px] text-ink-3">{item.label}</dt>
          <dd className="text-[17px] leading-tight font-bold break-words text-ink tabular">{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}

function ExerciseSection({
  goal,
  progress,
  ctx,
}: {
  goal: Goal
  progress: ExerciseProgress
  ctx: GoalContext
}) {
  const { weightUnit: unit } = useSettings()
  const catalog = useCatalog()
  const { metric, target } = progress
  if (metric === null || target === null || goal.exerciseId === null) return null
  const exercise = catalog.byId.get(goal.exerciseId)
  const value = (n: number) => formatGoalValue(n, metric, unit)
  const day = today()
  const recent = [...performancesOf(ctx.performances, goal.exerciseId, metric)].reverse().slice(0, RECENT)

  return (
    <>
      <Section>
        <Figures
          items={[
            { label: 'Départ', value: value(progress.start) },
            { label: 'Record', value: progress.best ? value(progress.best.value) : '—' },
            { label: 'Objectif', value: value(target) },
          ]}
        />
      </Section>
      <Section title="Dernières fois">
        {recent.length === 0 ? (
          <p className="rounded-2xl bg-surface px-4 py-4 text-[14px] text-ink-3">
            Pas encore fait en séance&nbsp;: ta barre avancera dès que tu le noteras.
          </p>
        ) : (
          <ListGroup>
            {recent.map((performance, i) => (
              <ListRow
                key={`${String(i)}-${performance.date}`}
                title={value(performance.value)}
                subtitle={
                  performance.workoutId === null
                    ? `${dayLabel(performance.date, day)} · test de niveau`
                    : dayLabel(performance.date, day)
                }
                to={performance.workoutId === null ? undefined : `/training/history/${performance.workoutId}`}
              />
            ))}
          </ListGroup>
        )}
      </Section>
      {exercise && (
        <Section>
          <ListGroup>
            <ListRow
              leading={<ExerciseThumb exercise={exercise} className="size-11" />}
              title={exercise.name}
              subtitle="Voir la fiche de l’exercice"
              to={`/library/${exercise.id}`}
            />
          </ListGroup>
        </Section>
      )}
    </>
  )
}

function BodyweightSection({ progress }: { progress: BodyweightProgress }) {
  const { weightUnit: unit } = useSettings()
  const metrics = useBodyMetrics()
  const toast = useToast()
  const [logging, setLogging] = useState(false)
  const [removing, setRemoving] = useState<{ id: string; date: string; kg: number } | null>(null)
  const [showAll, setShowAll] = useState(false)
  const day = today()
  const weighIns = (metrics ?? [])
    .flatMap((m) => (m.weightKg === null ? [] : [{ id: m.id, date: m.date, kg: m.weightKg }]))
    .reverse()
  const shown = showAll ? weighIns : weighIns.slice(0, RECENT)
  const kg = (value: number | null) => (value === null ? '—' : formatBodyWeight(value, unit))

  return (
    <>
      <Section>
        <Figures
          items={[
            { label: 'Départ', value: kg(progress.start) },
            { label: 'Actuel', value: kg(progress.current?.kg ?? null) },
            { label: 'Objectif', value: kg(progress.target) },
          ]}
        />
        <Button
          className="mt-3"
          block
          icon={<Plus size={18} aria-hidden />}
          onClick={() => {
            setLogging(true)
          }}
        >
          Noter mon poids
        </Button>
      </Section>
      <Section title="Dernières pesées">
        {weighIns.length === 0 ? (
          <p className="rounded-2xl bg-surface px-4 py-4 text-[14px] text-ink-3">
            Aucune pesée notée&nbsp;: ta barre part du poids de ton profil.
          </p>
        ) : (
          <ListGroup>
            {shown.map((entry) => (
              <ListRow
                key={entry.id}
                title={formatBodyWeight(entry.kg, unit)}
                subtitle={dayLabel(entry.date, day)}
                trailing={
                  <IconButton
                    label={`Supprimer la pesée : ${dayLabel(entry.date, day)}`}
                    onClick={() => {
                      setRemoving(entry)
                    }}
                  >
                    <Trash2 size={18} aria-hidden />
                  </IconButton>
                }
              />
            ))}
          </ListGroup>
        )}
        {weighIns.length > RECENT && (
          <Button
            className="mt-2"
            variant="ghost"
            block
            aria-expanded={showAll}
            onClick={() => {
              setShowAll(!showAll)
            }}
          >
            {showAll ? 'Afficher moins' : `Voir toutes les pesées (${String(weighIns.length)})`}
          </Button>
        )}
      </Section>
      {logging && (
        <WeightSheet
          lastKg={progress.current?.kg ?? null}
          onClose={() => {
            setLogging(false)
          }}
        />
      )}
      <ConfirmSheet
        open={removing !== null}
        onClose={() => {
          setRemoving(null)
        }}
        title={frenchSpacing('Supprimer cette pesée ?')}
        message={
          removing
            ? `${formatBodyWeight(removing.kg, unit)}, ${dayLabel(removing.date, day).toLowerCase()}.`
            : ''
        }
        confirmLabel="Supprimer"
        onConfirm={() => {
          if (!removing) return
          deleteBodyMetric(removing.id).then(
            () => {
              toast('Pesée supprimée')
            },
            (e: unknown) => {
              toast(userMessage(e, 'Suppression impossible, réessaie.'), 'error')
            },
          )
        }}
      />
    </>
  )
}

function ClimbingSection({ progress }: { progress: ClimbingProgress }) {
  const { grade, scale, target } = progress
  if (!grade || !scale || target === null) {
    return (
      <Section>
        <p className="rounded-2xl bg-surface px-4 py-4 text-[14px] text-ink-3">
          Ce niveau n’existe plus dans ton échelle de cotation&nbsp;: modifie l’objectif pour en choisir un
          autre.
        </p>
      </Section>
    )
  }
  return (
    <Section>
      <Card className="flex items-center gap-3">
        <span
          aria-hidden
          className="size-11 shrink-0 rounded-full ring-1 ring-black/10"
          style={{ backgroundColor: grade.color }}
        />
        <div className="min-w-0 flex-1">
          <p className="text-[16px] font-semibold text-ink">{grade.label} ou plus dur</p>
          <p className="text-[13px] text-ink-3">
            {grade.font !== grade.label ? `${scale.name} · ${grade.font} en Fontainebleau` : scale.name}
          </p>
        </div>
        <p className="text-[17px] font-bold text-ink tabular">
          {progress.count}&thinsp;/&thinsp;{target}
        </p>
      </Card>
      <p className="mt-2 px-1 text-[13px] text-ink-3">
        Chaque bloc réussi à ce niveau ou plus dur compte, au premier essai ou après plusieurs.
      </p>
      <ButtonLink to="/climbing" variant="secondary" block className="mt-3">
        Mes séances d’escalade
      </ButtonLink>
    </Section>
  )
}

function CustomSection({ goal }: { goal: Goal }) {
  const toast = useToast()
  // Valeur choisie pas encore relue de la base : deux touches rapides s'additionnent.
  const [pending, setPending] = useState<number | null>(null)
  if (pending !== null && goal.manualProgress === pending) setPending(null)

  const set = async (percent: number) => {
    setPending(percent)
    try {
      const next = withManualProgress(goal, percent, nowISO())
      await saveGoal(next)
      if (next.achievedAt !== null && goal.achievedAt === null) {
        toast(frenchSpacing('Objectif atteint, bravo !'), 'success')
      }
    } catch (e) {
      setPending(null)
      toast(userMessage(e, 'Enregistrement impossible, réessaie.'), 'error')
    }
  }
  return (
    <Section title="Avancement">
      <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-2.5">
        <span className="text-[16px] text-ink">Où tu en es</span>
        <Stepper
          label="Avancement"
          value={pending ?? goal.manualProgress}
          min={0}
          max={100}
          step={5}
          format={(value) => `${String(value)}\u00a0%`}
          onChange={(value) => void set(value)}
        />
      </div>
      <p className="mt-2 px-1 text-[13px] text-ink-3">À 100&nbsp;%, l’objectif est atteint.</p>
    </Section>
  )
}

function GoalContent({ goal, ctx }: { goal: Goal; ctx: GoalContext }) {
  const { weightUnit: unit } = useSettings()
  const options = useLineOptions()
  const toast = useToast()
  const goBack = useGoBack('/goals')
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const day = today()
  const progress = goalProgress(goal, ctx)
  const remaining = remainingLine(progress, unit)
  const deadline = goal.deadline && !progress.achieved ? deadlineLine(goal.deadline, day) : null
  const skill = goal.skillId ? skillFor(goal.skillId) : undefined
  // « Atteint » à la main : seulement quand les données ne le disent pas déjà.
  const markable =
    (goal.kind === 'exercise' || goal.kind === 'climbing') &&
    !goalProgress({ ...goal, achievedAt: null }, ctx).achieved

  const save = async (next: Goal, message: string) => {
    try {
      await saveGoal(next)
      toast(message)
    } catch (e) {
      toast(userMessage(e, 'Enregistrement impossible, réessaie.'), 'error')
    }
  }

  return (
    <Page
      title={goal.title}
      eyebrow={GOAL_KIND_LABEL[goal.kind]}
      back
      onBack={goBack}
      backLabel="Objectifs"
      large
      actions={
        <IconButton
          label="Modifier l’objectif"
          onClick={() => {
            setEditing(true)
          }}
        >
          <Pencil size={21} aria-hidden />
        </IconButton>
      }
    >
      <Card className="mb-6">
        <div className="flex items-center gap-3">
          <GoalIcon kind={goal.kind} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] text-ink-3">{progress.achieved ? 'Objectif atteint' : 'Avancement'}</p>
            <p className="text-[28px] leading-tight font-bold text-ink tabular">{percentLabel(progress)}</p>
          </div>
          {goal.archived ? <Badge>Archivé</Badge> : goal.pinned && <Badge tone="accent">Sur l’accueil</Badge>}
        </div>
        <div className="mt-3">
          <GoalBar progress={progress} label={`Avancement de « ${goal.title} »`} size="md" />
        </div>
        <p className="mt-3 text-[15px] text-ink">{progressLine(progress, options)}</p>
        {remaining && <p className="mt-0.5 text-[14px] text-ink-2">{remaining}</p>}
        {deadline && (
          <p className={cn('mt-0.5 text-[14px]', deadline.late ? 'font-medium text-warning' : 'text-ink-3')}>
            {deadline.text}
          </p>
        )}
        {skill && <p className="mt-3 text-[14px] text-ink-2">{skill.description}</p>}
      </Card>

      {progress.kind === 'skill' && (
        <Section title="Étapes">
          <SkillSteps goal={goal} progress={progress} />
          <p className="mt-2 px-1 text-[13px] text-ink-3">
            Une étape se valide toute seule quand tu atteins sa cible en séance. Touche-la pour voir
            l’exercice.
          </p>
        </Section>
      )}
      {progress.kind === 'exercise' && <ExerciseSection goal={goal} progress={progress} ctx={ctx} />}
      {progress.kind === 'bodyweight' && <BodyweightSection progress={progress} />}
      {progress.kind === 'climbing' && <ClimbingSection progress={progress} />}
      {progress.kind === 'custom' && <CustomSection goal={goal} />}

      {/* Un objectif archivé ne s'affiche pas sur l'accueil : le réglage revient quand on le ressort. */}
      {!goal.archived && (
        <Section>
          <div className="overflow-hidden rounded-2xl bg-surface">
            <Toggle
              label="Afficher sur l’accueil"
              description="Sa barre apparaît sur l’écran Aujourd’hui."
              checked={goal.pinned}
              onChange={(pinned) =>
                void save({ ...goal, pinned }, pinned ? 'Affiché sur l’accueil' : 'Retiré de l’accueil')
              }
            />
          </div>
        </Section>
      )}

      <Section>
        <ListGroup>
          {markable && (
            <ListRow
              title={goal.achievedAt === null ? 'Marquer comme atteint' : 'Annuler « atteint »'}
              subtitle={goal.achievedAt === null ? 'Réussi sans l’avoir noté dans l’appli' : undefined}
              leading={
                goal.achievedAt === null ? (
                  <CircleCheck size={20} aria-hidden />
                ) : (
                  <CircleDashed size={20} aria-hidden />
                )
              }
              chevron={false}
              onClick={() =>
                void save(
                  withAchieved(goal, goal.achievedAt === null, nowISO()),
                  goal.achievedAt === null
                    ? frenchSpacing('Objectif atteint, bravo !')
                    : 'Objectif remis en cours',
                )
              }
            />
          )}
          <ListRow
            title={goal.archived ? 'Remettre dans mes objectifs' : 'Archiver'}
            subtitle={goal.archived ? undefined : 'Il quitte ta liste sans être supprimé.'}
            leading={
              goal.archived ? <ArchiveRestore size={20} aria-hidden /> : <Archive size={20} aria-hidden />
            }
            chevron={false}
            onClick={() =>
              void save(
                { ...goal, archived: !goal.archived },
                goal.archived ? 'Objectif remis en cours' : 'Objectif archivé',
              )
            }
          />
          <ListRow
            title="Supprimer l’objectif"
            leading={<Trash2 size={20} aria-hidden />}
            danger
            chevron={false}
            onClick={() => {
              setDeleting(true)
            }}
          />
        </ListGroup>
      </Section>

      {editing && (
        <GoalEditSheet
          goal={goal}
          onClose={() => {
            setEditing(false)
          }}
        />
      )}
      <ConfirmSheet
        open={deleting}
        onClose={() => {
          setDeleting(false)
        }}
        title={frenchSpacing('Supprimer l’objectif ?')}
        message={frenchSpacing(
          'Tes séances, pesées et blocs restent enregistrés : seul l’objectif disparaît.',
        )}
        confirmLabel="Supprimer"
        onConfirm={() => {
          // On quitte l'écran avant : l'objectif va disparaître.
          goBack()
          deleteGoal(goal.id).then(
            () => {
              toast('Objectif supprimé')
            },
            (e: unknown) => {
              toast(userMessage(e, 'Suppression impossible, réessaie.'), 'error')
            },
          )
        }}
      />
    </Page>
  )
}

/** Un objectif : sa barre, ce qui reste à faire, ses étapes ou ses chiffres, et de quoi le régler. */
export function GoalPage() {
  const { id } = useParams()
  const goal = useGoal(id)
  const ctx = useGoalContext()
  if (goal === undefined || ctx === undefined) return <PageSpinner />
  if (goal === null) {
    return (
      <Page title="Objectif" back backTo="/goals" backLabel="Objectifs">
        <EmptyState
          icon={<Target size={36} aria-hidden />}
          title="Objectif introuvable"
          text="Il a peut-être été supprimé."
          action={<ButtonLink to="/goals">Voir mes objectifs</ButtonLink>}
        />
      </Page>
    )
  }
  return <GoalContent goal={goal} ctx={ctx} />
}
