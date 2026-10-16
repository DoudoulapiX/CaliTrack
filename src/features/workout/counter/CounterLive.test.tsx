import { render, screen } from '@testing-library/react'
import { counterSnapshot } from '@/test/pose'
import { CounterLive, type CounterLiveProps } from './CounterLive'

const SNAPSHOT = counterSnapshot({ status: 'counting', reps: 4 })

function liveProps(patch: Partial<CounterLiveProps> = {}): CounterLiveProps {
  return {
    movement: 'squat',
    phase: 'live',
    cameraState: { kind: 'running' },
    snapshot: SNAPSHOT,
    target: null,
    wakeLockUnavailable: false,
    debug: false,
    onSwitchCamera: vi.fn(),
    onGuide: vi.fn(),
    onToggleDebug: vi.fn(),
    ...patch,
  }
}

/** Le direct, dans le cadre de l'image (positionné). */
function Live(props: CounterLiveProps) {
  return (
    <div className="relative">
      <CounterLive {...props} />
    </div>
  )
}

describe('CounterLive', () => {
  it('pose le grand compte sur un fond sombre, lisible quelle que soit l’image', () => {
    render(<Live {...liveProps()} />)
    const count = screen.getByRole('status', { name: 'Répétitions comptées' })
    expect(count).toHaveTextContent('4 répétitions')
    // Comme la consigne : texte blanc sur noir à 60 %, jamais à même la vidéo.
    expect(count).toHaveClass('bg-black/60', 'text-white')
    expect(screen.getByRole('status', { name: 'Consigne' })).toHaveClass('bg-black/60', 'text-white')
  })

  it('montre « Infos de réglage » enfoncé avec la couleur d’accent, sans les classes de l’état normal', () => {
    const { rerender } = render(<Live {...liveProps()} />)
    const off = screen.getByRole('button', { name: 'Infos de réglage' })
    expect(off).toHaveAttribute('aria-pressed', 'false')
    expect(off).toHaveClass('bg-surface-2', 'text-ink')
    expect(off).not.toHaveClass('bg-accent')

    rerender(<Live {...liveProps({ debug: true })} />)
    const on = screen.getByRole('button', { name: 'Infos de réglage' })
    expect(on).toHaveAttribute('aria-pressed', 'true')
    // Les classes ne se fusionnent pas (cn) : la plus loin dans la feuille de style gagnerait.
    expect(on).toHaveClass('bg-accent', 'text-accent-ink')
    expect(on).not.toHaveClass('bg-surface-2')
    expect(on).not.toHaveClass('text-ink')
  })
})
