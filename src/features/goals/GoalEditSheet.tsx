import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Trash2 } from 'lucide-react'
import { useSettings } from '@/app/data-context'
import {
  bodyweightGoalError,
  climbingGoalError,
  deadlineError,
  GOAL_TITLE_MAX,
  MAX_CLIMB_COUNT,
  withSuggestedTitle,
} from '@/content/goals/create'
import { withoutStep, withStepTarget } from '@/content/goals/edit'
import { findGrade, gradeIndex } from '@/content/grades'
import { db } from '@/db/db'
import { saveGoal } from '@/db/goals'
import type { Goal } from '@/db/types'
import { today as todayISO } from '@/lib/dates'
import { userMessage } from '@/lib/errors'
import { unitToKg } from '@/lib/units'
import { Button, IconButton } from '@/ui/Button'
import { ChoiceChips, Stepper } from '@/ui/Controls'
import { NumberField, TextField } from '@/ui/Field'
import { Sheet } from '@/ui/Sheet'
import { useToast } from '@/ui/toast-context'
import { useCatalog } from '@/features/library/catalog-context'
import { stepName, weightInUnit } from './goal-view'

const SUFFIX = { reps: 'rép.', time: 's' } as const

/** Modifier un objectif : son nom, son échéance et ce qu'il vise. */
export function GoalEditSheet({ goal, onClose }: { goal: Goal; onClose: () => void }) {
  const { weightUnit: unit } = useSettings()
  const catalog = useCatalog()
  const toast = useToast()
  const day = todayISO()
  const scale = useLiveQuery(
    async () => (goal.scaleId ? ((await db.gradeScales.get(goal.scaleId)) ?? null) : null),
    [goal.scaleId],
  )
  const [title, setTitle] = useState(goal.title)
  const [deadline, setDeadline] = useState(goal.deadline ?? '')
  const [steps, setSteps] = useState(() =>
    goal.milestones.map((m) => ({ milestone: m, value: m.criterion ? m.criterion.value : null })),
  )
  const loadShown = (kg: number | null) => (kg === null ? null : weightInUnit(kg, unit))
  const [target, setTarget] = useState<number | null>(
    goal.kind === 'exercise' && goal.metric === 'load' ? loadShown(goal.targetValue) : goal.targetValue,
  )
  const [start, setStart] = useState<number | null>(
    goal.kind === 'bodyweight' ? loadShown(goal.startValue) : null,
  )
  const [weightTarget, setWeightTarget] = useState<number | null>(
    goal.kind === 'bodyweight' ? loadShown(goal.targetValue) : null,
  )
  const [gradeKey, setGradeKey] = useState(goal.gradeKey ?? '')
  const [count, setCount] = useState(goal.targetCount ?? 5)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const changed =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      set(value)
      setError(null)
    }

  /** L'objectif modifié, ou le message à corriger. */
  const build = (): Goal | string => {
    const name = title.trim()
    if (name === '') return 'Donne un nom à ton objectif.'
    const due = deadline === '' ? null : deadline
    const dueError = deadlineError(due, day, due === goal.deadline)
    if (dueError) return dueError
    const base: Goal = { ...goal, title: name, deadline: due }
    switch (goal.kind) {
      case 'skill': {
        if (steps.some((s) => s.milestone.criterion && (s.value === null || s.value <= 0))) {
          return 'Indique la cible de chaque étape.'
        }
        const kept = new Set(steps.map((s) => s.milestone.id))
        let next = base
        for (const milestone of goal.milestones) {
          if (!kept.has(milestone.id)) next = withoutStep(next, milestone.id)
        }
        for (const { milestone, value } of steps) {
          if (value !== null) next = withStepTarget(next, milestone.id, value)
        }
        return next
      }
      case 'exercise': {
        if (target === null || target <= 0) return 'Indique ce que tu vises.'
        return { ...base, targetValue: goal.metric === 'load' ? unitToKg(target, unit) : target }
      }
      case 'bodyweight': {
        const startKg = start === null ? null : unitToKg(start, unit)
        const targetKg = weightTarget === null ? null : unitToKg(weightTarget, unit)
        const weightError = bodyweightGoalError(startKg, targetKg, unit)
        if (weightError !== null) {
          return weightError === 'Indique ton poids actuel.' ? 'Indique ton poids de départ.' : weightError
        }
        return { ...base, startValue: startKg, targetValue: targetKg }
      }
      case 'climbing': {
        // Un niveau disparu de l'échelle (couleurs de la salle modifiées) doit être remplacé.
        const known = scale ? gradeIndex(scale, gradeKey) >= 0 : gradeKey !== ''
        const climbError = climbingGoalError(known ? gradeKey : null, count)
        if (climbError !== null) return climbError
        return { ...base, gradeKey, targetCount: count }
      }
      case 'custom':
        return base
    }
  }

  const save = async () => {
    const next = build()
    if (typeof next === 'string') {
      setError(next)
      return
    }
    const names = {
      exercise: (id: string) => catalog.byId.get(id)?.name,
      grade: (key: string) => (scale ? findGrade(scale, key) : undefined),
    }
    setBusy(true)
    try {
      await saveGoal(withSuggestedTitle(goal, next, names, unit))
      toast('Objectif enregistré')
      onClose()
    } catch (e) {
      setBusy(false)
      setError(userMessage(e, 'Enregistrement impossible, réessaie.'))
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Modifier l’objectif"
      tall={goal.kind === 'skill'}
      footer={
        <div className="flex flex-col gap-2">
          {error && (
            <p role="alert" className="text-[14px] font-medium text-danger">
              {error}
            </p>
          )}
          <Button block size="lg" disabled={busy} onClick={() => void save()}>
            Enregistrer
          </Button>
        </div>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <TextField
          label="Nom"
          value={title}
          maxLength={GOAL_TITLE_MAX}
          autoCapitalize="sentences"
          onChange={changed(setTitle)}
        />
        <TextField
          label="Échéance (facultatif)"
          type="date"
          value={deadline}
          hint="Sans date, l’objectif n’a pas d’échéance."
          onChange={changed(setDeadline)}
        />

        {goal.kind === 'skill' && (
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 px-1 text-[13px] font-medium text-ink-2">Étapes</legend>
            {steps.map(({ milestone, value }, i) => {
              const name = stepName(milestone, (id) => catalog.byId.get(id)?.name)
              return (
                <div key={milestone.id} className="flex items-end gap-2">
                  {milestone.criterion ? (
                    <NumberField
                      label={`${String(i + 1)}. ${name}`}
                      className="min-w-0 flex-1"
                      value={value}
                      min={1}
                      max={milestone.criterion.kind === 'time' ? 3600 : 500}
                      suffix={milestone.criterion.kind === 'load' ? unit : SUFFIX[milestone.criterion.kind]}
                      onChange={(next) => {
                        setSteps((list) => list.map((s, j) => (j === i ? { ...s, value: next } : s)))
                        setError(null)
                      }}
                    />
                  ) : (
                    <p className="min-w-0 flex-1 py-3 text-[15px] text-ink">{`${String(i + 1)}. ${name}`}</p>
                  )}
                  <IconButton
                    label={`Retirer l’étape ${String(i + 1)}`}
                    disabled={steps.length <= 1}
                    onClick={() => {
                      setSteps((list) => list.filter((_, j) => j !== i))
                      setError(null)
                    }}
                  >
                    <Trash2 size={18} aria-hidden />
                  </IconButton>
                </div>
              )
            })}
          </fieldset>
        )}

        {goal.kind === 'exercise' && goal.metric !== null && (
          <NumberField
            label="Objectif"
            value={target}
            min={1}
            decimal={goal.metric === 'load'}
            suffix={goal.metric === 'load' ? unit : SUFFIX[goal.metric]}
            onChange={changed(setTarget)}
          />
        )}

        {goal.kind === 'bodyweight' && (
          <div className="grid grid-cols-2 gap-3">
            <NumberField
              label="Poids de départ"
              value={start}
              decimal
              suffix={unit}
              onChange={changed(setStart)}
            />
            <NumberField
              label="Poids visé"
              value={weightTarget}
              decimal
              suffix={unit}
              onChange={changed(setWeightTarget)}
            />
          </div>
        )}

        {goal.kind === 'climbing' && scale && (
          <>
            <div className="flex flex-col gap-1.5">
              <span className="px-1 text-[13px] font-medium text-ink-2">Niveau</span>
              <ChoiceChips
                label="Niveau"
                value={gradeKey}
                options={scale.grades.map((g) => ({
                  value: g.key,
                  label: g.label,
                  icon: (
                    <span
                      aria-hidden
                      className="size-3 rounded-full ring-1 ring-black/10"
                      style={{ backgroundColor: g.color }}
                    />
                  ),
                }))}
                onChange={changed(setGradeKey)}
              />
              {gradeIndex(scale, gradeKey) < 0 && (
                <p className="px-1 text-[12px] text-ink-3">Ce niveau n’existe plus : choisis-en un autre.</p>
              )}
            </div>
            <div className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-3.5 py-2">
              <span className="text-[16px] text-ink">Nombre de blocs</span>
              <Stepper
                label="Nombre de blocs"
                value={count}
                min={1}
                max={MAX_CLIMB_COUNT}
                onChange={changed(setCount)}
              />
            </div>
          </>
        )}
      </form>
    </Sheet>
  )
}
