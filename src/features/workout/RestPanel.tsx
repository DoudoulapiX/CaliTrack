import { formatClock } from '@/lib/dates'
import { Button } from '@/ui/Button'
import { ProgressBar } from '@/ui/Controls'
import { adjustRest, restRemainingSec, skipRest, type RestState } from './rest-timer'
import { useNow } from './useNow'

/** Écart de temps des boutons −15 s et +15 s. */
const STEP_SEC = 15

/** Repos entre deux séries, en bas de l'écran de séance : temps restant et ce qui vient ensuite. */
export function RestPanel({ rest }: { rest: RestState }) {
  const now = useNow(250)
  const remaining = restRemainingSec(rest, now)
  const elapsed = rest.totalSec > 0 ? ((rest.totalSec - remaining) / rest.totalSec) * 100 : 100

  return (
    <section aria-label="Repos" className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold tracking-wide text-ink-3 uppercase">Repos</p>
          <p
            role="timer"
            aria-label="Repos restant"
            className="text-[34px] leading-none font-bold text-ink tabular"
          >
            {formatClock(remaining)}
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          className="whitespace-nowrap"
          onClick={() => {
            adjustRest(-STEP_SEC)
          }}
        >
          −15 s
        </Button>
        <Button
          variant="secondary"
          size="sm"
          className="whitespace-nowrap"
          onClick={() => {
            adjustRest(STEP_SEC)
          }}
        >
          +15 s
        </Button>
        <Button size="sm" onClick={skipRest}>
          Passer
        </Button>
      </div>
      <ProgressBar value={elapsed} label="Repos écoulé" size="sm" />
      {rest.next && (
        <p className="truncate text-[13px] text-ink-2">
          Ensuite&nbsp;: <span className="font-medium text-ink">{rest.next}</span>
        </p>
      )}
    </section>
  )
}
