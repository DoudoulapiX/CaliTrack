import { useState } from 'react'
import { BarChart3 } from 'lucide-react'
import { useSettings } from '@/app/data-context'
import { useGoBack } from '@/app/useGoBack'
import { fontOf, STYLE_LABEL } from '@/content/climbing/labels'
import {
  flashRate,
  gradeStats,
  monthlyStats,
  periodSummary,
  pyramid,
  sessionColumns,
  sessionsSince,
  styleStats,
  type GradeStats,
} from '@/content/climbing/stats'
import { capitalize, formatMonth, today as todayISO } from '@/lib/dates'
import { formatNumber } from '@/lib/units'
import { ChoiceChips, EmptyState, Segmented } from '@/ui/Controls'
import { ListGroup, ListRow } from '@/ui/List'
import { Page, Section } from '@/ui/Page'
import { PageSpinner } from '@/ui/PageSpinner'
import { StatTiles } from '@/features/workout/StatTiles'
import { Pyramid, SessionChart } from './ClimbCharts'
import { formatMinutes, formatPercent, PERIOD_OPTIONS, periodStart, type StatsPeriod } from './climb-view'
import { GradeSwatch } from './GradeSwatch'
import { useClimbs, useGradeScales } from './useClimbing'

/** Séances montrées au plus dans le graphique séance par séance. */
const CHART_SESSIONS = 12

/** « 5 réussis sur 8 · 2 flash · 2,4 essais par bloc réussi ». */
function gradeLine(row: GradeStats): string {
  const parts = [`${String(row.sends)} réussi${row.sends > 1 ? 's' : ''} sur ${String(row.tries)}`]
  if (row.flashes > 0) parts.push(`${String(row.flashes)} flash`)
  if (row.sends > 0) {
    const average = row.sendAttempts / row.sends
    parts.push(
      `${formatNumber(Math.round(average * 10) / 10, 1)} essai${average >= 2 ? 's' : ''} par bloc réussi`,
    )
  }
  return parts.join(' · ')
}

/** Statistiques détaillées : séance par séance, pyramide, réussite par niveau, mois par mois, styles. */
export function ClimbStatsPage() {
  const settings = useSettings()
  const climbs = useClimbs()
  const scales = useGradeScales()
  const goBack = useGoBack('/climbing')
  const [period, setPeriod] = useState<StatsPeriod>('90')
  const [scaleId, setScaleId] = useState<string | null>(null)
  if (!climbs || !scales) return <PageSpinner />

  const inPeriod = sessionsSince(climbs, periodStart(period, todayISO()))
  // Les niveaux ne se comparent que dans une même échelle : on choisit laquelle regarder.
  const used = scales.filter((scale) => climbs.some((c) => c.scaleId === scale.id))
  const scale =
    used.find((s) => s.id === scaleId) ??
    used.find((s) => s.id === settings.activeGradeScaleId) ??
    used[0] ??
    null
  const scaled = scale ? inPeriod.filter((c) => c.scaleId === scale.id) : []
  const summary = periodSummary(inPeriod, null)
  const rate = flashRate(summary)
  const stats = scale ? gradeStats(scaled, scale) : []
  const rows = pyramid(stats)
  const tried = stats.filter((row) => row.tries > 0).reverse()
  const columns = scale ? sessionColumns(scaled, scale, CHART_SESSIONS) : []
  const months = scale ? monthlyStats(scaled, scale) : []
  const styles = styleStats(inPeriod)

  return (
    <Page title="Statistiques" back onBack={goBack} backLabel="Escalade" large>
      <Segmented
        label="Période"
        value={period}
        options={PERIOD_OPTIONS}
        onChange={setPeriod}
        className="mb-3"
      />
      {used.length > 1 && scale && (
        <ChoiceChips
          label="Cotation"
          value={scale.id}
          onChange={setScaleId}
          options={used.map((s) => ({ value: s.id, label: s.name }))}
          className="mb-3"
        />
      )}

      {inPeriod.length === 0 ? (
        <div className="mt-3">
          <EmptyState
            icon={<BarChart3 size={32} aria-hidden />}
            title="Aucune séance sur cette période"
            text="Choisis une période plus longue, ou note une séance."
          />
        </div>
      ) : (
        <>
          <StatTiles
            className="mt-3 mb-6"
            items={[
              { label: 'Séances', value: String(summary.sessions) },
              {
                label: 'Blocs réussis',
                value:
                  summary.sends === summary.boulders
                    ? String(summary.sends)
                    : `${String(summary.sends)} sur ${String(summary.boulders)}`,
              },
              { label: 'Temps grimpé', value: summary.minutes > 0 ? formatMinutes(summary.minutes) : '—' },
              { label: 'Flash', value: rate === null ? '—' : formatPercent(rate) },
            ]}
          />

          {columns.length > 0 && (
            <Section title="Séance par séance">
              <SessionChart columns={columns} />
            </Section>
          )}

          {rows.length > 0 && (
            <Section title="Pyramide">
              <Pyramid rows={rows} />
            </Section>
          )}

          {tried.length > 0 && (
            <Section title="Réussite par niveau">
              <ListGroup>
                {tried.map((row) => {
                  const font = fontOf(row.grade)
                  return (
                    <ListRow
                      key={row.grade.key}
                      leading={<GradeSwatch color={row.grade.color} />}
                      title={font ? `${row.grade.label} · ${font}` : row.grade.label}
                      subtitle={gradeLine(row)}
                      trailing={formatPercent(row.sends / row.tries)}
                    />
                  )
                })}
              </ListGroup>
            </Section>
          )}

          {months.length > 0 && (
            <Section title="Mois par mois">
              <ListGroup>
                {months.map((month) => (
                  <ListRow
                    key={month.key}
                    title={capitalize(formatMonth(month.year, month.monthIndex))}
                    subtitle={`${String(month.sessions)} séance${month.sessions > 1 ? 's' : ''} · ${String(month.sends)} bloc${month.sends > 1 ? 's' : ''} réussi${month.sends > 1 ? 's' : ''}`}
                    trailing={
                      month.hardest && (
                        <>
                          <GradeSwatch color={month.hardest.color} size="sm" />
                          <span className="sr-only">Meilleur bloc&nbsp;:</span>
                          {month.hardest.label}
                        </>
                      )
                    }
                  />
                ))}
              </ListGroup>
            </Section>
          )}

          {styles.length > 0 && (
            <Section title="Styles">
              <ListGroup>
                {styles.map((row) => (
                  <ListRow
                    key={row.style}
                    title={STYLE_LABEL[row.style]}
                    subtitle={`${String(row.sends)} réussi${row.sends > 1 ? 's' : ''} sur ${String(row.tries)}`}
                    trailing={formatPercent(row.sends / row.tries)}
                  />
                ))}
              </ListGroup>
            </Section>
          )}
        </>
      )}
    </Page>
  )
}
