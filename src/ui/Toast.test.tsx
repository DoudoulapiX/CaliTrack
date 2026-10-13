import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from './Toast'
import { useToast } from './toast-context'

function ShowButton({ message, tone }: { message: string; tone?: 'success' | 'info' | 'error' }) {
  const toast = useToast()
  return (
    <button type="button" onClick={() => toast(message, tone)}>
      Afficher
    </button>
  )
}

describe('messages éphémères', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('s’effacent seuls, plus tard pour une erreur', () => {
    vi.useFakeTimers()
    render(
      <ToastProvider>
        <ShowButton message="Enregistré" />
        <ShowButton message="Échec" tone="error" />
      </ToastProvider>,
    )
    const [success, error] = screen.getAllByRole('button', { name: 'Afficher' })
    act(() => {
      success?.click()
      error?.click()
    })
    expect(screen.getByRole('status')).toHaveTextContent('Enregistré')
    expect(screen.getByRole('status')).toHaveTextContent('Échec')

    act(() => {
      vi.advanceTimersByTime(2800)
    })
    expect(screen.getByRole('status')).not.toHaveTextContent('Enregistré')
    expect(screen.getByRole('status')).toHaveTextContent('Échec')

    act(() => {
      vi.advanceTimersByTime(2200)
    })
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('ne laissent aucune minuterie en cours une fois l’appli fermée', () => {
    vi.useFakeTimers()
    const { unmount } = render(
      <ToastProvider>
        <ShowButton message="Enregistré" />
      </ToastProvider>,
    )
    act(() => {
      screen.getByRole('button', { name: 'Afficher' }).click()
    })
    expect(vi.getTimerCount()).toBe(1)

    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
