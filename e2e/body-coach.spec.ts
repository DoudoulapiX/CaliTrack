import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { BODY_CUT_LEAN } from './coach-fixtures'
import { CLAUDE_KEY, collectErrors, fakeClaude, jpegSize, onboard, solidPng } from './nutrition-helpers'

// Sous WebKit, page.route ne voit pas les requêtes d'une page que le service worker contrôle : Claude
// simulé exige de le bloquer.
test.use({ serviceWorkers: 'block' })

/** Un mercredi midi. */
const NOW = new Date('2026-10-21T12:30:00+02:00')

/** Attend la fin des transitions et animations en cours (pas de celles qui tournent sans fin). */
async function animationsDone(page: Page) {
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every(
        (animation) =>
          animation.playState !== 'running' || animation.effect?.getComputedTiming().endTime === Infinity,
      ),
  )
}

/** Aucun défaut d'accessibilité détecté par axe sur l'écran affiché, une fois immobile. */
async function expectAccessible(page: Page, screen: string) {
  await animationsDone(page)
  const { violations } = await new AxeBuilder({ page }).analyze()
  const summary = violations.flatMap((v) =>
    v.nodes.map((node) => `${screen} : ${v.id} : ${node.target.join(' ')}\n${node.failureSummary ?? ''}`),
  )
  expect(summary).toEqual([])
}

/** Les requêtes parties ailleurs que vers l'appli ou l'API Claude simulée (il ne doit y en avoir aucune). */
function outsideRequests(page: Page): string[] {
  const outside: string[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    const local = url.hostname === 'localhost' || url.hostname === 'api.anthropic.com'
    if ((url.protocol === 'http:' || url.protocol === 'https:') && !local) outside.push(request.url())
  })
  return outside
}

/** Premier lancement, la clé Claude collée, puis une sèche avec des calories fixées à la main. */
async function setUp(page: Page) {
  await onboard(page)
  await page.goto('more/ai')
  await page.getByLabel('Clé API Claude').fill(CLAUDE_KEY)
  await page.getByRole('button', { name: 'Enregistrer la clé' }).click()
  await expect(page.getByText('sk-ant-…ghij')).toBeVisible()

  await page.goto('nutrition/targets')
  await page.getByRole('radio', { name: 'Sèche' }).click()
  await page.getByLabel('Calories par jour').fill('2300')
  await expect(page.getByText(/^Fixé à la main\s:\s2\s300\skcal$/)).toBeVisible()
}

/** Une grande photo de face (2048 × 1536), analysée par Claude (simulé). */
async function analyzePhoto(page: Page) {
  await page.getByLabel('De face').setInputFiles({
    name: 'IMG_0003.png',
    mimeType: 'image/png',
    buffer: solidPng(2048, 1536, [180, 150, 130]),
  })
  await expect(page.getByRole('button', { name: 'Retirer la photo de face' })).toBeVisible()
  await page.getByRole('button', { name: 'Analyser mes photos' }).click()
  await expect(page.getByText(/^Phase conseillée\s:\sMaintien$/)).toBeVisible()
}

test('coach physique : photo analysée, phase corrigée par CaliTrack, puis appliquée aux objectifs', async ({
  page,
}) => {
  const errors = collectErrors(page)
  const outside = outsideRequests(page)
  await page.clock.setFixedTime(NOW)
  const sent = await fakeClaude(page, { body: BODY_CUT_LEAN })
  await setUp(page)

  // Depuis les objectifs caloriques.
  await page.getByRole('link', { name: 'Faire le point avec le coach physique' }).click()
  await expect(page.getByRole('heading', { name: 'Coach physique', level: 1 })).toBeVisible()
  await expect(
    page.getByText('C’est une estimation pour guider tes phases, pas un avis médical.'),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Analyser mes photos' })).toBeDisabled()

  await analyzePhoto(page)
  // Claude propose une sèche, mais la masse grasse est déjà basse : CaliTrack conseille le maintien.
  await expect(
    page.getByText(/^Le coach proposait une sèche\s; CaliTrack conseille le maintien vu ta corpulence\.$/),
  ).toBeVisible()
  await expect(page.getByText(/^Masse grasse estimée\s:\s8\sà\s11\s%$/)).toBeVisible()
  await expect(
    page.getByText('C’est une estimation pour guider tes phases, pas un avis médical.'),
  ).toBeVisible()

  // Une seule demande : la photo réduite à 1024 pixels, en JPEG, avec la clé.
  const messages = sent.filter((request) => request.url.endsWith('/v1/messages'))
  expect(messages.map((request) => request.task)).toEqual(['body'])
  expect(messages[0]?.key).toBe(CLAUDE_KEY)
  const image = (
    messages[0]?.body as { messages: { content: { source?: { data: string; media_type: string } }[] }[] }
  ).messages[0]?.content[0]?.source
  expect(image?.media_type).toBe('image/jpeg')
  expect(jpegSize(Buffer.from(image?.data ?? '', 'base64'))).toEqual({ width: 1024, height: 768 })
  expect(JSON.stringify(messages[0]?.body)).not.toMatch(/[\u00a0\u202f]/)

  // Appliquée en remplaçant la valeur fixée à la main (choix par défaut).
  await expect(page.getByRole('switch', { name: 'Remplacer mes valeurs manuelles' })).toHaveAttribute(
    'aria-checked',
    'true',
  )
  await page.getByRole('button', { name: 'Appliquer cette phase' }).click()
  await expect(page.getByRole('button', { name: 'Appliquée le 21 octobre' })).toBeDisabled()
  await expect(page.getByRole('switch')).toHaveCount(0)

  await page.getByRole('link', { name: 'Mes objectifs' }).click()
  await expect(page.getByRole('heading', { name: 'Objectifs caloriques', level: 1 })).toBeVisible()
  await expect(page.getByRole('radio', { name: 'Maintien' })).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByText(/^En maintien\s:/)).toBeVisible()
  await expect(page.getByText(/^Fixé à la main/)).toHaveCount(0)
  await expect(page.getByLabel('Calories par jour')).toHaveValue('')

  // Revenu sur l'écran : l'analyse du jour est toujours là, sans nouvelle demande.
  await page.goBack()
  await expect(page.getByRole('button', { name: 'Appliquée le 21 octobre' })).toBeVisible()
  await expect(
    page.getByRole('listitem').filter({ hasText: /^Aujourd’hui\s*Maintien · 8\sà\s11\s% de masse grasse$/ }),
  ).toBeVisible()
  expect(sent.filter((request) => request.url.endsWith('/v1/messages'))).toHaveLength(1)
  expect(outside).toEqual([])
  expect(errors).toEqual([])
})

for (const colorScheme of ['dark', 'light'] as const) {
  test.describe(`thème ${colorScheme === 'dark' ? 'sombre' : 'clair'}`, () => {
    test.use({ colorScheme })

    test('coach physique accessible, avant et après l’analyse', async ({ page }) => {
      const errors = collectErrors(page)
      await page.clock.setFixedTime(NOW)
      await fakeClaude(page, { body: BODY_CUT_LEAN })
      await setUp(page)

      await page.goto('nutrition/body')
      await expect(page.getByRole('heading', { name: 'Coach physique', level: 1 })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Analyser mes photos' })).toBeVisible()
      await expectAccessible(page, 'coach physique')

      await analyzePhoto(page)
      await expect(page.getByRole('switch', { name: 'Remplacer mes valeurs manuelles' })).toBeVisible()
      await expectAccessible(page, 'analyse du jour')
      expect(errors).toEqual([])
    })
  })
}
