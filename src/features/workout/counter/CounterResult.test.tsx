import { render, screen } from '@testing-library/react'
import type { CounterResult as Result } from '@/content/reps/types'
import { CounterResult, type CounterResultProps } from './CounterResult'
import type { SessionActions } from './useRepSession'

/** Chaque action est une fonction espionne. */
const ACTIONS = new Proxy({} as SessionActions, { get: () => vi.fn() })

const UNSURE: Result = {
  reps: 9,
  doubtful: 2,
  partials: 0,
  rejected: 0,
  confident: false,
  reasons: ['doubtful'],
  endedBy: 'idle',
  repTimes: [],
}

/** Les boutons de moins de 40 px de haut (h-9, size-9 et plus petits). */
function smallButtons(): string[] {
  return screen
    .getAllByRole('button')
    .filter((button) => /(^|\s)(h|size)-[1-9](\s|$)/.test(button.className))
    .map((button) => button.textContent)
}

function renderResult(view: CounterResultProps['view']) {
  return render(<CounterResult view={view} rest={null} actions={ACTIONS} />)
}

describe('CounterResult', () => {
  it('à vérifier : tous les boutons font au moins 40 px, « Ajouter les 2 mouvements » compris', () => {
    renderResult({ kind: 'review', result: UNSURE, reps: 9, addedDoubtful: false })
    expect(screen.getByRole('button', { name: /^Ajouter les 2\smouvements$/ })).toBeInTheDocument()
    expect(smallButtons()).toEqual([])
  })
})
