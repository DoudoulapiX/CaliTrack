import { useState } from 'react'
import { BarChart3, History, Mountain, Palette, Play, Plus } from 'lucide-react'
import { useSettings } from '@/app/data-context'
import { fontOf } from '@/content/climbing/labels'
import {
  bestSend,
  flashRate,
  gradeStats,
  periodSummary,
  pyramid,
  sessionsSince,
  summarize,
  type BestSend,
} from '@/content/climbing/stats'
import type { ClimbingSession, GradeScale } from '@/db/types'
import { capitalize, formatDay, formatTimeOf, today as todayISO } from '@/lib/dates'
import { frenchSpacing } from '@/lib/typography'
import { Button, ButtonLink } from '@/ui/Button'
import { Card } from '@/ui/Card'
import { EmptyState } from '@/ui/Controls'
import { ListGroup, ListRow } from '@/ui/List'
import { Page, Section } from '@/ui/Page'
import { PageSpinner } from '@/ui/PageSpinner'
import { StatTiles } from '@/features/workout/StatTiles'
import { Pyramid } from './ClimbCharts'
import {
  climbHistoryPath,
  climbLivePath,
  climbSubtitle,
  formatMinutes,
  formatPercent,
  periodStart,
  sendsLine,
} from './climb-view'
import { GradeSwatch } from './GradeSwatch'
import { PastClimbSheet } from './PastClimbSheet'
import { activeScaleOf, useClimbs, useGradeScales } from './useClimbing'
import { useStartClimb } from './useStartClimb'

const RECENT_SESSIONS = 5

/** La séance en cours, ou de quoi en commencer une. */
function StartCard({ active, onPast }: { active: ClimbingSession | null; onPast: () => void }) {
  const { start, busy } = useStartClimb()
  if (active) {
    return (
      <Card className="mb-6 flex items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-info/15 text-info">
          <Mountain size={22} aria-hidden />
        </span>
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
    )
  }
  return (
    <div className="mb-6 flex flex-col gap-2">
      <Button block size="lg" disabled={busy} icon={<Play size={18} aria-hidden />} onClick={start}>
        Commencer une séance
      </Button>
      <Button variant="secondary" block icon={<Plus size={18} aria-hidden />} onClick={onPast}>
        Noter une séance passée
      </Button>
    </div>
  )
}

function BestRow({ title, best }: { title: string; best: BestSend }) {
  const font = fontOf(best.grade)
  return (
    <ListRow
      leading={<GradeSwatch color={best.grade.color} />}
      title={font ? `${best.grade.label} · ${font}` : best.grade.label}
      subtitle={`${title}, depuis le ${formatDay(best.date, 'd MMMM yyyy')}`}
      to={climbHistoryPath(best.sessionId)}
    />
  )
}

function Overview({ climbs, scale }: { climbs: readonly ClimbingSession[]; scale: GradeScale | null }) {
  const day = todayISO()
  const recent = periodSummary(climbs, periodStart('30', day))
  const rate = flashRate(recent)
  const best = scale ? bestSend(climbs, scale) : null
  const bestFlash = scale ? bestSend(climbs, scale, true) : null
  const rows = scale ? pyramid(gradeStats(sessionsSince(climbs, periodStart('90', day)), scale)) : []

  return (
    <>
      <Section title="30 derniers jours">
        <StatTiles
          items={[
            { label: 'Séances', value: String(recent.sessions) },
            { label: 'Blocs réussis', value: String(recent.sends) },
            { label: 'Temps grimpé', value: recent.minutes > 0 ? formatMinutes(recent.minutes) : '—' },
            { label: 'Flash', value: rate === null ? '—' : formatPercent(rate) },
          ]}
        />
      </Section>

      {best && (
        <Section title={scale ? `Ton niveau · ${scale.name}` : 'Ton niveau'}>
          <ListGroup>
            <BestRow title="Bloc le plus dur réussi" best={best} />
            {bestFlash && <BestRow title="Flash le plus dur" best={bestFlash} />}
          </ListGroup>
        </Section>
      )}

      {rows.length > 0 && (
        <Section title="Pyramide · 3 derniers mois">
          <Pyramid rows={rows} />
        </Section>
      )}
    </>
  )
}

/** Onglet Escalade : séance en cours ou à commencer, niveau, pyramide et dernières séances. */
export function ClimbingPage() {
  const settings = useSettings()
  const climbs = useClimbs()
  const scales = useGradeScales()
  const [past, setPast] = useState(false)
  if (!climbs || !scales) return <PageSpinner />
  const scale = activeScaleOf(scales, settings)
  const active = climbs.find((c) => c.status === 'active') ?? null
  const done = climbs.filter((c) => c.status === 'done')

  return (
    <Page title="Escalade">
      <StartCard
        active={active}
        onPast={() => {
          setPast(true)
        }}
      />

      {climbs.length === 0 ? (
        <EmptyState
          icon={<Mountain size={32} aria-hidden />}
          title="Note ta première séance"
          text="À la salle, touche la couleur de chaque bloc tenté, réussi ou pas. Ton niveau et ta progression s’affichent ici."
        />
      ) : (
        <Overview climbs={climbs} scale={scale} />
      )}

      {done.length > 0 && (
        <Section title="Dernières séances">
          <ListGroup>
            {done.slice(0, RECENT_SESSIONS).map((session) => (
              <ListRow
                key={session.id}
                title={capitalize(formatDay(session.date))}
                subtitle={climbSubtitle(session)}
                to={climbHistoryPath(session.id)}
              />
            ))}
          </ListGroup>
        </Section>
      )}

      <Section>
        <ListGroup>
          {done.length > 0 && (
            <ListRow
              leading={<History size={20} aria-hidden />}
              title="Toutes les séances"
              trailing={String(done.length)}
              to="/climbing/history"
            />
          )}
          {done.length > 0 && (
            <ListRow
              leading={<BarChart3 size={20} aria-hidden />}
              title="Statistiques"
              to="/climbing/stats"
            />
          )}
          <ListRow
            leading={<Palette size={20} aria-hidden />}
            title="Couleurs et cotations"
            subtitle={scale ? frenchSpacing(`Échelle des nouvelles séances : ${scale.name}`) : undefined}
            to="/climbing/grades"
          />
        </ListGroup>
      </Section>

      {past && (
        <PastClimbSheet
          onClose={() => {
            setPast(false)
          }}
        />
      )}
    </Page>
  )
}
