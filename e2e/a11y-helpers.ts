import AxeBuilder from '@axe-core/playwright'
import { expect, type Page } from '@playwright/test'

/**
 * Attend la fin des transitions et animations en cours (pas de celles qui tournent sans fin). Une pastille
 * qu'on vient de toucher passe du gris à l'orange en 150 ms : ses couleurs intermédiaires, que personne
 * ne lit, ne doivent pas être mesurées.
 */
export async function animationsDone(page: Page) {
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
export async function expectAccessible(page: Page, screen: string) {
  await animationsDone(page)
  const { violations } = await new AxeBuilder({ page }).analyze()
  const summary = violations.flatMap((v) =>
    v.nodes.map((node) => `${screen} : ${v.id} : ${node.target.join(' ')}\n${node.failureSummary ?? ''}`),
  )
  expect(summary).toEqual([])
}
