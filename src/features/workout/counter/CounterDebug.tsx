import { Download } from 'lucide-react'
import type { CounterSnapshot, CountedMovement } from '@/content/reps/types'
import { Button } from '@/ui/Button'
import { Toggle } from '@/ui/Controls'
import { DEBUG_TEXT, debugLines } from './counter-view'
import type { Delegate } from './pose-engine'
import type { PoseCameraStats } from './usePoseCamera'

export interface CounterDebugProps {
  readonly movement: CountedMovement
  readonly snapshot: CounterSnapshot | null
  readonly stats: PoseCameraStats
  /** Calcul choisi pour la prochaine ouverture du compteur. */
  readonly delegate: Delegate
  readonly onDelegate: (delegate: Delegate) => void
  /** Une série finie a des points à exporter. */
  readonly canExport: boolean
  readonly onExport: () => void
}

/** « Infos de réglage » : ce que mesure le compteur, pour le régler sur ce téléphone. */
export function CounterDebug({
  movement,
  snapshot,
  stats,
  delegate,
  onDelegate,
  canExport,
  onExport,
}: CounterDebugProps) {
  return (
    <section aria-label={DEBUG_TEXT.section} className="flex flex-col gap-3 rounded-2xl bg-surface-2 py-3">
      <ul className="flex flex-col gap-0.5 px-4 text-[13px] text-ink-2 tabular">
        {debugLines(snapshot, stats, movement).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <Toggle
        checked={delegate === 'GPU'}
        onChange={(on) => {
          onDelegate(on ? 'GPU' : 'CPU')
        }}
        label={DEBUG_TEXT.gpu}
        description={DEBUG_TEXT.gpuHelp}
      />
      {canExport && (
        <div className="flex flex-col gap-1 px-4">
          <Button variant="secondary" block icon={<Download size={18} aria-hidden />} onClick={onExport}>
            {DEBUG_TEXT.export}
          </Button>
          <p className="text-[13px] text-ink-3">{DEBUG_TEXT.exportNote}</p>
        </div>
      )}
    </section>
  )
}
