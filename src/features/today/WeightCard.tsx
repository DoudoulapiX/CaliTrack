import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useProfile, useSettings } from '@/app/data-context'
import { addDaysISO, type ISODate } from '@/lib/dates'
import { formatBodyWeight } from '@/lib/units'
import { Button } from '@/ui/Button'
import { Card } from '@/ui/Card'
import { Section } from '@/ui/Page'
import { useBodyMetrics } from '@/features/goals/useGoals'
import { WeightSheet } from '@/features/goals/WeightSheet'
import { sparklinePoints, trendLine, weighInsOf, weightSource, weightTrend } from './today-view'

/** Jours montrés par la courbe et l'évolution. */
const TREND_DAYS = 30
const SPARK_WIDTH = 100
const SPARK_HEIGHT = 32

/** Le poids : dernière pesée, évolution du mois en chiffres et en petite courbe, et de quoi se peser. */
export function WeightCard({ day }: { day: ISODate }) {
  const metrics = useBodyMetrics()
  const profile = useProfile()
  const { weightUnit: unit } = useSettings()
  const [logging, setLogging] = useState(false)
  if (!metrics) return null
  const points = weighInsOf(metrics)
  const last = points.at(-1) ?? null
  const current = last?.kg ?? profile.weightKg
  const trend = weightTrend(points, day, TREND_DAYS)
  const line = sparklinePoints(points, addDaysISO(day, -TREND_DAYS), day, SPARK_WIDTH, SPARK_HEIGHT)

  return (
    <Section title="Poids">
      <Card>
        <div className="flex items-center gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-[28px] leading-tight font-bold text-ink tabular">
              {current === null ? '—' : formatBodyWeight(current, unit)}
            </p>
            <p className="mt-0.5 text-[13px] text-ink-3">{weightSource(last, profile.weightKg, day)}</p>
            {trend && (
              <p className="mt-1 text-[14px] font-medium text-ink-2">{trendLine(trend, unit, day)}</p>
            )}
          </div>
          {line && (
            <svg
              viewBox={`-3 -3 ${String(SPARK_WIDTH + 6)} ${String(SPARK_HEIGHT + 6)}`}
              className="h-12 w-28 shrink-0 text-accent"
              aria-hidden
            >
              <polyline
                points={line}
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          )}
        </div>
        <Button
          block
          variant="secondary"
          className="mt-4"
          icon={<Plus size={18} aria-hidden />}
          onClick={() => {
            setLogging(true)
          }}
        >
          Noter mon poids
        </Button>
      </Card>
      {logging && (
        <WeightSheet
          lastKg={current}
          onClose={() => {
            setLogging(false)
          }}
        />
      )}
    </Section>
  )
}
