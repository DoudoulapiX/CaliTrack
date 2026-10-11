import { boulderLine, STYLE_LABEL } from '@/content/climbing/labels'
import type { BoulderAttempt, GradeScale } from '@/db/types'
import { formatTimeOf } from '@/lib/dates'
import { ListGroup, ListRow } from '@/ui/List'
import { shownGrade } from './climb-view'
import { GradeSwatch } from './GradeSwatch'

export interface BoulderListProps {
  boulders: readonly BoulderAttempt[]
  scale: GradeScale | null
  /** Heure de chaque bloc (séance suivie en direct). */
  showTime: boolean
  /** Touche d'un bloc pour le modifier (rien : liste en lecture seule). */
  onSelect?: (boulder: BoulderAttempt) => void
}

/** Les blocs d'une séance, le dernier noté en haut. */
export function BoulderList({ boulders, scale, showTime, onSelect }: BoulderListProps) {
  return (
    <ListGroup>
      {[...boulders].reverse().map((boulder) => {
        const grade = shownGrade(scale, boulder.gradeKey)
        const details = [boulderLine(boulder), ...boulder.styles.map((s) => STYLE_LABEL[s]), boulder.note]
          .filter(Boolean)
          .join(' · ')
        return (
          <ListRow
            key={boulder.id}
            leading={<GradeSwatch color={grade.color} />}
            title={grade.label}
            subtitle={details}
            trailing={showTime ? formatTimeOf(boulder.createdAt) : undefined}
            onClick={
              onSelect
                ? () => {
                    onSelect(boulder)
                  }
                : undefined
            }
          />
        )
      })}
    </ListGroup>
  )
}
