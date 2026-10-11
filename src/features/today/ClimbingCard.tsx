import { Mountain, Play } from 'lucide-react'
import { periodSummary, summarize } from '@/content/climbing/stats'
import { formatTimeOf, type ISODate } from '@/lib/dates'
import { frenchSpacing, lowerFirst } from '@/lib/typography'
import { Button, ButtonLink } from '@/ui/Button'
import { Card } from '@/ui/Card'
import { Section } from '@/ui/Page'
import { climbLivePath, climbSubtitle, periodStart, sendsLine } from '@/features/climbing/climb-view'
import { useClimbs } from '@/features/climbing/useClimbing'
import { useStartClimb } from '@/features/climbing/useStartClimb'
import { dayLabel } from '@/features/goals/goal-view'
import { StatTiles } from '@/features/workout/StatTiles'
import { SectionLink } from './SectionLink'

function ClimbIcon() {
  return (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-info/15 text-info">
      <Mountain size={20} aria-hidden />
    </span>
  )
}

/**
 * L'escalade : la séance en cours à reprendre, sinon la dernière séance, les chiffres du mois et de
 * quoi en commencer une (mise en avant les jours d'escalade prévus).
 */
export function ClimbingCard({ planned, day }: { planned: boolean; day: ISODate }) {
  const climbs = useClimbs()
  const { start, busy } = useStartClimb()
  if (!climbs) return null
  const active = climbs.find((session) => session.status === 'active') ?? null
  const done = climbs.filter((session) => session.status === 'done')
  // La plus récente d'abord.
  const last = done[0] ?? null
  const month = periodSummary(done, periodStart('30', day))

  return (
    <Section
      title="Escalade"
      action={
        <SectionLink to="/climbing" label="Tout voir de l’escalade">
          Tout voir
        </SectionLink>
      }
    >
      {active ? (
        <Card className="flex items-center gap-3">
          <ClimbIcon />
          <div className="min-w-0 flex-1">
            <p className="text-[16px] font-semibold text-ink">Séance en cours</p>
            <p className="text-[13px] text-ink-3">
              Depuis {formatTimeOf(active.startedAt)} · {sendsLine(summarize(active.boulders, null))}
            </p>
          </div>
          <ButtonLink to={climbLivePath(active.id)} size="sm" icon={<Play size={16} aria-hidden />}>
            Reprendre
          </ButtonLink>
        </Card>
      ) : (
        <Card>
          <div className="flex items-start gap-3">
            <ClimbIcon />
            <div className="min-w-0 flex-1">
              <p className="text-[16px] font-semibold text-ink">
                {planned ? 'Escalade prévue aujourd’hui' : last ? 'Dernière séance' : 'Pas encore de séance'}
              </p>
              <p className="mt-0.5 text-[13px] text-ink-3">
                {last === null
                  ? 'À la salle, note chaque bloc par sa couleur.'
                  : planned
                    ? frenchSpacing(`Dernière séance : ${lowerFirst(dayLabel(last.date, day))}`)
                    : `${dayLabel(last.date, day)} · ${climbSubtitle(last)}`}
              </p>
            </div>
          </div>
          {month.sessions > 0 && (
            <>
              <p className="mt-4 px-1 text-[13px] font-medium text-ink-3">30 derniers jours</p>
              <StatTiles
                className="mt-2"
                items={[
                  { label: 'Séances', value: String(month.sessions) },
                  { label: 'Blocs réussis', value: String(month.sends) },
                ]}
              />
            </>
          )}
          <Button
            block
            variant={planned ? 'primary' : 'secondary'}
            className="mt-4"
            disabled={busy}
            icon={<Play size={18} aria-hidden />}
            onClick={start}
          >
            Commencer une séance
          </Button>
        </Card>
      )}
    </Section>
  )
}
