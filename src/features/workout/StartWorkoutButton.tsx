import type { Workout } from '@/db/types'
import { Button, type ButtonProps } from '@/ui/Button'
import { StartConflictSheet } from './StartConflictSheet'
import { useStartWorkout } from './useStartWorkout'

export interface StartWorkoutButtonProps extends Omit<ButtonProps, 'onClick'> {
  /** Prépare la séance au moment où on la commence. */
  build: () => Workout
}

/** Bouton qui commence une séance et ouvre son écran (ou propose de reprendre celle en cours). */
export function StartWorkoutButton({ build, disabled, children, ...rest }: StartWorkoutButtonProps) {
  const starter = useStartWorkout()
  return (
    <>
      <Button
        {...rest}
        disabled={disabled === true || starter.busy}
        onClick={() => {
          starter.start(build)
        }}
      >
        {children}
      </Button>
      <StartConflictSheet
        conflict={starter.conflict}
        onResume={starter.resume}
        onReplace={starter.replace}
        onClose={starter.dismiss}
      />
    </>
  )
}
