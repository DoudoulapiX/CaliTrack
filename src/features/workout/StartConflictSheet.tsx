import { workoutStats } from '@/content/workouts/stats'
import { formatDay, formatTimeOf, localDateOf, today } from '@/lib/dates'
import { frenchSpacing } from '@/lib/typography'
import { Button } from '@/ui/Button'
import { Sheet } from '@/ui/Sheet'
import type { StartConflict } from './useStartWorkout'

/** « à 18:05 », ou « le lundi 12 octobre à 18:05 » pour une séance d'un autre jour. */
function startedAt(timestamp: string): string {
  const day = localDateOf(timestamp)
  const time = `à ${formatTimeOf(timestamp)}`
  return day === today() ? time : `le ${formatDay(day)} ${time}`
}

/** Une seule séance à la fois : reprendre celle en cours, ou l'abandonner pour la nouvelle. */
export function StartConflictSheet({
  conflict,
  onResume,
  onReplace,
  onClose,
}: {
  conflict: StartConflict | null
  onResume: () => void
  onReplace: () => void
  onClose: () => void
}) {
  const active = conflict?.active
  const done = active ? workoutStats(active).setsDone : 0
  return (
    <Sheet
      open={conflict !== null}
      onClose={onClose}
      title="Une séance est déjà en cours"
      footer={
        <div className="flex flex-col gap-2">
          <Button block size="lg" onClick={onResume}>
            Reprendre la séance en cours
          </Button>
          <Button variant="danger" block size="lg" onClick={onReplace}>
            L’abandonner et commencer
          </Button>
        </div>
      }
    >
      {active && (
        <p className="text-[15px] text-ink-2">
          {frenchSpacing(
            `« ${active.title} » a commencé ${startedAt(active.startedAt)}` +
              (done > 0
                ? `, avec ${String(done)} série${done > 1 ? 's' : ''} faite${done > 1 ? 's' : ''}.`
                : '.'),
          )}{' '}
          Une seule séance à la fois&nbsp;: reprends-la, ou abandonne-la pour commencer la nouvelle.
        </p>
      )}
    </Sheet>
  )
}
