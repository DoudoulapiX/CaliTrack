import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { CHAT_ANSWER } from './coach-fixtures'
import { CLAUDE_KEY, collectErrors, fakeClaude, onboard, type SentToClaude } from './nutrition-helpers'

// Sous WebKit, page.route ne voit pas les requêtes d'une page que le service worker contrôle : Claude
// simulé exige de le bloquer.
test.use({ serviceWorkers: 'block' })

/** La seconde réponse du coach (la première est CHAT_ANSWER). */
const SECOND_ANSWER = 'Oui : grimpe le samedi et garde le dimanche pour récupérer.'

interface ChatBody {
  stream?: boolean
  system: { text: string; cache_control?: unknown }[]
  messages: { role: string; content: unknown }[]
}

const chatRequests = (sent: SentToClaude[]) =>
  sent.filter((request) => request.task === 'chat').map((request) => request.body as ChatBody)

/** Attend la fin des transitions en cours (comme e2e/a11y.spec.ts). */
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

/** Le champ du message touche le bas de l'écran, quelle que soit la longueur de la discussion. */
async function expectComposerAtBottom(page: Page) {
  const box = await page.locator('form', { has: page.getByLabel('Ton message') }).boundingBox()
  const height = page.viewportSize()?.height ?? 0
  expect(box).not.toBeNull()
  expect(Math.abs((box?.y ?? 0) + (box?.height ?? 0) - height)).toBeLessThan(1)
}

test('discussion avec le coach : réponse en flux, gardée après un rechargement', async ({ page }) => {
  const errors = collectErrors(page)
  const hosts = new Set<string>()
  page.on('request', (request) => hosts.add(new URL(request.url()).host))
  await page.clock.setFixedTime(new Date('2026-10-21T12:30:00+02:00'))
  const sent = await fakeClaude(page, {
    chat: (body: unknown) => ((body as ChatBody).messages.length === 1 ? CHAT_ANSWER : SECOND_ANSWER),
  })
  await onboard(page)

  await page.goto('more/ai')
  await page.getByLabel('Clé API Claude').fill(CLAUDE_KEY)
  await page.getByRole('button', { name: 'Enregistrer la clé' }).click()
  await expect(page.getByText('sk-ant-…ghij')).toBeVisible()

  // Plein écran, sans appel à Claude à l'ouverture ; une suggestion remplit le message sans l'envoyer.
  await page.goto('more/coach')
  await expect(page.getByRole('heading', { name: 'Discussion avec le coach', level: 1 })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toHaveCount(0)
  await expect(page.getByText('Pose ta question au coach')).toBeVisible()
  await expectComposerAtBottom(page)
  await expectAccessible(page, 'discussion vide')
  await page.getByRole('button', { name: /^Comment progresser sur les tractions\s\?$/ }).click()
  await expect(page.getByLabel('Ton message')).toHaveValue('Comment progresser sur les tractions\u00a0?')
  expect(chatRequests(sent)).toHaveLength(0)

  await page.getByRole('button', { name: 'Envoyer' }).click()
  await expect(page.getByText(CHAT_ANSWER)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Envoyer' })).toBeVisible()
  await expect(page.getByLabel('Ton message')).toHaveValue('')
  const [first] = chatRequests(sent)
  expect(first?.stream).toBe(true)
  expect(first?.messages).toEqual([{ role: 'user', content: 'Comment progresser sur les tractions ?' }])
  expect(first?.system[1]?.text).toMatch(/^<donnees>/)
  expect(first?.system[1]?.cache_control).toEqual({ type: 'ephemeral' })
  expect(sent.find((request) => request.task === 'chat')?.key).toBe(CLAUDE_KEY)

  // La discussion, accessible dans les deux thèmes.
  await expectAccessible(page, 'discussion sombre')
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await expectAccessible(page, 'discussion claire')

  // Gardée sur l'iPhone : elle revient après un rechargement, et la question suivante la relit.
  await page.reload()
  const thread = page.getByRole('listitem')
  await expect(thread).toHaveCount(2)
  await expect(thread.first()).toContainText('Comment progresser sur les tractions')
  await expect(thread.last()).toContainText(CHAT_ANSWER)
  await page.evaluate(() => {
    window.scrollTo(0, 0)
  })
  await expectComposerAtBottom(page)

  await page.getByLabel('Ton message').fill('Et si je grimpe le samedi ?')
  await page.getByRole('button', { name: 'Envoyer' }).click()
  await expect(
    page.getByText(/^Oui\s: grimpe le samedi et garde le dimanche pour récupérer\.$/),
  ).toBeVisible()
  await expect(thread).toHaveCount(4)
  const second = chatRequests(sent)[1]
  expect(second?.messages).toEqual([
    { role: 'user', content: 'Comment progresser sur les tractions ?' },
    { role: 'assistant', content: CHAT_ANSWER },
    { role: 'user', content: 'Et si je grimpe le samedi ?' },
  ])
  expect(JSON.stringify(second?.system)).toBe(JSON.stringify(first?.system))
  expect(chatRequests(sent)).toHaveLength(2)

  const appHost = new URL(page.url()).host
  expect([...hosts].filter((host) => host !== appHost && host !== 'api.anthropic.com')).toEqual([])
  expect(errors).toEqual([])
})

test('discussion avec le coach : arrêter remet la question, sans rien garder ni renvoyer', async ({
  page,
}) => {
  const errors = collectErrors(page)
  await page.clock.setFixedTime(new Date('2026-10-21T12:30:00+02:00'))
  await fakeClaude(page)
  // Claude ne répond jamais : la question reste en attente jusqu'à l'arrêt.
  const asked: string[] = []
  await page.route('https://api.anthropic.com/v1/messages', (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    asked.push(route.request().url())
    return undefined
  })
  await onboard(page)
  await page.goto('more/ai')
  await page.getByLabel('Clé API Claude').fill(CLAUDE_KEY)
  await page.getByRole('button', { name: 'Enregistrer la clé' }).click()
  await expect(page.getByText('sk-ant-…ghij')).toBeVisible()

  await page.goto('more/coach')
  await page.getByLabel('Ton message').fill('Combien de séries ?')
  await page.getByRole('button', { name: 'Envoyer' }).click()
  await expect(page.getByText('Le coach écrit…')).toBeVisible()
  await expect.poll(() => asked.length).toBe(1)

  await page.getByRole('button', { name: 'Arrêter' }).click()
  await expect(page.getByRole('button', { name: 'Envoyer' })).toBeEnabled()
  await expect(page.getByLabel('Ton message')).toHaveValue('Combien de séries ?')
  await expect(page.getByText('Le coach écrit…')).toHaveCount(0)
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.getByText('Pose ta question au coach')).toBeVisible()
  // Le bouton « Envoyer » qui prend la place d'« Arrêter » ne renvoie pas la question dans le même clic.
  await page.waitForTimeout(500)
  expect(asked).toHaveLength(1)

  // Rien n'a été gardé.
  await page.reload()
  await expect(page.getByText('Pose ta question au coach')).toBeVisible()
  await expect(page.getByRole('listitem').filter({ hasText: 'Combien de séries' })).toHaveCount(0)
  expect(errors).toEqual([])
})
