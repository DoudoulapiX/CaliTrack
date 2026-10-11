import { act, renderHook } from '@testing-library/react'
import { useSavedNumber } from './useSavedNumber'

/** Un enregistrement que le test termine quand il veut. */
function deferred() {
  let resolve: () => void = () => undefined
  let reject: (error: Error) => void = () => undefined
  const promise = new Promise<void>((ok, fail) => {
    resolve = ok
    reject = fail
  })
  return { promise, resolve, reject }
}

describe('nombre saisi pendant la séance', () => {
  it('garde la frappe affichée tant que la base n’a pas rattrapé', async () => {
    const writes = [deferred(), deferred()]
    let call = 0
    const save = vi.fn(() => writes[call++]!.promise)
    const { result, rerender } = renderHook(({ stored }) => useSavedNumber(stored, save), {
      initialProps: { stored: null as number | null },
    })
    expect(result.current[0]).toBeNull()

    act(() => {
      result.current[1](1)
    })
    act(() => {
      result.current[1](12)
    })
    expect(save).toHaveBeenNthCalledWith(1, 1)
    expect(save).toHaveBeenNthCalledWith(2, 12)
    expect(result.current[0]).toBe(12)

    // Réponse en retard de la base (« 1 ») : la saisie « 12 » reste.
    rerender({ stored: 1 })
    expect(result.current[0]).toBe(12)
    await act(async () => {
      writes[0]!.resolve()
      await writes[0]!.promise
    })
    expect(result.current[0]).toBe(12)

    // Tout est enregistré et relu : la base fait foi, y compris pour un changement venu d'ailleurs.
    await act(async () => {
      writes[1]!.resolve()
      await writes[1]!.promise
    })
    rerender({ stored: 12 })
    expect(result.current[0]).toBe(12)
    rerender({ stored: 20 })
    expect(result.current[0]).toBe(20)
  })

  it('revient à la valeur enregistrée si l’enregistrement échoue', async () => {
    const write = deferred()
    const { result } = renderHook(() => useSavedNumber(8, () => write.promise))
    act(() => {
      result.current[1](9)
    })
    expect(result.current[0]).toBe(9)
    await act(async () => {
      write.reject(new Error('base pleine'))
      await write.promise.catch(() => undefined)
    })
    expect(result.current[0]).toBe(8)
  })
})
