import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { Plus } from 'lucide-react'
import { useProfile, useSettings } from '@/app/data-context'
import { useGoBack } from '@/app/useGoBack'
import { needsLoad, newSlot } from '@/content/programs/edit'
import { progressProgram } from '@/content/programs/progression'
import { trainingContext } from '@/content/programs/resolve'
import { schemeFor } from '@/content/programs/schemes'
import { workoutStats } from '@/content/workouts/stats'
import {
  addExercise,
  addSet,
  completeSet,
  nextPendingSet,
  reopenSet,
  type SetValues,
} from '@/content/workouts/workout'
import type { Exercise, Workout, WorkoutExercise, WorkoutSet } from '@/db/types'
import { deleteWorkout, finishWorkout, updateWorkout } from '@/db/workouts'
import { nowISO } from '@/lib/dates'
import { userMessage } from '@/lib/errors'
import { newId } from '@/lib/ids'
import { prefersReducedMotion } from '@/lib/motion'
import { frenchSpacing } from '@/lib/typography'
import { Button } from '@/ui/Button'
import { EmptyState, ProgressBar } from '@/ui/Controls'
import { Page, Section } from '@/ui/Page'
import { PageSpinner } from '@/ui/PageSpinner'
import { ConfirmSheet, Sheet } from '@/ui/Sheet'
import { useToast } from '@/ui/toast-context'
import { useCatalog } from '@/features/library/catalog-context'
import { ExercisePicker } from '@/features/training/ExercisePicker'
import { useInventory, useProgram } from '@/features/training/useTraining'
import { unlockCues, type CueOptions } from './cues'
import { ExerciseActionsSheet } from './ExerciseActionsSheet'
import { ExerciseCard, type SaveWorkout } from './ExerciseCard'
import { FinishSheet, type FinishValues } from './FinishSheet'
import { RestPanel } from './RestPanel'
import { skipRest, startRest, useRest } from './rest-timer'
import { useNow } from './useNow'
import { useWakeLock } from './useWakeLock'
import {
  blockFor,
  currentSet,
  describePending,
  exerciseAnchor,
  formatElapsed,
  groupByBlock,
} from './workout-view'

function scrollToElement(element: Element): void {
  element.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' })
}

function ElapsedClock({ startedAt }: { startedAt: string }) {
  const now = useNow(1000)
  return (
    <span role="timer" aria-label="Durée de la séance" className="text-[15px] font-semibold text-ink tabular">
      {formatElapsed((now - Date.parse(startedAt)) / 1000)}
    </span>
  )
}

function WorkoutProgress({ workout }: { workout: Workout }) {
  const { setsDone, setsTotal } = workoutStats(workout)
  return (
    <div className="flex items-center gap-3">
      <ElapsedClock startedAt={workout.startedAt} />
      <ProgressBar
        value={setsTotal > 0 ? (setsDone / setsTotal) * 100 : 0}
        label="Séries cochées"
        size="sm"
        className="flex-1"
      />
      <span className="text-[13px] text-ink-3 tabular">
        {setsDone}/{setsTotal}
      </span>
    </div>
  )
}

/** Écran de la séance en cours : les séries à cocher, le repos, puis la fin de séance. */
export function ActiveWorkout({ workout }: { workout: Workout }) {
  const settings = useSettings()
  const profile = useProfile()
  const catalog = useCatalog()
  const toast = useToast()
  const navigate = useNavigate()
  const goBack = useGoBack('/training')
  const program = useProgram(workout.programId ?? undefined)
  const inventory = useInventory()
  const rest = useRest()
  const [optionsFor, setOptionsFor] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [abandoning, setAbandoning] = useState(false)
  const [busy, setBusy] = useState(false)
  const [forcedLoads, setForcedLoads] = useState<ReadonlySet<string>>(() => new Set())
  // Exercice ajouté : on y descend dès qu'il est affiché.
  const pendingScroll = useRef<string | null>(null)
  useWakeLock(settings.keepScreenOn)

  const locationId = program ? program.locationId : settings.currentLocationId
  const context = useMemo(
    () => (inventory ? trainingContext(catalog.byId, inventory.items, locationId) : null),
    [catalog, inventory, locationId],
  )

  useEffect(() => {
    const target = pendingScroll.current
    if (!target) return
    const element = document.getElementById(exerciseAnchor(target))
    if (!element) return
    pendingScroll.current = null
    scrollToElement(element)
  })

  if (program === undefined || !context) return <PageSpinner />

  const cues: CueOptions = { sound: settings.restTimerSound, voice: settings.voiceCues }
  const scheme = schemeFor(program?.focuses ?? profile.focuses, profile.experience)
  const unit = settings.weightUnit
  const resting = rest?.workoutId === workout.id ? rest : null
  const current = currentSet(workout)

  const scrollToExercise = (id: string) => {
    const element = document.getElementById(exerciseAnchor(id))
    if (element) scrollToElement(element)
    else pendingScroll.current = id
  }

  const save: SaveWorkout = async (change) => {
    try {
      return await updateWorkout(workout.id, change)
    } catch (error) {
      toast(userMessage(error, 'Enregistrement impossible.'), 'error')
      throw error
    }
  }
  const ignore = () => undefined

  const complete = (exercise: WorkoutExercise, set: WorkoutSet, values: SetValues) => {
    // Pendant le toucher : Safari autorise ensuite les bips et la voix du repos.
    unlockCues(cues)
    const at = nowISO()
    save((w) => completeSet(w, exercise.id, set.id, values, at)).catch(ignore)
    const updated = completeSet(workout, exercise.id, set.id, values, at)
    const next = nextPendingSet(updated, { exerciseId: exercise.id, setId: set.id })
    if (!next) {
      skipRest()
      toast(frenchSpacing('Tout est coché : tu peux terminer la séance !'))
      return
    }
    const { text, spoken } = describePending(
      next,
      catalog.byId.get(next.exercise.exerciseId)?.name ?? 'Exercice supprimé',
      catalog.byId.get(next.exercise.exerciseId)?.measure,
    )
    startRest({ workoutId: workout.id, seconds: exercise.restSec, next: text, announce: spoken, cues })
    if (next.exercise.id !== exercise.id) scrollToExercise(next.exercise.id)
  }

  const add = (chosen: Exercise) => {
    setAdding(false)
    const block = blockFor(chosen)
    const slot = newSlot(chosen, block, { scheme, loadsOf: context.loadsOf, newId })
    save((w) =>
      addExercise(w, chosen.id, {
        restSec: slot.restSec,
        newId,
        target: slot.target,
        sets: slot.sets,
        loadKg: slot.loadKg,
        block,
      }),
    ).then((saved) => {
      const added = saved.exercises.at(-1)
      if (added) scrollToExercise(added.id)
      toast(frenchSpacing(`« ${chosen.name} » ajouté`))
    }, ignore)
  }

  const finish = async (values: FinishValues) => {
    if (!inventory) return
    setBusy(true)
    try {
      await finishWorkout(workout.id, values, (p, w) =>
        progressProgram(
          p,
          w,
          trainingContext(catalog.byId, inventory.items, p.locationId),
          schemeFor(p.focuses, profile.experience),
        ),
      )
      skipRest()
      toast('Séance enregistrée')
    } catch (error) {
      setBusy(false)
      toast(userMessage(error, 'Impossible d’enregistrer la séance.'), 'error')
    }
  }

  const abandon = async () => {
    skipRest()
    // On quitte l'écran avant : la séance va disparaître.
    await navigate('/training', { replace: true })
    try {
      await deleteWorkout(workout.id)
      toast('Séance abandonnée')
    } catch (error) {
      toast(userMessage(error, 'Impossible d’abandonner la séance.'), 'error')
    }
  }

  const loadShown = (exercise: WorkoutExercise): boolean => {
    const definition = catalog.byId.get(exercise.exerciseId)
    return (
      forcedLoads.has(exercise.id) ||
      exercise.sets.some((set) => set.loadKg !== null) ||
      (definition !== undefined && needsLoad(definition))
    )
  }
  const optionsExercise = optionsFor ? workout.exercises.find((e) => e.id === optionsFor) : undefined

  return (
    <Page
      title={workout.title}
      noTabBar
      large={false}
      onBack={goBack}
      toolbar={<WorkoutProgress workout={workout} />}
      footer={
        resting ? (
          <RestPanel rest={resting} />
        ) : (
          <Button
            block
            size="lg"
            onClick={() => {
              setFinishing(true)
            }}
          >
            Terminer la séance
          </Button>
        )
      }
      className="pt-2"
    >
      {workout.deload && (
        <p className="mb-4 rounded-2xl bg-success/10 px-4 py-3 text-[14px] text-ink-2">
          Semaine allégée&nbsp;: moitié moins de séries pour récupérer.
        </p>
      )}

      {workout.exercises.length === 0 ? (
        <EmptyState
          title="Séance vide"
          text="Ajoute les exercices au fur et à mesure, puis coche chaque série faite."
        />
      ) : (
        groupByBlock(workout.exercises).map((group) => (
          <Section key={group.key} title={group.title}>
            <div className="flex flex-col gap-3">
              {group.exercises.map((exercise) => (
                <ExerciseCard
                  key={exercise.id}
                  exercise={exercise}
                  definition={catalog.byId.get(exercise.exerciseId)}
                  unit={unit}
                  currentSetId={current?.set.id ?? null}
                  forceLoad={forcedLoads.has(exercise.id)}
                  cues={cues}
                  save={save}
                  onComplete={(set, values) => {
                    complete(exercise, set, values)
                  }}
                  onReopen={(set) => {
                    save((w) => reopenSet(w, exercise.id, set.id)).catch(ignore)
                  }}
                  onAddSet={() => {
                    save((w) => addSet(w, exercise.id, newId)).catch(ignore)
                  }}
                  onOptions={() => {
                    setOptionsFor(exercise.id)
                  }}
                />
              ))}
            </div>
          </Section>
        ))
      )}

      <div className="mt-4 flex flex-col gap-2">
        <Button
          variant="soft"
          block
          icon={<Plus size={18} aria-hidden />}
          onClick={() => {
            setAdding(true)
          }}
        >
          Ajouter un exercice
        </Button>
        <Button
          variant="ghost"
          block
          className="text-danger"
          onClick={() => {
            setAbandoning(true)
          }}
        >
          Abandonner la séance
        </Button>
      </div>
      {/* Le repos prend plus de place que le bouton de fin : rien ne reste caché dessous. */}
      {resting && <div aria-hidden className="h-12" />}

      <ExerciseActionsSheet
        workout={workout}
        exerciseId={optionsFor}
        program={program}
        context={context}
        scheme={scheme}
        loadShown={optionsExercise ? loadShown(optionsExercise) : false}
        save={save}
        onAddLoad={(id) => {
          setForcedLoads((ids) => new Set([...ids, id]))
        }}
        onClose={() => {
          setOptionsFor(null)
        }}
      />

      <Sheet
        open={adding}
        onClose={() => {
          setAdding(false)
        }}
        title="Ajouter un exercice"
        tall
      >
        <ExercisePicker ladderId={null} currentId={null} kinds={context.kinds} onPick={add} />
      </Sheet>

      <FinishSheet
        open={finishing}
        workout={workout}
        busy={busy}
        onClose={() => {
          setFinishing(false)
        }}
        onFinish={(values) => void finish(values)}
        onAbandon={() => {
          setFinishing(false)
          setAbandoning(true)
        }}
      />

      <ConfirmSheet
        open={abandoning}
        onClose={() => {
          setAbandoning(false)
        }}
        title={frenchSpacing('Abandonner la séance ?')}
        message="Les séries notées seront perdues, et le programme ne bougera pas."
        confirmLabel="Abandonner"
        onConfirm={() => void abandon()}
      />
    </Page>
  )
}
