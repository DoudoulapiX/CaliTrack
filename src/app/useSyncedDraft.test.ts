import { act, renderHook } from '@testing-library/react'
import { mergeUntouched, useSyncedDraft } from './useSyncedDraft'

interface Form {
  name: string
  level: string
  days: number[]
}

describe('brouillon synchronisé', () => {
  it('ne garde que les champs modifiés', () => {
    const base: Form = { name: 'A', level: 'débutant', days: [1] }
    const draft: Form = { ...base, name: 'Charles' }
    const saved: Form = { name: 'A', level: 'avancé', days: [1, 3] }
    expect(mergeUntouched(draft, base, saved)).toEqual({ name: 'Charles', level: 'avancé', days: [1, 3] })
  })

  it('suit les données enregistrées sans perdre la saisie', () => {
    const first: Form = { name: '', level: 'débutant', days: [1] }
    const { result, rerender } = renderHook(({ saved }) => useSyncedDraft(saved), {
      initialProps: { saved: first },
    })
    act(() => {
      result.current[1]((draft) => ({ ...draft, name: 'Charles' }))
    })
    rerender({ saved: { ...first, level: 'avancé' } })
    expect(result.current[0]).toEqual({ name: 'Charles', level: 'avancé', days: [1] })

    // Même référence : rien ne bouge.
    const [before] = result.current
    rerender({ saved: { ...first, level: 'avancé' } })
    expect(result.current[0]).toEqual(before)
  })
})
