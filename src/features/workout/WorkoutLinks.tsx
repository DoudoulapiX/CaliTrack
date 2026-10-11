import { History, Plus, Trophy } from 'lucide-react'
import { freeWorkout } from '@/content/workouts/workout'
import { nowISO, today } from '@/lib/dates'
import { newId } from '@/lib/ids'
import { ListGroup, ListRow } from '@/ui/List'
import { StartConflictSheet } from './StartConflictSheet'
import { useStartWorkout } from './useStartWorkout'

/** Séance libre, historique et records, sur l'onglet Entraînement. */
export function WorkoutLinks() {
  const starter = useStartWorkout()
  return (
    <>
      <ListGroup>
        <ListRow
          title="Séance libre"
          subtitle="Sans programme : ajoute les exercices en route"
          leading={<Plus size={20} aria-hidden />}
          onClick={() => {
            if (!starter.busy) starter.start(() => freeWorkout({ date: today(), now: nowISO(), newId }))
          }}
        />
        <ListRow title="Historique" leading={<History size={20} aria-hidden />} to="/training/history" />
        <ListRow title="Records" leading={<Trophy size={20} aria-hidden />} to="/training/records" />
      </ListGroup>
      <StartConflictSheet
        conflict={starter.conflict}
        onResume={starter.resume}
        onReplace={starter.replace}
        onClose={starter.dismiss}
      />
    </>
  )
}
