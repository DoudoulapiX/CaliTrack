import { figureFor } from '@/content/figures/library'
import { renderFigureSvg } from '@/content/figures/render'

/** Adresse d'une photo de démonstration (public/ex). */
export function exerciseImageUrl(frame: string): string {
  return `${import.meta.env.BASE_URL}ex/${frame}`
}

const thumbCache = new Map<string, string>()

/** Silhouette immobile d'un exercice, pour les vignettes (calculée une seule fois). */
export function figureThumbSvg(figureId: string | null): string | null {
  if (!figureId) return null
  const cached = thumbCache.get(figureId)
  if (cached !== undefined) return cached
  const anim = figureFor(figureId)
  if (!anim) return null
  const svg = renderFigureSvg(anim, { animate: false, fit: true })
  thumbCache.set(figureId, svg)
  return svg
}
