import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { ChevronRight } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useSettings } from '@/app/data-context'
import { useGoBack } from '@/app/useGoBack'
import { fontOf } from '@/content/climbing/labels'
import {
  bodyweightGoal,
  bodyweightGoalError,
  bodyweightGoalTitle,
  climbingGoal,
  climbingGoalError,
  climbingGoalTitle,
  customGoal,
  customGoalError,
  deadlineError,
  exerciseGoal,
  exerciseGoalError,
  exerciseGoalTitle,
  formatGoalValue,
  GOAL_TITLE_MAX,
  MAX_CLIMB_COUNT,
  skillGoal,
  type GoalBasics,
} from '@/content/goals/create'
import { bestPerformance, goalProgress, type GoalContext, type GoalMetric } from '@/content/goals/progress'
import { findGrade } from '@/content/grades'
import { SKILLS } from '@/content/skills'
import { db } from '@/db/db'
import { logWeight, saveGoal } from '@/db/goals'
import type { Goal, GoalKind, GradeScale } from '@/db/types'
import { cn } from '@/lib/cn'
import { nowISO, today } from '@/lib/dates'
import { userMessage } from '@/lib/errors'
import { newId } from '@/lib/ids'
import { frenchSpacing } from '@/lib/typography'
import { unitToKg } from '@/lib/units'
import { Button } from '@/ui/Button'
import { ChoiceChips, Segmented, Stepper, Toggle } from '@/ui/Controls'
import { NumberField, TextField } from '@/ui/Field'
import { Page, Section } from '@/ui/Page'
import { PageSpinner } from '@/ui/PageSpinner'
import { Sheet } from '@/ui/Sheet'
import { useToast } from '@/ui/toast-context'
import { GradeSwatch } from '@/features/climbing/GradeSwatch'
import { useAvailableKinds } from '@/features/equipment/useAvailableKinds'
import { ExerciseThumb } from '@/features/library/ExerciseThumb'
import { useCatalog } from '@/features/library/catalog-context'
import { ExercisePicker } from '@/features/training/ExercisePicker'
import { goalPath, percentLabel, progressLine, weightInUnit } from './goal-view'
import { useGoalContext, useGoals, useLineOptions } from './useGoals'

const KINDS: GoalKind[] = ['skill', 'exercise', 'bodyweight', 'climbing', 'custom']

const KIND_CHOICE: Record<GoalKind, string> = {
  skill: 'Figure',
  exercise: 'Exercice',
  bodyweight: 'Poids',
  climbing: 'Escalade',
  custom: 'Autre',
}

const KIND_HINT: Record<GoalKind, string> = {
  skill: 'Une figure de calisthénie, étape par étape : chaque étape se valide en séance.',
  exercise: 'Plus de répétitions, un maintien plus long ou une charge plus lourde sur un exercice.',
  bodyweight: 'Perdre ou prendre du poids : ta barre avance à chaque pesée.',
  climbing: 'Réussir des blocs d’un niveau, ou plus durs.',
  custom: 'Un objectif à toi, dont tu notes l’avancement à la main.',
}

const METRIC_SUFFIX = { reps: 'rép.', time: 's' } as const

function isKind(value: string | null): value is GoalKind {
  return KINDS.some((kind) => kind === value)
}

/** Identifiants jetables pour les aperçus (jamais enregistrés). */
function previewIds(): () => string {
  let n = 0
  return () => `apercu-${String((n += 1))}`
}

const PREVIEW_BASICS: GoalBasics = { title: '', deadline: null, pinned: false }

function NewGoalForm({
  ctx,
  goals,
  scale,
  initialKind,
}: {
  ctx: GoalContext
  goals: Goal[]
  scale: GradeScale | null
  initialKind: GoalKind
}) {
  const settings = useSettings()
  const unit = settings.weightUnit
  const catalog = useCatalog()
  const options = useLineOptions()
  const navigate = useNavigate()
  const toast = useToast()
  const goBack = useGoBack('/goals')
  const { kinds } = useAvailableKinds(null)
  const day = today()
  const climbingShown = !settings.hiddenModules.includes('climbing')
  const nameOf = (id: string) => catalog.byId.get(id)?.name ?? id

  const [kind, setKind] = useState<GoalKind>(initialKind)
  const [title, setTitle] = useState('')
  const [deadline, setDeadline] = useState('')
  const [pinned, setPinned] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Figure
  const followed = new Set(goals.filter((g) => g.kind === 'skill' && !g.archived).map((g) => g.skillId))
  const [skillId, setSkillId] = useState<string | null>(null)
  const previews = useMemo(() => {
    const name = (id: string) => catalog.byId.get(id)?.name ?? id
    return new Map(
      SKILLS.map((skill) => [
        skill.id,
        goalProgress(skillGoal(skill, PREVIEW_BASICS, name, '', previewIds()), ctx),
      ]),
    )
  }, [ctx, catalog])

  // Exercice
  const [exerciseId, setExerciseId] = useState<string | null>(null)
  const [metric, setMetric] = useState<GoalMetric>('reps')
  const [target, setTarget] = useState<number | null>(null)
  const [picking, setPicking] = useState(false)
  const exercise = exerciseId ? catalog.byId.get(exerciseId) : undefined
  const best = exerciseId ? bestPerformance(ctx.performances, exerciseId, metric) : null
  const targetValue = target === null ? null : metric === 'load' ? unitToKg(target, unit) : target

  // Poids
  const lastWeighIn = ctx.weights.at(-1)?.kg ?? null
  const lastKg = lastWeighIn ?? ctx.profileWeightKg
  const [current, setCurrent] = useState<number | null>(lastKg === null ? null : weightInUnit(lastKg, unit))
  const [weightTarget, setWeightTarget] = useState<number | null>(null)
  const currentKg = current === null ? null : unitToKg(current, unit)
  const weightTargetKg = weightTarget === null ? null : unitToKg(weightTarget, unit)

  // Escalade
  const [gradeKey, setGradeKey] = useState('')
  const [count, setCount] = useState(1)
  const grade = scale ? findGrade(scale, gradeKey) : undefined
  const climbPreview =
    scale && grade
      ? goalProgress(climbingGoal({ scaleId: scale.id, grade, count }, PREVIEW_BASICS, '', previewIds()), ctx)
      : null
  const climbsDone = climbPreview?.kind === 'climbing' ? climbPreview.count : 0

  const changed =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      set(value)
      setError(null)
    }

  const autoTitle = (): string => {
    switch (kind) {
      case 'skill':
        return SKILLS.find((s) => s.id === skillId)?.name ?? 'Ex. Muscle-up'
      case 'exercise':
        return exercise && targetValue !== null
          ? exerciseGoalTitle(exercise.name, metric, targetValue, unit)
          : frenchSpacing('Ex. Tractions : 20 rép.')
      case 'bodyweight':
        return weightTargetKg === null ? 'Ex. Peser 75 kg' : bodyweightGoalTitle(weightTargetKg, unit)
      case 'climbing':
        return grade ? climbingGoalTitle(count, grade) : 'Ex. 1 bloc noir'
      case 'custom':
        return 'Ex. Courir 10 km'
    }
  }

  /** L'objectif à créer, ou le message à corriger. */
  const build = (): Goal | string => {
    const due = deadline === '' ? null : deadline
    const dueError = deadlineError(due, day)
    if (dueError) return dueError
    const basics: GoalBasics = { title, deadline: due, pinned }
    const now = nowISO()
    switch (kind) {
      case 'skill': {
        const skill = SKILLS.find((s) => s.id === skillId)
        if (!skill) return 'Choisis une figure.'
        if (followed.has(skill.id)) return 'Tu suis déjà cette figure.'
        return skillGoal(skill, basics, nameOf, now, newId)
      }
      case 'exercise': {
        const start = best?.value ?? 0
        const message = exerciseGoalError({ exerciseId, target: targetValue, start, metric, unit })
        if (message !== null || !exercise || targetValue === null) return message ?? 'Choisis un exercice.'
        return exerciseGoal(
          { exerciseId: exercise.id, name: exercise.name, metric, start, target: targetValue, unit },
          basics,
          now,
          newId,
        )
      }
      case 'bodyweight': {
        const message = bodyweightGoalError(currentKg, weightTargetKg, unit)
        if (message !== null || currentKg === null || weightTargetKg === null) {
          return message ?? 'Indique ton poids actuel.'
        }
        return bodyweightGoal({ startKg: currentKg, targetKg: weightTargetKg, unit }, basics, now, newId)
      }
      case 'climbing': {
        if (!scale) return 'Échelle de cotation introuvable.'
        const message = climbingGoalError(grade ? grade.key : null, count, climbsDone)
        if (message !== null || !grade) return message ?? 'Choisis un niveau.'
        return climbingGoal({ scaleId: scale.id, grade, count }, basics, now, newId)
      }
      case 'custom': {
        const message = customGoalError(title)
        if (message !== null) return message
        return customGoal(basics, now, newId)
      }
    }
  }

  const create = async () => {
    const goal = build()
    if (typeof goal === 'string') {
      setError(goal)
      return
    }
    setBusy(true)
    try {
      // Le poids actuel devient la pesée du jour, sauf s'il n'a pas changé depuis la dernière.
      if (
        kind === 'bodyweight' &&
        currentKg !== null &&
        (lastWeighIn === null || Math.abs(currentKg - lastWeighIn) >= 0.05)
      ) {
        await logWeight(day, currentKg)
      }
      await saveGoal(goal)
      toast('Objectif créé', 'success')
      void navigate(goalPath(goal.id), { replace: true })
    } catch (e) {
      setBusy(false)
      setError(userMessage(e, 'Création impossible, réessaie.'))
    }
  }

  return (
    <Page
      title="Nouvel objectif"
      back
      onBack={goBack}
      backLabel="Objectifs"
      noTabBar
      className="pt-2"
      footer={
        <div className="flex flex-col gap-2">
          {error && (
            <p role="alert" className="text-[14px] font-medium text-danger">
              {error}
            </p>
          )}
          <Button block size="lg" disabled={busy} onClick={() => void create()}>
            Créer l’objectif
          </Button>
        </div>
      }
    >
      <Section>
        <ChoiceChips
          label="Genre d’objectif"
          value={kind}
          options={KINDS.filter((k) => k !== 'climbing' || climbingShown).map((k) => ({
            value: k,
            label: KIND_CHOICE[k],
          }))}
          onChange={changed(setKind)}
        />
        <p className="mt-3 px-1 text-[14px] text-ink-3">{frenchSpacing(KIND_HINT[kind])}</p>
      </Section>

      {kind === 'skill' && (
        <Section title="Figure">
          <div
            role="radiogroup"
            aria-label="Figure"
            className="divide-y divide-line overflow-hidden rounded-2xl bg-surface"
          >
            {SKILLS.map((skill) => {
              const already = followed.has(skill.id)
              const preview = previews.get(skill.id)
              const selected = skill.id === skillId
              const final = skill.steps.at(-1)
              const finalExercise = final ? catalog.byId.get(final.exerciseId) : undefined
              return (
                <button
                  key={skill.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={already}
                  onClick={() => {
                    setSkillId(skill.id)
                    setError(null)
                  }}
                  className={cn(
                    'flex w-full items-center gap-3 px-3 py-2.5 text-left active:bg-surface-2 disabled:opacity-50',
                    selected && 'bg-accent-soft/60',
                  )}
                >
                  {finalExercise && <ExerciseThumb exercise={finalExercise} className="size-11" />}
                  <span className="min-w-0 flex-1">
                    <span className="block text-[16px] leading-snug font-medium text-ink">{skill.name}</span>
                    <span className="mt-0.5 block text-[13px] leading-snug text-ink-3">
                      {already
                        ? 'Déjà suivie'
                        : preview
                          ? `${progressLine(preview, options)} · ${percentLabel(preview)}`
                          : skill.description}
                    </span>
                  </span>
                  <span
                    aria-hidden
                    className={cn(
                      'flex size-6 shrink-0 items-center justify-center rounded-full',
                      selected ? 'bg-accent' : 'ring-2 ring-line ring-inset',
                    )}
                  >
                    {selected && <span className="size-2.5 rounded-full bg-accent-ink" />}
                  </span>
                </button>
              )
            })}
          </div>
          <p className="mt-2 px-1 text-[13px] text-ink-3">
            L’étape en cours est calculée d’après tes séances et ton test de niveau.
          </p>
        </Section>
      )}

      {kind === 'exercise' && (
        <Section title="Exercice">
          <div className="flex flex-col gap-4 rounded-2xl bg-surface p-4">
            <button
              type="button"
              onClick={() => {
                setPicking(true)
              }}
              className="-m-1 flex items-center gap-3 rounded-xl p-1 text-left active:bg-surface-2"
            >
              {exercise ? (
                <ExerciseThumb exercise={exercise} className="size-11" />
              ) : (
                <span aria-hidden className="size-11 shrink-0 rounded-xl bg-surface-2" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block text-[16px] font-medium text-ink">
                  {exercise ? exercise.name : 'Choisir un exercice'}
                </span>
                {exercise && <span className="block text-[13px] text-accent-text">Changer d’exercice</span>}
              </span>
              <ChevronRight size={18} className="shrink-0 text-ink-3" aria-hidden />
            </button>
            {exercise && (
              <>
                <Segmented
                  label="Ce que tu vises"
                  value={metric}
                  options={[
                    {
                      value: exercise.measure,
                      label: exercise.measure === 'reps' ? 'Répétitions' : 'Durée',
                    },
                    { value: 'load', label: 'Charge' },
                  ]}
                  onChange={(next) => {
                    setMetric(next)
                    setTarget(null)
                    setError(null)
                  }}
                />
                <NumberField
                  label="Objectif"
                  value={target}
                  min={1}
                  decimal={metric === 'load'}
                  suffix={metric === 'load' ? unit : METRIC_SUFFIX[metric]}
                  hint={
                    best
                      ? frenchSpacing(`Ton record : ${formatGoalValue(best.value, metric, unit)}`)
                      : 'Pas encore fait : tu pars de zéro.'
                  }
                  onChange={changed(setTarget)}
                />
              </>
            )}
          </div>
          <Sheet
            open={picking}
            onClose={() => {
              setPicking(false)
            }}
            title="Choisir un exercice"
            tall
          >
            <ExercisePicker
              ladderId={null}
              currentId={exerciseId}
              kinds={kinds}
              onPick={(picked) => {
                setExerciseId(picked.id)
                setMetric(picked.measure)
                setTarget(null)
                setError(null)
                setPicking(false)
              }}
            />
          </Sheet>
        </Section>
      )}

      {kind === 'bodyweight' && (
        <Section title="Poids">
          <div className="grid grid-cols-2 gap-3 rounded-2xl bg-surface p-4">
            <NumberField
              label="Poids actuel"
              value={current}
              decimal
              suffix={unit}
              onChange={changed(setCurrent)}
            />
            <NumberField
              label="Poids visé"
              value={weightTarget}
              decimal
              suffix={unit}
              onChange={changed(setWeightTarget)}
            />
          </div>
          <p className="mt-2 px-1 text-[13px] text-ink-3">
            Il est noté comme pesée du jour, sauf s’il n’a pas changé depuis ta dernière pesée.
          </p>
        </Section>
      )}

      {kind === 'climbing' && scale && (
        <Section title="Niveau">
          <div className="flex flex-col gap-4 rounded-2xl bg-surface p-4">
            <ChoiceChips
              label="Niveau"
              value={gradeKey}
              options={scale.grades.map((g) => ({
                value: g.key,
                label: g.label,
                icon: <GradeSwatch color={g.color} size="xs" />,
              }))}
              onChange={changed(setGradeKey)}
            />
            {grade && (
              <p className="text-[13px] text-ink-3">
                {fontOf(grade) ? `${fontOf(grade) ?? ''} en Fontainebleau · ` : ''}
                {climbsDone > 0
                  ? `déjà ${String(climbsDone)} réussi${climbsDone > 1 ? 's' : ''} à ce niveau ou plus dur`
                  : 'les blocs plus durs comptent aussi'}
              </p>
            )}
            <div className="flex items-center justify-between gap-3">
              <span className="text-[16px] text-ink">Nombre de blocs</span>
              <Stepper
                label="Nombre de blocs"
                value={count}
                min={1}
                max={MAX_CLIMB_COUNT}
                onChange={changed(setCount)}
              />
            </div>
          </div>
        </Section>
      )}

      <Section title="Réglages">
        <div className="flex flex-col gap-4 rounded-2xl bg-surface p-4">
          <TextField
            label={kind === 'custom' ? 'Nom' : 'Nom (facultatif)'}
            value={title}
            placeholder={autoTitle()}
            maxLength={GOAL_TITLE_MAX}
            autoCapitalize="sentences"
            onChange={changed(setTitle)}
          />
          <TextField
            label="Échéance (facultatif)"
            type="date"
            value={deadline}
            min={day}
            onChange={changed(setDeadline)}
          />
        </div>
        <div className="mt-3 overflow-hidden rounded-2xl bg-surface">
          <Toggle
            label="Afficher sur l’accueil"
            description="Sa barre apparaît sur l’écran Aujourd’hui."
            checked={pinned}
            onChange={setPinned}
          />
        </div>
      </Section>
    </Page>
  )
}

/** Créer un objectif : une figure, un exercice, son poids, l'escalade ou un objectif libre. */
export function NewGoalPage() {
  const settings = useSettings()
  const [params] = useSearchParams()
  const ctx = useGoalContext()
  const goals = useGoals()
  const scale = useLiveQuery(
    async () => (await db.gradeScales.get(settings.activeGradeScaleId)) ?? null,
    [settings.activeGradeScaleId],
  )
  if (!ctx || !goals || scale === undefined) return <PageSpinner />
  const asked = params.get('type')
  const initialKind =
    isKind(asked) && !(asked === 'climbing' && settings.hiddenModules.includes('climbing')) ? asked : 'skill'
  return <NewGoalForm ctx={ctx} goals={goals} scale={scale} initialKind={initialKind} />
}
