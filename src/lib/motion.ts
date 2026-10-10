/** Vrai si l'iPhone demande de réduire les animations (Réglages › Accessibilité › Mouvement). */
export function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}
