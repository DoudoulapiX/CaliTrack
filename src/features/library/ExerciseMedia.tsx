import { useMemo, useState } from 'react'
import { Pause, Play } from 'lucide-react'
import type { Exercise } from '@/db/types'
import { figureFor } from '@/content/figures/library'
import { renderFigureSvg } from '@/content/figures/render'
import type { FigureAnim } from '@/content/figures/engine'
import { exerciseImageUrl } from '@/content/exercises/media'
import { cn } from '@/lib/cn'
import { prefersReducedMotion } from '@/lib/motion'
import { IconButton } from '@/ui/Button'
import { Segmented } from '@/ui/Controls'

function FigureView({ anim, playing, name }: { anim: FigureAnim; playing: boolean; name: string }) {
  const svg = useMemo(
    () => renderFigureSvg(anim, { animate: playing, title: `Animation : ${name}` }),
    [anim, playing, name],
  )
  return (
    <div
      className="mx-auto aspect-[5/4] w-full max-w-sm p-3 text-ink [&>svg]:size-full"
      // SVG généré par notre code ; le titre est nettoyé par renderFigureSvg.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}

function PhotoFlip({ frames, playing, name }: { frames: readonly string[]; playing: boolean; name: string }) {
  const [first, second] = frames
  if (!first) return null
  return (
    <div className="relative mx-auto aspect-[3/2] w-full max-w-md bg-white">
      <img
        src={exerciseImageUrl(first)}
        alt={`${name} : position de départ`}
        className="absolute inset-0 size-full object-contain"
      />
      {second && (
        <img
          src={exerciseImageUrl(second)}
          alt={`${name} : position d’arrivée`}
          className={cn('absolute inset-0 size-full object-contain', playing ? 'ct-flip' : 'opacity-0')}
        />
      )}
    </div>
  )
}

/** Démonstration d'un exercice : silhouette animée et/ou photos qui alternent. */
export function ExerciseMedia({ exercise }: { exercise: Pick<Exercise, 'name' | 'figure' | 'frames'> }) {
  const anim = figureFor(exercise.figure)
  const hasPhotos = exercise.frames.length > 0
  const [view, setView] = useState<'figure' | 'photos'>(anim ? 'figure' : 'photos')
  const [playing, setPlaying] = useState(() => !prefersReducedMotion())
  if (!anim && !hasPhotos) return null
  const showFigure = view === 'figure' && anim !== undefined

  return (
    <div className="mb-5">
      <div className="relative overflow-hidden rounded-2xl bg-surface">
        {showFigure ? (
          <FigureView anim={anim} playing={playing} name={exercise.name} />
        ) : (
          <PhotoFlip frames={exercise.frames} playing={playing} name={exercise.name} />
        )}
        <IconButton
          label={playing ? 'Mettre l’animation en pause' : 'Lancer l’animation'}
          variant="filled"
          size="sm"
          className="absolute right-2 bottom-2 shadow"
          onClick={() => {
            setPlaying((p) => !p)
          }}
        >
          {playing ? <Pause size={16} aria-hidden /> : <Play size={16} aria-hidden />}
        </IconButton>
      </div>
      {anim && hasPhotos && (
        <Segmented
          label="Démonstration"
          className="mt-2"
          value={view}
          onChange={setView}
          options={[
            { value: 'figure', label: 'Animation' },
            { value: 'photos', label: 'Photos' },
          ]}
        />
      )}
    </div>
  )
}
