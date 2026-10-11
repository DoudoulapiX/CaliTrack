import type { EquipmentKind, LevelTest } from '@/db/types'
import { EQUIPMENT_LABEL } from '@/content/equipment'
import {
  LEVEL_TEST_INTRO,
  LEVEL_TEST_ITEMS,
  formatTestValue,
  itemLevel,
  overallLevel,
  type LevelTestValues,
} from '@/content/level-test'
import { EXPERIENCE_LABEL } from '@/content/profile'
import { formatDay } from '@/lib/dates'
import { frenchSpacing } from '@/lib/typography'
import { Card } from '@/ui/Card'
import { Badge } from '@/ui/Controls'
import { NumberField } from '@/ui/Field'

export interface LevelTestFormProps {
  values: LevelTestValues
  onChange: (values: LevelTestValues) => void
  /** Matériel disponible : signale les tests impossibles sans lui. */
  available?: ReadonlySet<EquipmentKind>
  /** Test précédent, rappelé dans chaque champ. */
  previous?: LevelTest | null
}

export function LevelTestForm({ values, onChange, available, previous }: LevelTestFormProps) {
  return (
    <div className="flex flex-col gap-4">
      <p className="px-1 text-[15px] text-ink-2">{LEVEL_TEST_INTRO}</p>
      {LEVEL_TEST_ITEMS.map((item) => {
        const missing = item.needs !== null && available !== undefined && !available.has(item.needs)
        const before = previous?.[item.key] ?? null
        return (
          <NumberField
            key={item.key}
            label={item.label}
            value={values[item.key]}
            min={0}
            max={item.max}
            suffix={item.unit === 'sec' ? 's' : 'rép.'}
            placeholder={before === null ? '' : frenchSpacing(`Avant : ${before}`)}
            hint={
              missing && item.needs
                ? frenchSpacing(`${item.how} Il te faut : ${EQUIPMENT_LABEL[item.needs].toLowerCase()}.`)
                : item.how
            }
            onChange={(value) => {
              onChange({ ...values, [item.key]: value })
            }}
          />
        )
      })}
    </div>
  )
}

/** Niveau estimé d'après les tests remplis, avec le détail de chaque test. */
export function LevelTestResult({ values, date }: { values: LevelTestValues; date?: string }) {
  const level = overallLevel(values)
  if (!level) return null
  const done = LEVEL_TEST_ITEMS.flatMap((item) => {
    const value = values[item.key]
    return value === null ? [] : [{ item, value }]
  })
  return (
    <Card>
      <p className="text-[13px] text-ink-3">
        {date ? `Test du ${formatDay(date, 'd MMMM yyyy')}` : 'Niveau estimé'}
      </p>
      <p className="text-[22px] font-bold text-ink" aria-live="polite">
        {EXPERIENCE_LABEL[level]}
      </p>
      <ul className="mt-3 flex flex-col gap-2">
        {done.map(({ item, value }) => (
          <li key={item.key} className="flex items-center justify-between gap-3 text-[15px]">
            <span className="text-ink">
              {item.label}
              <span className="text-ink-3"> · {formatTestValue(item, value)}</span>
            </span>
            <Badge>{EXPERIENCE_LABEL[itemLevel(item, value)]}</Badge>
          </li>
        ))}
      </ul>
    </Card>
  )
}
