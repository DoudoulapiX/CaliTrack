/** Le texte affiché garde une espace insécable avant « : ; ! ? % » (jamais de signe seul en début de ligne). */
export function expectFrenchSpacing(): void {
  expect(document.body.textContent).not.toMatch(/ [:;!?%»]/)
}
