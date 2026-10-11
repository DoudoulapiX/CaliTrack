import { useState } from 'react'
import { Check } from 'lucide-react'
import { useSettings } from '@/app/data-context'
import { formatGoalValue } from '@/content/goals/create'
import { withMilestoneAchieved } from '@/content/goals/edit'
import type { GoalMetric, SkillProgress, StepProgress, StepStatus } from '@/content/goals/progress'
import { saveGoal } from '@/db/goals'
import type { Goal } from '@/db/types'
import { cn } from '@/lib/cn'
import { nowISO, today as todayISO } from '@/lib/dates'
import { userMessage } from '@/lib/errors'
import { frenchSpacing } from '@/lib/typography'
import { Button, ButtonLink } from '@/ui/Button'
import { ProgressBar } from '@/ui/Controls'
import { Sheet } from '@/ui/Sheet'
import { useToast } from '@/ui/toast-context'
import { ExerciseMedia } from '@/features/library/ExerciseMedia'
import { useCatalog } from '@/features/library/catalog-context'
import { floorPercent, shortDate, stepName, stepReachedLine, stepTarget } from './goal-view'

const STATUS_LABEL: Record<StepStatus, string> = {
  done: 'franchie',
  current: 'en cours',
  todo: 'à venir',
}

/** « Objectif : 8 rép. d’affilée », « Objectif : tenir 15 s ». */
function objectiveSentence(kind: GoalMetric, value: string): string {
  if (kind === 'reps') return `Objectif : ${value} d’affilée`
  if (kind === 'time') return `Objectif : tenir ${value}`
  return `Objectif : ${value}`
}

function StepNode({ status, number }: { status: StepStatus; number: number }) {
  return (
    <span
      aria-hidden
      className={cn(
        'relative z-10 flex size-9 shrink-0 items-center justify-center rounded-full text-[15px] font-semibold tabular',
        status === 'done' && 'bg-accent text-accent-ink',
        status === 'current' && 'bg-surface text-accent-text ring-2 ring-accent ring-inset',
        status === 'todo' && 'bg-surface text-ink-3 ring-1 ring-line ring-inset',
      )}
    >
      {status === 'done' ? <Check size={18} strokeWidth={2.8} /> : number}
    </span>
  )
}

/**
 * Les étapes d'une figure, de la plus accessible à la figure finale : franchies, en cours (avec la
 * part déjà faite), puis à venir. Chaque étape s'ouvre pour voir l'exercice ou la cocher.
 */
export function SkillSteps({ goal, progress }: { goal: Goal; progress: SkillProgress }) {
  const catalog = useCatalog()
  const { weightUnit: unit } = useSettings()
  const [openId, setOpenId] = useState<string | null>(null)
  const day = todayISO()
  const nameOf = (id: string) => catalog.byId.get(id)?.name
  const opened = progress.steps.findIndex((step) => step.milestone.id === openId)
  const openStep = progress.steps[opened]

  return (
    <>
      <ol className="rounded-2xl bg-surface p-2">
        {progress.steps.map((step, i) => {
          const name = stepName(step.milestone, nameOf)
          const target = stepTarget(step.milestone, unit)
          const criterion = step.milestone.criterion
          const detail =
            step.status === 'done'
              ? stepReachedLine(step, day)
              : step.status === 'current' && criterion
                ? step.best
                  ? frenchSpacing(`Ton record : ${formatGoalValue(step.best.value, criterion.kind, unit)}`)
                  : 'Pas encore faite'
                : null
          const line = [target, detail].filter(Boolean).join(' · ')
          return (
            <li key={step.milestone.id} className="relative">
              {i < progress.steps.length - 1 && (
                <span
                  aria-hidden
                  className={cn(
                    'absolute top-11 -bottom-2 left-[25px] w-0.5',
                    step.status === 'done' ? 'bg-accent' : 'bg-line',
                  )}
                />
              )}
              <button
                type="button"
                aria-label={`Étape ${String(i + 1)} : ${name}${target ? `, ${target}` : ''}, ${STATUS_LABEL[step.status]}`}
                onClick={() => {
                  setOpenId(step.milestone.id)
                }}
                className="flex w-full items-start gap-3 rounded-xl px-2 py-2 text-left active:bg-surface-2"
              >
                <StepNode status={step.status} number={i + 1} />
                <span className="min-w-0 flex-1 pt-1">
                  <span
                    className={cn(
                      'block text-[16px] leading-snug',
                      step.status === 'todo' ? 'text-ink-2' : 'text-ink',
                      step.status === 'current' && 'font-semibold',
                    )}
                  >
                    {name}
                  </span>
                  {line && <span className="mt-0.5 block text-[13px] text-ink-3">{line}</span>}
                  {step.status === 'current' && criterion && (
                    <ProgressBar
                      value={floorPercent(step.ratio)}
                      label={`Étape en cours : ${name}`}
                      size="sm"
                      className="mt-2 mb-1"
                    />
                  )}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
      {openStep && (
        <StepSheet
          key={openStep.milestone.id}
          goal={goal}
          step={openStep}
          index={opened}
          total={progress.steps.length}
          onClose={() => {
            setOpenId(null)
          }}
        />
      )}
    </>
  )
}

function StepSheet({
  goal,
  step,
  index,
  total,
  onClose,
}: {
  goal: Goal
  step: StepProgress
  index: number
  total: number
  onClose: () => void
}) {
  const catalog = useCatalog()
  const toast = useToast()
  const { weightUnit: unit } = useSettings()
  const [busy, setBusy] = useState(false)
  const day = todayISO()
  const criterion = step.milestone.criterion
  const exercise = criterion ? catalog.byId.get(criterion.exerciseId) : undefined
  const name = stepName(step.milestone, (id) => catalog.byId.get(id)?.name)
  const reached = stepReachedLine(step, day)
  // Une étape réussie en séance ou au test ne se décoche pas : seule une coche à la main s'enlève.
  const canCheck = step.status !== 'done'
  const canUncheck = step.reachedBy === 'manual'

  const setAchieved = async (achieved: boolean) => {
    setBusy(true)
    try {
      await saveGoal(withMilestoneAchieved(goal, step.milestone.id, achieved, nowISO()))
      toast(achieved ? 'Étape cochée' : 'Étape décochée')
      onClose()
    } catch (error) {
      setBusy(false)
      toast(userMessage(error, 'Enregistrement impossible, réessaie.'), 'error')
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={`Étape ${String(index + 1)} sur ${String(total)}`}
      footer={
        <div className="flex flex-col gap-2">
          {canCheck && (
            <Button
              block
              size="lg"
              disabled={busy}
              icon={<Check size={18} aria-hidden />}
              onClick={() => void setAchieved(true)}
            >
              Je l’ai réussie
            </Button>
          )}
          {canUncheck && (
            <Button
              variant="secondary"
              block
              size="lg"
              disabled={busy}
              onClick={() => void setAchieved(false)}
            >
              Décocher cette étape
            </Button>
          )}
          {exercise && (
            <ButtonLink to={`/library/${exercise.id}`} variant="ghost" block size="lg">
              Voir la fiche de l’exercice
            </ButtonLink>
          )}
        </div>
      }
    >
      {exercise && <ExerciseMedia exercise={exercise} />}
      <p className="text-[18px] font-semibold text-ink">{name}</p>
      {criterion && (
        <p className="mt-1 text-[15px] text-ink-2">
          {frenchSpacing(
            objectiveSentence(criterion.kind, formatGoalValue(criterion.value, criterion.kind, unit)),
          )}
        </p>
      )}
      {criterion && (
        <p className="mt-1 text-[15px] text-ink-2">
          {step.best
            ? frenchSpacing(
                `Ton record : ${formatGoalValue(step.best.value, criterion.kind, unit)}, le ${shortDate(step.best.date, day)}`,
              )
            : 'Pas encore faite en séance.'}
        </p>
      )}
      {reached && <p className="mt-3 text-[14px] font-medium text-success">{reached}</p>}
      {canCheck && (
        <p className="mt-3 text-[13px] text-ink-3">
          Réussie en dehors d’une séance notée&nbsp;? Coche-la&nbsp;: les étapes d’avant comptent aussi comme
          franchies.
        </p>
      )}
    </Sheet>
  )
}
