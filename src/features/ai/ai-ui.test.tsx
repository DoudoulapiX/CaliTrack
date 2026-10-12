import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { DataProvider } from '@/app/DataProvider'
import { db } from '@/db/db'
import { updateSettings } from '@/db/settings'
import { resetDb } from '@/test/db'
import { expectFrenchSpacing } from '@/test/typography'
import { aiUsageRow } from '@/test/fixtures'
import { AiProblemNote } from './AiProblemNote'
import { recordCallUsage } from './ai-usage'
import { CostHint } from './CostHint'
import { KeyNeeded } from './KeyNeeded'
import { useAbortable, type Abortable } from './useAbortable'

/** Affiche un élément avec la base et le routeur de l'appli (les réglages de l'IA à leur adresse). */
async function show(element: ReactNode) {
  await resetDb()
  const router = createMemoryRouter([
    { path: '/', element },
    { path: '/more/ai', element: <h1>Réglages de l’IA</h1> },
  ])
  render(
    <DataProvider>
      <RouterProvider router={router} />
    </DataProvider>,
  )
  return { router, user: userEvent.setup() }
}

describe('briques du coach IA', () => {
  it('annonce le prix d’une demande avec le modèle choisi', async () => {
    await show(<CostHint action="daily" />)
    expect(await screen.findByText('Environ 8 centimes avec Opus 5.5')).toBeInTheDocument()
    await act(async () => {
      await updateSettings({ aiModel: 'claude-haiku-5-5' })
    })
    expect(await screen.findByText('Moins d’un centime avec Haiku 5.5')).toBeInTheDocument()
    expectFrenchSpacing()
  })

  it('demande une clé Claude et mène aux réglages de l’IA', async () => {
    const { router, user } = await show(<KeyNeeded />)
    expect(await screen.findByText('Ajoute ta clé Claude pour utiliser le coach.')).toBeInTheDocument()
    expect(
      screen.getByText('Le coach passe par Claude, avec ta propre clé, gardée sur cet iPhone.'),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Ajouter ma clé' }))
    expect(router.state.location.pathname).toBe('/more/ai')
  })

  it('propose de réessayer un problème passager', async () => {
    const retry = vi.fn()
    const { user } = await show(<AiProblemNote problem="busy" task="daily" onRetry={retry} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Claude est très demandé en ce moment')
    expect(screen.queryByRole('link', { name: 'Réglages de l’IA' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Réessayer' }))
    expect(retry).toHaveBeenCalledOnce()
    expectFrenchSpacing()
  })

  it('mène aux réglages quand la clé est refusée', async () => {
    const { router, user } = await show(<AiProblemNote problem="invalidKey" task="chat" onRetry={vi.fn()} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Ta clé Claude est refusée')
    expect(screen.queryByRole('button', { name: 'Réessayer' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Réglages de l’IA' }))
    expect(router.state.location.pathname).toBe('/more/ai')
  })

  it('parle de la demande faite quand Claude refuse', async () => {
    await show(<AiProblemNote problem="refused" task="body" />)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Claude n’analyse pas ces photos. Essaie avec d’autres, en tenue de sport.',
    )
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('ne propose pas de réessayer sans fonction pour relancer', async () => {
    await show(<AiProblemNote problem="failed" task="ideas" />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Le coach n’a pas pu proposer d’idées.')
    expect(screen.queryByRole('button', { name: 'Réessayer' })).not.toBeInTheDocument()
  })
})

describe('demande annulable', () => {
  function Harness({ onReady }: { onReady: (abortable: Abortable) => void }) {
    onReady(useAbortable())
    return null
  }

  it('annule la demande précédente, sur demande et en quittant l’écran', () => {
    const seen: Abortable[] = []
    const { rerender, unmount } = render(<Harness onReady={(abortable) => seen.push(abortable)} />)
    const abortable = seen[0]!
    const first = abortable.begin()
    const second = abortable.begin()
    expect(first.aborted).toBe(true)
    expect(second.aborted).toBe(false)
    abortable.cancel()
    expect(second.aborted).toBe(true)
    abortable.cancel()

    const third = abortable.begin()
    rerender(<Harness onReady={(next) => seen.push(next)} />)
    expect(seen[1]).toBe(abortable)
    expect(third.aborted).toBe(false)
    unmount()
    expect(third.aborted).toBe(true)
  })
})

describe('compteur des demandes à Claude', () => {
  beforeEach(async () => {
    await resetDb()
    vi.setSystemTime(new Date(2026, 9, 21, 11, 0))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('ajoute chaque réponse revenue au mois, au prix du modèle', async () => {
    const usage = { inputTokens: 1850, outputTokens: 420, cacheReadTokens: 0, cacheWriteTokens: 0 }
    await recordCallUsage(usage, 'claude-opus-5-5')
    await recordCallUsage(null, 'claude-opus-5-5')
    await recordCallUsage(usage, 'claude-haiku-5-5')
    const row = await db.aiUsage.get('2026-10')
    expect(row).toMatchObject({ calls: 2, inputTokens: 3700, outputTokens: 840 })
    expect(row?.costUsd).toBeCloseTo((1850 * 4 + 420 * 20 + 1850 * 0.1 + 420 * 0.5) / 1e6, 12)
  })

  it('ne fait jamais échouer la demande', async () => {
    await db.aiUsage.put(aiUsageRow())
    const broken = { inputTokens: -1, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }
    await expect(recordCallUsage(broken, 'claude-opus-5-5')).resolves.toBeUndefined()
    expect(await db.aiUsage.get('2026-10')).toEqual(aiUsageRow())
  })
})
