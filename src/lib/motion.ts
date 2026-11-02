/** Vrai si l'iPhone demande de réduire les animations (Réglages › Accessibilité › Mouvement). */
export function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/** Animations CSS d'un élément, déjà créées dès le calcul des styles (vide là où Web Animations manque). */
export function cssAnimations(element: Element, name: string): Animation[] {
  const animations = (element as Partial<Pick<Element, 'getAnimations'>>).getAnimations?.() ?? []
  return animations.filter((animation) => 'animationName' in animation && animation.animationName === name)
}
