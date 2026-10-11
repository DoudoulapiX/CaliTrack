import { Dumbbell } from 'lucide-react'
import type { Exercise } from '@/db/types'
import { exerciseImageUrl, figureThumbSvg } from '@/content/exercises/media'
import { cn } from '@/lib/cn'

/** Petite image d'un exercice : silhouette CaliTrack, sinon photo, sinon icône. */
export function ExerciseThumb({
  exercise,
  className,
}: {
  exercise: Pick<Exercise, 'figure' | 'frames'>
  className?: string
}) {
  const box = cn('size-12 shrink-0 overflow-hidden rounded-xl', className)
  const svg = figureThumbSvg(exercise.figure)
  if (svg) {
    return (
      <span
        aria-hidden
        className={cn(box, 'bg-surface-2 p-0.5 text-ink [&>svg]:size-full')}
        // SVG généré par notre propre code à partir de nombres : aucun texte saisi par l'utilisateur.
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    )
  }
  const frame = exercise.frames[0]
  if (frame) {
    return (
      <img
        src={exerciseImageUrl(frame)}
        alt=""
        loading="lazy"
        decoding="async"
        width={48}
        height={48}
        className={cn(box, 'bg-white object-cover')}
      />
    )
  }
  return (
    <span aria-hidden className={cn(box, 'flex items-center justify-center bg-surface-2 text-ink-3')}>
      <Dumbbell size={20} />
    </span>
  )
}
