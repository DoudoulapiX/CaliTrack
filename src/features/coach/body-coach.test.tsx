import { act, screen, waitFor, within } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'
import { db } from '@/db/db'
import { updateNutritionGoals } from '@/db/nutrition'
import { saveSecret } from '@/db/secrets'
import { updateProfile, type ProfilePatch } from '@/db/settings'
import { canRetry, needsAiSettings, problemText } from '@/features/ai/ai-view'
import { preparePhoto, UnreadablePhotoError } from '@/features/nutrition/photo'
import {
  AI_ERROR_CASES,
  BODY_CUT_LEAN,
  errorResponse,
  fakeAnthropicFetch,
  streamResponse,
} from '@/test/anthropic'
import { bodyReview } from '@/test/fixtures'
import { renderApp } from '@/test/render-app'
import { expectFrenchSpacing } from '@/test/typography'

// jsdom ne dessine pas d'image : chaque photo « réduite » devient le nom de son fichier en base64.
vi.mock('@/features/nutrition/photo', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/nutrition/photo')>()),
  preparePhoto: vi.fn(),
}))

const PAGE = '/nutrition/body'
const KEY = 'sk-ant-api03-test-0123456789abcdefghij'
const DISCLAIMER = 'C’est une estimation pour guider tes phases, pas un avis médical.'
const ANALYZING = 'Le coach regarde tes photos…'
const NBSP = /[\u00a0\u202f]/

/** Charles : 30 ans, 1,80 m, 80 kg (2 760 kcal en maintien), avec une clé Claude. */
async function charles(patch: ProfilePatch = {}) {
  await updateProfile({
    firstName: 'Charles',
    sex: 'male',
    birthYear: 1996,
    heightCm: 180,
    weightKg: 80,
    ...patch,
  })
  await saveSecret('anthropic', KEY)
}

function stubFetch(...answers: (Response | Error)[]) {
  const fake = fakeAnthropicFetch(...answers)
  vi.stubGlobal('fetch', fake.fetchImpl)
  return fake
}

/** Choisit une photo pour une place (« De face »…). */
async function addPhoto(user: UserEvent, label: string, name = `${label}.jpg`) {
  await user.upload(await screen.findByLabelText(label), new File(['photo'], name, { type: 'image/jpeg' }))
}

/** Laisse passer les effets et les lectures de la base en attente. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50))
  })
}

function section(title: string): HTMLElement {
  const found = screen.getByRole('heading', { name: title, level: 2 }).closest('section')
  if (!found) throw new Error(`Section ${title} introuvable`)
  return found
}

/** Ce qu'affichent les cases des objectifs (« Calories 2 760 kcal »). */
function tiles(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('dl > div'), (tile) =>
    [tile.querySelector('dt')?.textContent, tile.querySelector('dd')?.textContent]
      .join(' ')
      .replace(/\s/g, ' '),
  )
}

interface SentBody {
  model: string
  output_config: { effort: string; format: { type: string; schema: { properties: object } } }
  messages: { content: { type: string; text?: string; source?: { media_type: string; data: string } }[] }[]
}

describe('coach physique', () => {
  // Les aperçus des photos : adresses créées (« blob:photo-1 »…) et libérées.
  let created = vi.fn<(file: Blob) => string>()
  let revoked = vi.fn<(url: string) => void>()

  beforeEach(() => {
    vi.setSystemTime(new Date(2026, 9, 21, 11, 0))
    vi.mocked(preparePhoto).mockImplementation((file) => Promise.resolve(btoa((file as File).name)))
    let made = 0
    created = vi.fn(() => `blob:photo-${String(++made)}`)
    revoked = vi.fn()
    URL.createObjectURL = created
    URL.revokeObjectURL = revoked
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('n’appelle jamais Claude sans qu’on le demande', async () => {
    const { requests } = stubFetch()
    const { user } = await renderApp(PAGE, { setup: charles })
    expect(await screen.findByRole('heading', { name: 'Coach physique', level: 1 })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Analyser mes photos' })).toBeDisabled()
    expect(screen.getByText(DISCLAIMER)).toBeInTheDocument()
    // Choisir une photo ne l'envoie pas.
    await addPhoto(user, 'De face')
    expect(await screen.findByRole('button', { name: 'Retirer la photo de face' })).toBeInTheDocument()
    await settle()
    expect(requests).toHaveLength(0)
  })

  it('demande d’abord une clé Claude', async () => {
    const { user, router } = await renderApp(PAGE, { setup: () => updateProfile({ birthYear: 1996 }) })
    expect(await screen.findByText('Ajoute ta clé Claude pour utiliser le coach.')).toBeInTheDocument()
    expect(screen.getByText(DISCLAIMER)).toBeInTheDocument()
    expect(screen.queryByLabelText('De face')).not.toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Ajouter ma clé' }))
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/more/ai')
    })
  })

  it.each([
    {
      name: 'sans année de naissance',
      patch: { birthYear: null },
      text: 'Indique ton année de naissance dans ton profil.',
      profile: true,
    },
    {
      name: 'à 18 ans dans l’année',
      patch: { birthYear: 2008 },
      text: 'Le coach physique est réservé aux adultes.',
      profile: false,
    },
    {
      name: 'sans taille',
      patch: { heightCm: null },
      text: 'Indique ta taille dans ton profil.',
      profile: true,
    },
  ])('reste fermé $name', async ({ patch, text, profile }) => {
    const { requests } = stubFetch()
    const { user, router } = await renderApp(PAGE, { setup: () => charles(patch) })
    expect(await screen.findByText(text)).toBeInTheDocument()
    expect(screen.getByText(DISCLAIMER)).toBeInTheDocument()
    expect(screen.queryByLabelText('De face')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Analyser mes photos' })).not.toBeInTheDocument()
    expectFrenchSpacing()
    const link = screen.queryByRole('link', { name: 'Compléter mon profil' })
    expect(link !== null).toBe(profile)
    if (link) {
      expect(link).toHaveAttribute('href', '/more/profile')
      await user.click(link)
      expect(await screen.findByRole('heading', { name: 'Profil et niveau', level: 1 })).toBeInTheDocument()
      expect(router.state.location.pathname).toBe('/more/profile')
    }
    expect(requests).toHaveLength(0)
  })

  it('fait noter le poids avant de commencer', async () => {
    const { user } = await renderApp(PAGE, { setup: () => charles({ weightKg: null }) })
    expect(await screen.findByText('Note ton poids pour commencer.')).toBeInTheDocument()
    expect(screen.queryByLabelText('De face')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Noter mon poids' }))
    const sheet = await screen.findByRole('dialog', { name: 'Noter mon poids' })
    await user.type(within(sheet).getByLabelText('Poids'), '78')
    await user.click(within(sheet).getByRole('button', { name: 'Enregistrer' }))
    expect(await screen.findByRole('button', { name: 'Analyser mes photos' })).toBeInTheDocument()
    expect(screen.queryByText('Note ton poids pour commencer.')).not.toBeInTheDocument()
    expect(screen.getByText(DISCLAIMER)).toBeInTheDocument()
  })

  it('n’envoie rien quand une photo ne s’ouvre pas', async () => {
    const { requests } = stubFetch()
    vi.mocked(preparePhoto)
      .mockRejectedValueOnce(new UnreadablePhotoError())
      .mockRejectedValueOnce(new Error('Canvas indisponible'))
    const { user } = await renderApp(PAGE, { setup: charles })
    await addPhoto(user, 'De face')
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Cette photo ne s’ouvre pas. Choisis-en une autre.',
    )
    expect(screen.getByRole('button', { name: 'Analyser mes photos' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Retirer la photo de face' })).not.toBeInTheDocument()
    await addPhoto(user, 'De dos')
    expect(await screen.findByRole('alert')).toHaveTextContent('Cette photo ne s’ouvre pas.')
    expect(created).not.toHaveBeenCalled()

    await addPhoto(user, 'De face', 'bonne.jpg')
    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: 'Analyser mes photos' })).toBeEnabled()
    await settle()
    expect(requests).toHaveLength(0)
  })

  it('analyse les photos et garde la phase de CaliTrack quand elle corrige celle du coach', async () => {
    const { requests } = stubFetch(streamResponse(BODY_CUT_LEAN))
    const { user } = await renderApp(PAGE, {
      setup: async () => {
        await charles()
        await updateNutritionGoals({ phase: 'cut' })
      },
    })
    await addPhoto(user, 'De face', 'face.jpg')
    await addPhoto(user, 'De profil', 'profil.jpg')
    await addPhoto(user, 'De dos', 'dos.jpg')
    expect(await screen.findByRole('button', { name: 'Retirer la photo de dos' })).toBeInTheDocument()
    expect(screen.getByText('Environ 9 centimes avec Opus 5.5')).toBeInTheDocument()
    expect(
      screen.getByText('Tes photos partent vers Anthropic pour l’analyse ; CaliTrack ne les garde pas.'),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Analyser mes photos' }))

    expect(await screen.findByText('Phase conseillée : Maintien', {}, { timeout: 5000 })).toBeInTheDocument()
    expect(
      screen.getByText('Le coach proposait une sèche ; CaliTrack conseille le maintien vu ta corpulence.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Masse grasse estimée : 8 à 11 %')).toBeInTheDocument()
    expect(screen.getByText('Silhouette sèche et musclée.')).toBeInTheDocument()
    expect(screen.getByText('Abdominaux bien visibles.')).toBeInTheDocument()
    expect(screen.getByText('Garde tes protéines hautes.')).toBeInTheDocument()
    expect(tiles(section('Objectifs pour cette phase'))).toEqual([
      'Calories 2 760 kcal',
      'Protéines 145 g',
      'Glucides 375 g',
      'Lipides 75 g',
    ])
    expect(
      within(section('Objectifs pour cette phase')).getByRole('link', { name: 'Mes objectifs' }),
    ).toHaveAttribute('href', '/nutrition/targets')
    // Pas de valeur fixée à la main : rien à remplacer.
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Appliquer cette phase' })).toBeEnabled()
    expect(within(section('Historique')).getByRole('listitem')).toHaveTextContent(
      /^Aujourd’hui\s*Maintien · 8\sà\s11\s% de masse grasse$/,
    )
    expect(screen.getByText(DISCLAIMER)).toBeInTheDocument()
    expectFrenchSpacing()

    // La demande : trois photos en JPEG, réduites à 1024 pixels, puis le texte, sans prénom ni espace insécable.
    expect(requests).toHaveLength(1)
    const body = requests[0]?.body as SentBody
    expect(body.model).toBe('claude-opus-5-5')
    expect(body.output_config).toMatchObject({ effort: 'medium', format: { type: 'json_schema' } })
    expect(Object.keys(body.output_config.format.schema.properties)).toContain('bodyFatLow')
    const content = body.messages[0]?.content ?? []
    expect(content.map((block) => block.type)).toEqual(['image', 'image', 'image', 'text'])
    expect(content.slice(0, 3).map((block) => block.source)).toEqual([
      { type: 'base64', media_type: 'image/jpeg', data: btoa('face.jpg') },
      { type: 'base64', media_type: 'image/jpeg', data: btoa('profil.jpg') },
      { type: 'base64', media_type: 'image/jpeg', data: btoa('dos.jpg') },
    ])
    expect(content[3]?.text).toContain("Photos jointes, dans l'ordre : de face, de profil, de dos.")
    expect(content[3]?.text).toContain('Phase actuelle : cut (sèche).')
    expect(JSON.stringify(body)).not.toMatch(NBSP)
    expect(JSON.stringify(body)).not.toContain('Charles')
    expect(vi.mocked(preparePhoto).mock.calls.map(([, maxSide]) => maxSide)).toEqual([1024, 1024, 1024])

    // L'analyse est enregistrée, sans les photos ; la phase n'est pas appliquée d'office.
    const saved = await db.bodyReviews.toArray()
    expect(saved).toEqual([
      expect.objectContaining({
        date: '2026-10-21',
        model: 'claude-opus-5-5',
        suggestedPhase: 'cut',
        phase: 'maintain',
        bodyFat: { low: 8, high: 11 },
        weightKg: 80,
        targets: { kcal: 2760, proteinG: 145, carbsG: 375, fatG: 75 },
        appliedAt: null,
      }),
    ])
    expect(JSON.stringify(saved)).not.toContain(btoa('face.jpg'))
    expect(await db.nutritionGoals.get('me')).toMatchObject({ phase: 'cut' })
    expect(await db.aiUsage.get('2026-10')).toMatchObject({ calls: 1, inputTokens: 1850, outputTokens: 420 })
  })

  it('garde les aperçus en mémoire seulement, et les libère', async () => {
    const { user } = await renderApp(PAGE, { setup: charles })
    // Une photo lente, remplacée avant d'être prête : elle est ignorée.
    let finishSlow: (base64: string) => void = () => undefined
    vi.mocked(preparePhoto).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishSlow = resolve
        }),
    )
    await addPhoto(user, 'De face', 'lente.jpg')
    expect(screen.getByRole('button', { name: 'Analyser mes photos' })).toBeDisabled()
    await addPhoto(user, 'De face', 'rapide.jpg')
    expect(await screen.findByRole('button', { name: 'Retirer la photo de face' })).toBeInTheDocument()
    await act(async () => {
      finishSlow('TEVOVEU=')
      await Promise.resolve()
    })
    expect(created).toHaveBeenCalledTimes(1)

    await addPhoto(user, 'De profil')
    await addPhoto(user, 'De dos')
    expect(await screen.findByRole('button', { name: 'Retirer la photo de dos' })).toBeInTheDocument()
    // Une photo remplacée, puis une autre retirée : leurs aperçus sont libérés aussitôt.
    await addPhoto(user, 'De dos', 'dos-2.jpg')
    await waitFor(() => {
      expect(revoked).toHaveBeenCalledWith('blob:photo-3')
    })
    await user.click(screen.getByRole('button', { name: 'Retirer la photo de profil' }))
    expect(revoked).toHaveBeenCalledWith('blob:photo-2')
    expect(screen.queryByRole('button', { name: 'Retirer la photo de profil' })).not.toBeInTheDocument()
    expect(Array.from(document.querySelectorAll('main img'), (img) => img.getAttribute('src'))).toEqual([
      'blob:photo-1',
      'blob:photo-4',
    ])
    expect(revoked).toHaveBeenCalledTimes(2)

    // En quittant l'écran, les derniers aperçus sont libérés.
    await user.click(screen.getByRole('button', { name: 'Nutrition' }))
    expect(await screen.findByRole('heading', { name: 'Nutrition', level: 1 })).toBeInTheDocument()
    expect(revoked.mock.calls.map(([url]) => url).sort()).toEqual([
      'blob:photo-1',
      'blob:photo-2',
      'blob:photo-3',
      'blob:photo-4',
    ])
  })

  it.each([
    { reset: true, goals: { phase: 'cut', kcal: null, proteinG: null } },
    { reset: false, goals: { phase: 'cut', kcal: 2300, proteinG: 150 } },
  ])('applique la phase, en remplaçant les valeurs manuelles : $reset', async ({ reset, goals }) => {
    const { requests } = stubFetch()
    const { user } = await renderApp(PAGE, {
      setup: async () => {
        await charles()
        await updateNutritionGoals({ phase: 'maintain', kcal: 2300, proteinG: 150 })
        await db.bodyReviews.put(bodyReview())
      },
    })
    // L'analyse du jour reste affichée en revenant sur l'écran.
    expect(await screen.findByText('Phase conseillée : Sèche')).toBeInTheDocument()
    expect(screen.queryByText(/^Le coach proposait/)).not.toBeInTheDocument()
    expect(tiles(section('Objectifs pour cette phase'))).toEqual([
      'Calories 2 210 kcal',
      'Protéines 175 g',
      'Glucides 245 g',
      'Lipides 60 g',
    ])
    const toggle = screen.getByRole('switch', { name: 'Remplacer mes valeurs manuelles' })
    expect(toggle).toHaveAttribute('aria-checked', 'true')
    expect(screen.queryByText('Tes valeurs manuelles restent prioritaires.')).not.toBeInTheDocument()
    if (!reset) {
      await user.click(toggle)
      expect(toggle).toHaveAttribute('aria-checked', 'false')
      expect(screen.getByText('Tes valeurs manuelles restent prioritaires.')).toBeInTheDocument()
    }

    await user.click(screen.getByRole('button', { name: 'Appliquer cette phase' }))
    expect(await screen.findByRole('button', { name: 'Appliquée le 21 octobre' })).toBeDisabled()
    expect(await screen.findByText('Phase appliquée à tes objectifs')).toBeInTheDocument()
    expect(await db.nutritionGoals.get('me')).toMatchObject({ ...goals, carbsG: null, fatG: null })
    expect(await db.bodyReviews.get('2026-10-21')).toMatchObject({
      appliedAt: '2026-10-21T09:00:00.000Z',
      targets: { kcal: 2210, proteinG: 175, carbsG: 245, fatG: 60 },
    })
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    expect(screen.queryByText('Tes valeurs manuelles restent prioritaires.') !== null).toBe(!reset)
    expect(screen.getByText(DISCLAIMER)).toBeInTheDocument()
    expectFrenchSpacing()
    expect(requests).toHaveLength(0)
  })

  it('propose de nouveau la phase quand les objectifs ont changé depuis', async () => {
    await renderApp(PAGE, {
      setup: async () => {
        await charles()
        await updateNutritionGoals({ phase: 'cut' })
        await db.bodyReviews.put(bodyReview({ appliedAt: '2026-10-21T08:00:00.000Z' }))
      },
    })
    expect(await screen.findByRole('button', { name: 'Appliquée le 21 octobre' })).toBeDisabled()
    await act(async () => {
      await updateNutritionGoals({ phase: 'bulk' })
    })
    expect(await screen.findByRole('button', { name: 'Appliquer cette phase' })).toBeEnabled()
  })

  it('montre les six dernières analyses, celle du jour en détail seulement', async () => {
    const dates = [
      '2026-04-01',
      '2026-06-01',
      '2026-08-01',
      '2026-09-01',
      '2026-09-30',
      '2026-10-14',
      '2026-10-20',
    ]
    await renderApp(PAGE, {
      setup: async () => {
        await charles()
        for (const date of dates) {
          await db.bodyReviews.put(bodyReview({ date, phase: 'maintain', bodyFat: { low: 14, high: 17 } }))
        }
      },
    })
    const rows = await within(await waitFor(() => section('Historique'))).findAllByRole('listitem')
    expect(rows.map((row) => row.textContent.replace(/\s/g, ' '))).toEqual([
      'HierMaintien · 14 à 17 % de masse grasse',
      'Mercredi 14 octobreMaintien · 14 à 17 % de masse grasse',
      'Mercredi 30 septembreMaintien · 14 à 17 % de masse grasse',
      'Mardi 1 septembreMaintien · 14 à 17 % de masse grasse',
      'Samedi 1 aoûtMaintien · 14 à 17 % de masse grasse',
      'Lundi 1 juinMaintien · 14 à 17 % de masse grasse',
    ])
    // Pas d'analyse aujourd'hui : rien à appliquer.
    expect(screen.queryByText(/^Phase conseillée/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Appliquer cette phase' })).not.toBeInTheDocument()
    expectFrenchSpacing()
  })

  it('dit ce que Claude ne voit pas, sans rien enregistrer', async () => {
    stubFetch(
      streamResponse({
        ...BODY_CUT_LEAN,
        readable: false,
        problem: 'Je ne vois qu’un mur blanc : pas de silhouette.',
      }),
      streamResponse({ ...BODY_CUT_LEAN, readable: false, problem: '   ' }),
    )
    const { user } = await renderApp(PAGE, { setup: charles })
    await addPhoto(user, 'De face')
    await user.click(await screen.findByRole('button', { name: 'Analyser mes photos' }))
    expect(await screen.findByRole('alert', {}, { timeout: 5000 })).toHaveTextContent(
      'Je ne vois qu’un mur blanc : pas de silhouette.',
    )
    expectFrenchSpacing()
    expect(screen.queryByText(/^Phase conseillée/)).not.toBeInTheDocument()
    expect(await db.bodyReviews.count()).toBe(0)
    // La réponse est facturée, même inutilisable.
    expect(await db.aiUsage.get('2026-10')).toMatchObject({ calls: 1 })

    await user.click(screen.getByRole('button', { name: 'Analyser mes photos' }))
    expect(await screen.findByRole('alert', {}, { timeout: 5000 })).toHaveTextContent(
      'Ces photos ne permettent pas l’analyse. Essaie avec d’autres, en pied et en tenue de sport.',
    )
    expect(await db.bodyReviews.count()).toBe(0)
    expect(screen.getByText(DISCLAIMER)).toBeInTheDocument()
  })

  it('dit ce qui n’a pas marché, pour chaque problème', async () => {
    const { user } = await renderApp(PAGE, { setup: charles })
    await addPhoto(user, 'De face')
    await screen.findByRole('button', { name: 'Retirer la photo de face' })
    for (const errorCase of AI_ERROR_CASES) {
      stubFetch(...errorCase.answers())
      await user.click(screen.getByRole('button', { name: 'Analyser mes photos' }))
      const alert = await screen.findByRole('alert', {}, { timeout: 5000 })
      expect(alert.textContent, errorCase.name).toBe(problemText(errorCase.problem, 'body'))
      expect(screen.queryByRole('button', { name: 'Réessayer' }) !== null, errorCase.name).toBe(
        canRetry(errorCase.problem),
      )
      expect(screen.queryByRole('link', { name: 'Réglages de l’IA' }) !== null, errorCase.name).toBe(
        needsAiSettings(errorCase.problem),
      )
      expectFrenchSpacing()
    }
    expect(await db.bodyReviews.count()).toBe(0)
  })

  it('réessaie avec les mêmes photos', async () => {
    const { requests } = stubFetch(errorResponse(529, 'overloaded_error'), streamResponse(BODY_CUT_LEAN))
    const { user } = await renderApp(PAGE, { setup: charles })
    await addPhoto(user, 'De dos', 'dos.jpg')
    await user.click(await screen.findByRole('button', { name: 'Analyser mes photos' }))
    await user.click(await screen.findByRole('button', { name: 'Réessayer' }, { timeout: 5000 }))
    expect(await screen.findByText('Phase conseillée : Maintien', {}, { timeout: 5000 })).toBeInTheDocument()
    expect(requests).toHaveLength(2)
    expect((requests[1]?.body as SentBody).messages[0]?.content[0]?.source?.data).toBe(btoa('dos.jpg'))
  })

  it('annule une analyse en cours, et en quittant l’écran', async () => {
    const pending = vi.fn(
      (_input: unknown, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Annulé', 'AbortError'))
          })
        }),
    )
    vi.stubGlobal('fetch', pending)
    const { user } = await renderApp(PAGE, { setup: charles })
    await addPhoto(user, 'De face')
    await user.click(await screen.findByRole('button', { name: 'Analyser mes photos' }))
    expect(await screen.findByText(ANALYZING)).toBeInTheDocument()
    expect(screen.getByLabelText('De face')).toBeDisabled()
    await waitFor(() => {
      expect(pending).toHaveBeenCalledTimes(1)
    })
    await user.click(screen.getByRole('button', { name: 'Annuler' }))
    expect(await screen.findByRole('button', { name: 'Analyser mes photos' })).toBeEnabled()
    expect(screen.queryByText(ANALYZING)).not.toBeInTheDocument()
    await settle()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(pending.mock.calls[0]?.[1]?.signal?.aborted).toBe(true)

    // Une nouvelle analyse, abandonnée en quittant l'écran.
    await user.click(screen.getByRole('button', { name: 'Analyser mes photos' }))
    await waitFor(() => {
      expect(pending).toHaveBeenCalledTimes(2)
    })
    await user.click(screen.getByRole('button', { name: 'Nutrition' }))
    expect(await screen.findByRole('heading', { name: 'Nutrition', level: 1 })).toBeInTheDocument()
    expect(pending.mock.calls[1]?.[1]?.signal?.aborted).toBe(true)
    await settle()
    expect(await db.bodyReviews.count()).toBe(0)
    expect(await db.aiUsage.count()).toBe(0)
  })

  it('s’ouvre depuis les objectifs caloriques', async () => {
    const { user, router } = await renderApp('/nutrition/targets', { setup: charles })
    const link = await screen.findByRole('link', { name: 'Faire le point avec le coach physique' })
    expect(link).toHaveAttribute('href', '/nutrition/body')
    await user.click(link)
    expect(await screen.findByRole('heading', { name: 'Coach physique', level: 1 })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/nutrition/body')
  })
})
