import { useEffect, useState, type ReactNode, type RefObject } from 'react'
import { CircleHelp, Gauge, SwitchCamera } from 'lucide-react'
import type { CounterSnapshot, CountedMovement } from '@/content/reps/types'
import type { Facing } from '@/lib/camera'
import { cn } from '@/lib/cn'
import { IconButton } from '@/ui/Button'
import {
  countShown,
  eventText,
  LIVE_LABEL,
  liveText,
  repsLabel,
  startingText,
  STATUS_TEXT,
  WAKE_LOCK_TEXT,
} from './counter-view'
import type { PoseCameraState } from './usePoseCamera'

/** Durée d'affichage de « Pas assez bas : pas comptée. » sous l'image. */
export const EVENT_MS = 2000

/** « Pas assez bas : pas comptée. » pendant 2 s après chaque mouvement pas compté. */
export function EventLine({
  snapshot,
  movement,
}: {
  snapshot: CounterSnapshot | null
  movement: CountedMovement
}) {
  const event = snapshot?.event ?? null
  const id = event?.id ?? null
  const [expired, setExpired] = useState<number | null>(null)
  useEffect(() => {
    if (id === null) return
    const timer = setTimeout(() => {
      setExpired(id)
    }, EVENT_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [id])
  const text = event && event.id !== expired ? eventText(event, movement) : null
  return (
    <p aria-live="polite" className="min-h-6 text-center text-[15px] font-medium text-warning">
      {text}
    </p>
  )
}

export interface CounterLiveProps {
  readonly movement: CountedMovement
  /** Préparation (caméra pas encore prête) ou direct. */
  readonly phase: 'starting' | 'live'
  readonly cameraState: PoseCameraState
  readonly snapshot: CounterSnapshot | null
  readonly target: number | null
  readonly wakeLockUnavailable: boolean
  readonly debug: boolean
  readonly onSwitchCamera: () => void
  readonly onGuide: () => void
  readonly onToggleDebug: () => void
}

/**
 * Ce qui se superpose à l'image de la caméra : préparation, puis consigne, boutons et grand compte en direct.
 */
export function CounterLive({
  movement,
  phase,
  cameraState,
  snapshot,
  target,
  wakeLockUnavailable,
  debug,
  onSwitchCamera,
  onGuide,
  onToggleDebug,
}: CounterLiveProps) {
  const live = phase === 'live'
  const reps = snapshot?.reps ?? 0
  return (
    <>
      {live && (
        <div className="absolute top-3 right-16 left-3 flex flex-col items-start gap-2">
          <p
            role="status"
            aria-label="Consigne"
            className="max-w-full rounded-2xl bg-black/60 px-3 py-2 text-[15px] leading-snug text-white"
          >
            {liveText(snapshot, movement, target)}
            {snapshot?.slow && <span className="mt-1 block text-[13px]">{STATUS_TEXT.slow}</span>}
          </p>
          {wakeLockUnavailable && (
            <p className="max-w-full rounded-2xl bg-black/60 px-3 py-2 text-[13px] leading-snug text-white">
              {WAKE_LOCK_TEXT}
            </p>
          )}
        </div>
      )}
      {live && (
        <div className="absolute top-3 right-3 flex flex-col gap-2">
          <IconButton
            variant="filled"
            label={LIVE_LABEL.switchCamera}
            disabled={reps > 0}
            onClick={onSwitchCamera}
          >
            <SwitchCamera size={20} aria-hidden />
          </IconButton>
          <IconButton variant="filled" label={LIVE_LABEL.guide} onClick={onGuide}>
            <CircleHelp size={20} aria-hidden />
          </IconButton>
          <IconButton
            variant={debug ? 'accent' : 'filled'}
            label={LIVE_LABEL.debug}
            aria-pressed={debug}
            onClick={onToggleDebug}
          >
            <Gauge size={20} aria-hidden />
          </IconButton>
        </div>
      )}
      {live && snapshot && countShown(snapshot) && (
        <p
          role="status"
          aria-label="Répétitions comptées"
          className="absolute bottom-3 left-3 rounded-2xl bg-black/60 px-3 py-2 leading-none text-white"
        >
          <span className="text-[min(30vw,15dvh)] leading-none font-bold tabular text-white">{reps}</span>
          &nbsp;
          <span className="text-[17px] font-semibold">{repsLabel(reps)}</span>
        </p>
      )}
      {!live && (
        <p
          role="status"
          className="absolute inset-0 flex items-center justify-center p-6 text-center text-[15px] text-white"
        >
          {startingText(cameraState)}
        </p>
      )}
    </>
  )
}

export interface CounterStageProps {
  /** Préparation ou direct : sinon (repos, résultat, conseils) l'image est cachée, la caméra reste branchée. */
  readonly visible: boolean
  readonly facing: Facing
  readonly videoRef: RefObject<HTMLVideoElement | null>
  readonly overlayRef: RefObject<HTMLCanvasElement | null>
  /** Ce qui se superpose à l'image (CounterLive). */
  readonly children: ReactNode
  /** Sous l'image : la ligne des mouvements pas comptés. */
  readonly below?: ReactNode
}

/** Le cadre de l'image (3/4, noir), gardé dans la page dès que la caméra est demandée. */
export function CounterStage({ visible, facing, videoRef, overlayRef, children, below }: CounterStageProps) {
  return (
    <div className={cn('flex flex-col gap-2', !visible && 'hidden')}>
      <div className="relative mx-auto aspect-[3/4] max-h-[56dvh] w-full overflow-hidden rounded-2xl bg-black">
        <div className={cn('relative size-full', facing === 'user' && '-scale-x-100')}>
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            aria-label="Image de la caméra"
            className="size-full object-contain"
          />
          <canvas ref={overlayRef} aria-hidden className="pointer-events-none absolute inset-0 size-full" />
        </div>
        {visible && children}
      </div>
      {visible && below}
    </div>
  )
}
