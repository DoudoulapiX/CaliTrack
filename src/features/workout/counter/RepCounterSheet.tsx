import { useEffect, useRef } from 'react'
import type { PendingSet, SetValues } from '@/content/workouts/workout'
import type { CountedVariant } from '@/content/reps/types'
import type { Workout, WorkoutExercise, WorkoutSet } from '@/db/types'
import { Button } from '@/ui/Button'
import { Sheet } from '@/ui/Sheet'
import type { CueOptions } from '../cues'
import type { SaveWorkout } from '../ExerciseCard'
import { CounterDebug } from './CounterDebug'
import { CounterGuide } from './CounterGuide'
import { CounterLive, CounterStage, EventLine } from './CounterLive'
import { CounterResult } from './CounterResult'
import type { SessionView } from './counter-session'
import { counterTitle, GUIDE_TEXT, LIVE_LABEL, targetLine, targetMin } from './counter-view'
import { useRepSession } from './useRepSession'

export interface RepCounterSheetProps {
  readonly workout: Workout
  /** La ligne de la séance, à jour (la séance ne rend plus la feuille si elle disparaît). */
  readonly exercise: WorkoutExercise
  readonly exerciseName: string
  readonly variant: CountedVariant
  readonly cues: CueOptions
  /** Coche la série (repos lancé, compté depuis restFrom) ; rend la série suivante de la séance. */
  readonly onComplete: (set: WorkoutSet, values: SetValues, restFrom?: number) => Promise<PendingSet | null>
  readonly save: SaveWorkout
  readonly onClose: () => void
}

/**
 * Un écran du compteur pour le focus : l'enregistrement en cours et la série enregistrée sont le même écran,
 * « Corriger » en ouvre un autre.
 */
function focusKey(view: SessionView): string {
  if (view.kind === 'saving') return 'saved'
  if (view.kind === 'saved' && view.correcting) return 'correcting'
  return view.kind
}

/**
 * Quand l'écran change, le bouton touché disparaît souvent avec lui : le focus passe au premier élément marqué
 * `data-focus` du nouvel écran (« Enregistrer … » à vérifier, le nombre enregistré, « Terminer la série »…), pour
 * que VoiceOver et le clavier ne repartent pas du haut de la page. Rien ne bouge à l'ouverture.
 */
function useFocusOnScreenChange(key: string) {
  const ref = useRef<HTMLDivElement>(null)
  const shown = useRef(key)
  useEffect(() => {
    if (shown.current === key) return
    shown.current = key
    ref.current?.closest('dialog')?.querySelector<HTMLElement>('[data-focus]')?.focus()
  }, [key])
  return ref
}

/**
 * Le compteur caméra d'une série, en feuille plein écran : conseils de placement (la première fois pour ce
 * mouvement), image de la caméra et compte en direct, puis série enregistrée (et repos) ou compte à vérifier.
 */
export function RepCounterSheet(props: RepCounterSheetProps) {
  const { exercise, exerciseName, variant, cues } = props
  const { state, snapshot, camera, wakeLock, prefs, actions, rest, cameraOn, canExport, validated } =
    useRepSession(props)
  const movement = variant.movement
  const { view } = state
  const line = targetLine(exercise.target)
  const onStage = view.kind === 'starting' || view.kind === 'live'
  const contentRef = useFocusOnScreenChange(focusKey(view))

  let footer = null
  if (view.kind === 'guide') {
    footer = (
      <Button block size="lg" onClick={actions.openCamera}>
        {GUIDE_TEXT.open}
      </Button>
    )
  } else if (view.kind === 'live') {
    footer = (
      <Button block size="lg" data-focus onClick={actions.finish}>
        {LIVE_LABEL.finish}
      </Button>
    )
  }

  return (
    <Sheet
      open
      tall
      guardClose
      wrapTitle
      title={counterTitle(exerciseName, state.setIndex)}
      onClose={actions.close}
      footer={footer}
      scrollKey={view.kind}
    >
      <div ref={contentRef} className="flex flex-col gap-4">
        {line && <p className="text-[13px] text-ink-3">{line}</p>}
        {view.kind === 'guide' && (
          <CounterGuide
            movement={movement}
            voiceOff={!cues.voice}
            wakeLockUnavailable={wakeLock === 'unavailable'}
            trial={!validated}
          />
        )}
        {cameraOn && (
          <CounterStage
            visible={onStage}
            facing={prefs.facing}
            videoRef={camera.videoRef}
            overlayRef={camera.overlayRef}
            below={view.kind === 'live' && <EventLine snapshot={snapshot} movement={movement} />}
          >
            <CounterLive
              phase={view.kind === 'live' ? 'live' : 'starting'}
              movement={movement}
              cameraState={camera.state}
              snapshot={snapshot}
              target={targetMin(exercise.target)}
              wakeLockUnavailable={wakeLock === 'unavailable'}
              debug={prefs.debug}
              onSwitchCamera={actions.switchCamera}
              onGuide={actions.showGuide}
              onToggleDebug={actions.toggleDebug}
            />
          </CounterStage>
        )}
        {view.kind !== 'guide' && view.kind !== 'starting' && view.kind !== 'live' && (
          <CounterResult view={view} rest={rest} actions={actions} />
        )}
        {prefs.debug && cameraOn && view.kind !== 'guide' && view.kind !== 'starting' && (
          <CounterDebug
            movement={movement}
            snapshot={snapshot}
            stats={camera.stats}
            delegate={prefs.delegate}
            onDelegate={actions.setDelegate}
            canExport={canExport}
            onExport={actions.exportPoints}
          />
        )}
      </div>
    </Sheet>
  )
}
