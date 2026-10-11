import { Link } from 'react-router'
import type { TargetsResult } from '@/content/nutrition/targets'
import type { Nutrients } from '@/db/types'
import { cn } from '@/lib/cn'
import { formatNumber } from '@/lib/units'
import { ProgressBar } from '@/ui/Controls'
import { formatKcal, macroLine, macroRows, missingLine, remainingLine } from './nutrition-view'

const MACRO_COLOR = {
  protein: 'var(--ct-macro-protein)',
  carbs: 'var(--ct-macro-carbs)',
  fat: 'var(--ct-macro-fat)',
} as const

/** Les calories du jour face à l'objectif, puis les protéines, glucides et lipides. */
export function DaySummary({ eaten, targets }: { eaten: Nutrients; targets: TargetsResult }) {
  if (!targets.ok) {
    return (
      <div>
        <p className="text-[28px] leading-tight font-bold text-ink tabular">{formatKcal(eaten.kcal)}</p>
        <p className="mt-1 text-[14px] text-ink-2">
          {missingLine(targets.missing)}{' '}
          <Link to="/more/profile" className="font-medium text-accent-text">
            Compléter mon profil
          </Link>
        </p>
      </div>
    )
  }
  const goal = targets.targets
  const remaining = remainingLine(eaten.kcal, goal.kcal)
  const percent = goal.kcal > 0 ? (eaten.kcal / goal.kcal) * 100 : 0
  return (
    <div>
      <div className="flex items-baseline gap-2">
        <p className="text-[28px] leading-tight font-bold text-ink tabular">
          {formatNumber(Math.round(eaten.kcal))}
        </p>
        <p className="text-[15px] text-ink-3">sur {formatKcal(goal.kcal)}</p>
      </div>
      <ProgressBar
        value={percent}
        label="Calories du jour"
        className="mt-2"
        color={remaining.over ? 'var(--ct-warning)' : undefined}
      />
      <p className={cn('mt-1.5 text-[14px] font-medium', remaining.over ? 'text-warning' : 'text-ink-2')}>
        {remaining.text}
      </p>
      <ul className="mt-4 grid grid-cols-3 gap-3">
        {macroRows(eaten, goal).map((row) => (
          <li key={row.key} className="min-w-0">
            <p className="text-[13px] font-medium text-ink-2">{row.label}</p>
            <p className="text-[14px] text-ink tabular">{macroLine(row.eaten, row.target)}</p>
            <ProgressBar
              value={row.percent}
              label={row.label}
              size="sm"
              className="mt-1"
              color={MACRO_COLOR[row.key]}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}
