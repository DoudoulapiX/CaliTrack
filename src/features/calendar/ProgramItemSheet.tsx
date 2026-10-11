import { useState } from 'react'
import { Play, SkipForward, Undo2 } from 'lucide-react'
import { MATCH_DAYS, type ProgramItem } from '@/content/calendar/agenda'
import { isDeloadWeek } from '@/content/programs/schedule'
import { setProgramSessionSkipped } from '@/db/calendar'
import { capitalize, diffDays, formatDay, type ISODate } from '@/lib/dates'
import { userMessage } from '@/lib/errors'
import { Button, ButtonLink } from '@/ui/Button'
import { Badge } from '@/ui/Controls'
import { Sheet } from '@/ui/Sheet'
import { useToast } from '@/ui/toast-context'
import { useCatalog } from '@/features/library/catalog-context'
import { sessionPath, sessionSummary } from '@/features/training/program-view'
import { programSessionBuilder } from '@/features/workout/build-session'
import { StartWorkoutButton } from '@/features/workout/StartWorkoutButton'
import { historyPath, workoutPath } from '@/features/workout/useWorkouts'
import { itemSubtitle, statusBadge } from './calendar-view'

export interface ProgramItemSheetProps {
  item: ProgramItem
  today: ISODate
  onClose: () => void
}

/** Ce qu'on peut faire d'une séance du programme : la commencer, la passer, voir son bilan. */
export function ProgramItemSheet({ item, today, onClose }: ProgramItemSheetProps) {
  const catalog = useCatalog()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const { program, session, workout, date, status } = item
  const gap = diffDays(date, today)
  const badge = statusBadge(item)
  const open = status === 'planned' || status === 'missed'
  // Faite aujourd'hui, elle compte pour ce jour-là s'il n'est pas trop loin.
  const canStart = open && Math.abs(gap) <= MATCH_DAYS

  const setSkipped = async (skipped: boolean) => {
    setBusy(true)
    try {
      await setProgramSessionSkipped(program, session, date, skipped)
      toast(skipped ? 'Séance passée' : 'Séance remise')
      onClose()
    } catch (error) {
      setBusy(false)
      toast(userMessage(error, 'Enregistrement impossible, réessaie.'), 'error')
    }
  }

  let note: string | null = null
  if (status === 'missed') {
    note = canStart
      ? 'Pas faite ce jour-là. Tu peux encore la rattraper, ou la passer.'
      : 'Pas faite ce jour-là.'
  } else if (status === 'skipped') {
    note = 'Tu l’as passée : elle ne compte pas comme manquée.'
  } else if (status === 'planned' && gap > 0 && canStart) {
    note = 'Faite dès aujourd’hui, elle comptera pour ce jour-là.'
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={session.name}
      footer={
        <div className="flex flex-col gap-2">
          {status === 'active' && workout && (
            <ButtonLink to={workoutPath(workout.id)} block size="lg" icon={<Play size={18} aria-hidden />}>
              Reprendre la séance
            </ButtonLink>
          )}
          {status === 'done' && workout && (
            <ButtonLink to={historyPath(workout.id)} block size="lg">
              Voir le bilan
            </ButtonLink>
          )}
          {canStart && (
            <StartWorkoutButton
              build={programSessionBuilder(program, session, date)}
              block
              size="lg"
              icon={<Play size={18} aria-hidden />}
            >
              {gap === 0
                ? 'Commencer la séance'
                : gap > 0
                  ? 'La faire maintenant'
                  : 'La rattraper maintenant'}
            </StartWorkoutButton>
          )}
          {open && (
            <Button
              variant="secondary"
              block
              size="lg"
              disabled={busy}
              icon={<SkipForward size={18} aria-hidden />}
              onClick={() => void setSkipped(true)}
            >
              Passer cette séance
            </Button>
          )}
          {status === 'skipped' && (
            <Button
              variant="secondary"
              block
              size="lg"
              disabled={busy}
              icon={<Undo2 size={18} aria-hidden />}
              onClick={() => void setSkipped(false)}
            >
              Remettre cette séance
            </Button>
          )}
          <ButtonLink to={sessionPath(program, session)} variant="ghost" block size="lg">
            Voir la séance
          </ButtonLink>
        </div>
      }
    >
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[15px] font-medium text-ink">{capitalize(formatDay(date))}</p>
          {badge && <Badge tone={badge.tone}>{badge.label}</Badge>}
          {isDeloadWeek(program, date) && <Badge tone="success">Semaine allégée</Badge>}
        </div>
        <p className="text-[15px] text-ink-2">{itemSubtitle(item, (s) => sessionSummary(s, catalog.byId))}</p>
        {note && <p className="text-[14px] text-ink-3">{note}</p>}
      </div>
    </Sheet>
  )
}
