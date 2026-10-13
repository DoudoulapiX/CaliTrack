import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { DAILY_LIGHTER, DAILY_REST } from './coach-fixtures'
import { CLAUDE_KEY, collectErrors, fakeClaude, onboard, type SentToClaude } from './nutrition-helpers'

// Sous WebKit, page.route ne voit pas les requêtes d'une page que le service worker contrôle : l'API
// Claude simulée exige de le bloquer.
test.use({ serviceWorkers: 'block' })

/** Le mercredi 21 octobre 2026 à midi et demi : une séance du programme (lundi, mercredi, vendredi). */
const NOW = new Date('2026-10-21T12:30:00+02:00')

const COACH_NOTE = /^Coach\s:\sNuit courte\s:\sune série de moins\. Ne compte pas pour la progression\.$/

/** Un exercice de la séance du jour, lu dans le tableau <seance> envoyé au coach. */
interface PlannedRow {
  slotId: string
  exerciseId: string
  sets: number
}

/** Le texte envoyé à Claude (un seul bloc de texte). */
function promptOf(body: unknown): string {
  const request = body as { messages?: { content?: { text?: string }[] }[] } | null
  return request?.messages?.[0]?.content?.[0]?.text ?? ''
}

/** Le premier exercice hors échauffement que le coach peut alléger (plus d'une série). */
function lighterRow(body: unknown): PlannedRow {
  const table = /<seance>\n[^\n]*\n([\s\S]*?)\n<\/seance>/.exec(promptOf(body))?.[1] ?? ''
  for (const line of table.split('\n')) {
    const [slotId = '', block = '', exercise = '', sets = '', , , actions = ''] = line.split(' | ')
    const exerciseId = /\[([^\]]+)\]$/.exec(exercise)?.[1]
    if (
      block !== 'échauffement' &&
      actions.split(', ').includes('lighter') &&
      Number(sets) > 1 &&
      exerciseId
    ) {
      return { slotId, exerciseId, sets: Number(sets) }
    }
  }
  throw new Error(`Aucun exercice à alléger dans la séance :\n${table}`)
}

/** La réponse du coach : une série de moins sur cet exercice (le créneau de DAILY_LIGHTER n'existe pas ici). */
function lighterAnswer(rows: PlannedRow[]) {
  return (body: unknown) => {
    const row = lighterRow(body)
    rows.push(row)
    const [change] = DAILY_LIGHTER.changes
    return {
      ...DAILY_LIGHTER,
      changes: [{ ...change, slotId: row.slotId, exerciseId: row.exerciseId, sets: row.sets - 1 }],
    }
  }
}

/** Les requêtes parties ailleurs que vers l'appli et l'API Claude simulée. */
function foreignRequests(page: Page): string[] {
  const foreign: string[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.protocol === 'data:' || url.protocol === 'blob:') return
    if (url.hostname === 'localhost' || url.hostname === 'api.anthropic.com') return
    foreign.push(request.url())
  })
  return foreign
}

const messagesSent = (sent: SentToClaude[]) => sent.filter((request) => request.url.endsWith('/v1/messages'))

async function saveKey(page: Page) {
  await page.goto('more/ai')
  await page.getByLabel('Clé API Claude').fill(CLAUDE_KEY)
  await page.getByRole('button', { name: 'Enregistrer la clé' }).click()
  await expect(page.getByText('sk-ant-…ghij')).toBeVisible()
}

/** La carte de la séance du jour, sur l'accueil. */
function todayCard(page: Page) {
  return page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Au programme', level: 2 }) })
}

/**
 * Attend la fin des transitions et animations en cours (pas de celles qui tournent sans fin), comme
 * dans a11y.spec.ts : les couleurs intermédiaires ne doivent pas être mesurées.
 */
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

for (const colorScheme of ['dark', 'light'] as const) {
  test.describe(`thème ${colorScheme === 'dark' ? 'sombre' : 'clair'}`, () => {
    test.use({ colorScheme })

    test('coach du jour : ressenti, séance allégée, puis commencée depuis l’accueil', async ({ page }) => {
      const errors = collectErrors(page)
      const foreign = foreignRequests(page)
      await page.clock.setFixedTime(NOW)
      const rows: PlannedRow[] = []
      const sent = await fakeClaude(page, { daily: lighterAnswer(rows) })
      await onboard(page)
      await saveKey(page)

      // L'accueil propose le coach, sans l'appeler.
      await page.goto('./')
      const card = todayCard(page)
      await card.getByRole('link', { name: 'Ajuster avec le coach' }).click()
      await expect(page.getByRole('heading', { name: 'Coach du jour', level: 1 })).toBeVisible()
      await expect(page.getByText('Pas de données Oura aujourd’hui.')).toBeVisible()
      expect(messagesSent(sent)).toHaveLength(0)

      // Le ressenti : la bague n'a rien noté, le sommeil est demandé.
      await page.getByRole('radiogroup', { name: 'Sommeil' }).getByRole('radio', { name: 'Mauvais' }).click()
      await page.getByRole('radiogroup', { name: 'Énergie' }).getByRole('radio', { name: 'Basse' }).click()
      await page
        .getByRole('radiogroup', { name: 'Courbatures' })
        .getByRole('radio', { name: 'Légères' })
        .click()
      await page
        .getByRole('group', { name: 'Zones courbaturées' })
        .getByRole('button', { name: 'Dos', exact: true })
        .click()
      await page.getByLabel(/^Autre chose à dire au coach/).fill('Grosse journée de travail')
      await page.getByRole('button', { name: 'Demander au coach' }).click()

      const changed = page.getByRole('list', { name: 'Exercices changés' })
      await expect(changed.getByRole('listitem')).toHaveCount(1)
      await expect(page.getByText('Séance allégée', { exact: true }).first()).toBeVisible()
      await expect(page.getByRole('button', { name: 'Commencer la séance allégée' })).toBeVisible()
      await expect(page.getByText(/cette\s+nuit/i)).toHaveCount(0)
      await expectAccessible(page, 'coach du jour, conseil')

      const [request] = messagesSent(sent)
      expect(request?.task).toBe('daily')
      expect(request?.key).toBe(CLAUDE_KEY)
      const prompt = promptOf(request?.body)
      expect(prompt).toContain('<note>\nGrosse journée de travail\n</note>')
      expect(prompt).toContain('- sommeil : mauvais')
      expect(prompt).not.toMatch(/[\u00a0\u202f]/)
      const [row] = rows
      if (!row) throw new Error('Le coach n’a pas répondu')

      // De retour sur l'accueil : un seul bouton, la séance allégée.
      await page.goto('./')
      await expect(todayCard(page).getByText('Allégée par le coach')).toBeVisible()
      const starts = page.getByRole('button', { name: /^Commencer la séance/ })
      await expect(starts).toHaveCount(1)
      await expect(starts).toHaveText('Commencer la séance allégée')
      await expect(page.getByText(/cette\s+nuit/i)).toHaveCount(0)
      await starts.click()

      // La séance : une série de moins sur l'exercice allégé, avec la note du coach.
      await expect(page).toHaveURL(/\/workout\/.+/)
      const lighter = page.getByRole('article').filter({ hasText: /Ne compte pas pour la progression/ })
      await expect(lighter).toHaveCount(1)
      await expect(lighter.getByText(COACH_NOTE)).toBeVisible()
      await expect(lighter.getByRole('button', { name: /série \d+ faite$/ })).toHaveCount(row.sets - 1)

      expect(messagesSent(sent)).toHaveLength(1)
      expect(foreign).toEqual([])
      expect(errors).toEqual([])
    })
  })
}

test('coach du jour : repos conseillé, pris depuis l’accueil puis annulé', async ({ page }) => {
  const errors = collectErrors(page)
  const foreign = foreignRequests(page)
  await page.clock.setFixedTime(NOW)
  const sent = await fakeClaude(page, { daily: DAILY_REST })
  await onboard(page)
  await saveKey(page)

  await page.goto('training/coach')
  await page.getByRole('button', { name: 'Demander au coach' }).click()
  await expect(page.getByText('Tes courbatures sont fortes', { exact: false })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Prendre ma journée de repos' })).toBeVisible()

  // L'accueil : le repos d'abord, la séance en second choix.
  await page.goto('./')
  const card = todayCard(page)
  await expect(card.getByText('Repos conseillé', { exact: true })).toBeVisible()
  await expect(card.getByRole('button', { name: 'Faire la séance quand même' })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Commencer la séance/ })).toHaveCount(0)
  await card.getByRole('button', { name: 'Prendre ma journée de repos' }).click()
  await expect(page.getByText('Journée de repos notée')).toBeVisible()
  await expect(card.getByText('Séance passée aujourd’hui')).toBeVisible()

  // Annulé depuis le coach : la séance revient.
  await page.goto('training/coach')
  await expect(page.getByText('Journée de repos prise')).toBeVisible()
  await page.getByRole('button', { name: 'Annuler le repos' }).click()
  await expect(page.getByText('Séance remise au programme')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Prendre ma journée de repos' })).toBeVisible()
  await page.goto('./')
  await expect(todayCard(page).getByRole('button', { name: 'Prendre ma journée de repos' })).toBeVisible()

  expect(messagesSent(sent)).toHaveLength(1)
  expect(messagesSent(sent)[0]?.task).toBe('daily')
  expect(foreign).toEqual([])
  expect(errors).toEqual([])
})
