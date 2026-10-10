import { useEffect, useState } from 'react'
import { formatClock, formatDuration } from '@/lib/dates'
import { cn } from '@/lib/cn'
import { Button } from '@/ui/Button'
import { ProgressBar } from '@/ui/Controls'
import { Sheet } from '@/ui/Sheet'
import { cue, type CueOptions } from './cues'
import { useNow } from './useNow'

/** Le temps de se mettre en place avant que le chrono parte. */
const GET_READY_MS = 5000

type Phase = { kind: 'ready'; startAt: number } | { kind: 'running'; startAt: number }

function HoldTimer({
  targetSec,
  sound,
  voice,
  onStop,
  onCancel,
}: {
  targetSec: number | null
  sound: boolean
  voice: boolean
  onStop: (seconds: number) => void
  onCancel: () => void
}) {
  const [phase, setPhase] = useState<Phase>(() => ({ kind: 'ready', startAt: Date.now() + GET_READY_MS }))
  const now = useNow(100)

  // Décompte de mise en place (bips 3, 2, 1), puis départ du chrono.
  useEffect(() => {
    if (phase.kind !== 'ready') return
    const options: CueOptions = { sound, voice }
    const untilStart = phase.startAt - Date.now()
    const timers = [3, 2, 1]
      .filter((sec) => untilStart > sec * 1000)
      .map((sec) =>
        setTimeout(
          () => {
            cue('tick', options)
          },
          untilStart - sec * 1000,
        ),
      )
    timers.push(
      setTimeout(
        () => {
          cue('go', options, 'C’est parti')
          setPhase({ kind: 'running', startAt: phase.startAt })
        },
        Math.max(0, untilStart),
      ),
    )
    return () => {
      for (const timer of timers) clearTimeout(timer)
    }
  }, [phase, sound, voice])

  // Signal quand l'objectif est atteint (le chrono continue : on peut tenir plus longtemps).
  useEffect(() => {
    if (phase.kind !== 'running' || targetSec === null) return
    const untilTarget = phase.startAt + targetSec * 1000 - Date.now()
    if (untilTarget <= 0) return
    const timer = setTimeout(() => {
      cue('go', { sound, voice }, 'Objectif atteint')
    }, untilTarget)
    return () => {
      clearTimeout(timer)
    }
  }, [phase, targetSec, sound, voice])

  if (phase.kind === 'ready') {
    const left = Math.max(1, Math.ceil((phase.startAt - now) / 1000))
    return (
      <div className="flex flex-col items-center gap-5 pb-2 text-center">
        <p className="text-[15px] font-medium text-ink-2">Mets-toi en place</p>
        <p
          role="timer"
          aria-label="Départ dans"
          className="text-[96px] leading-none font-bold text-ink tabular"
        >
          {left}
        </p>
        <div className="flex w-full flex-col gap-2">
          <Button
            block
            size="lg"
            onClick={() => {
              cue('go', { sound, voice })
              setPhase({ kind: 'running', startAt: Date.now() })
            }}
          >
            Partir maintenant
          </Button>
          <Button variant="secondary" block size="lg" onClick={onCancel}>
            Annuler
          </Button>
        </div>
      </div>
    )
  }

  const elapsed = Math.max(0, (now - phase.startAt) / 1000)
  const reached = targetSec !== null && elapsed >= targetSec
  return (
    <div className="flex flex-col items-center gap-5 pb-2 text-center">
      <p className={cn('text-[15px] font-medium', reached ? 'text-success' : 'text-ink-2')}>
        {reached ? 'Objectif atteint, continue si tu peux' : 'Tiens bon'}
      </p>
      <p role="timer" aria-label="Temps tenu" className="text-[80px] leading-none font-bold text-ink tabular">
        {formatClock(Math.floor(elapsed))}
      </p>
      {targetSec !== null && (
        <div className="w-full">
          <ProgressBar value={(elapsed / targetSec) * 100} label="Objectif de temps" />
          <p className="mt-2 text-[13px] text-ink-3">Objectif&nbsp;: {formatDuration(targetSec)}</p>
        </div>
      )}
      <div className="flex w-full flex-col gap-2">
        <Button
          block
          className="h-20 rounded-3xl text-[20px]"
          onClick={() => {
            onStop(Math.max(1, Math.round((Date.now() - phase.startAt) / 1000)))
          }}
        >
          Stop
        </Button>
        <Button variant="secondary" block size="lg" onClick={onCancel}>
          Annuler
        </Button>
      </div>
    </div>
  )
}

/** Chrono d'une série tenue (gainage, suspension, figure) : décompte, puis temps tenu. */
export function HoldSheet({
  open,
  title,
  targetSec,
  cues,
  onStop,
  onClose,
}: {
  open: boolean
  title: string
  targetSec: number | null
  cues: CueOptions
  onStop: (seconds: number) => void
  onClose: () => void
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <HoldTimer
        targetSec={targetSec}
        sound={cues.sound}
        voice={cues.voice}
        onStop={onStop}
        onCancel={onClose}
      />
    </Sheet>
  )
}
