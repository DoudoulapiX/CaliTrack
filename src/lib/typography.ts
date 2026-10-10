const NBSP = '\u00a0'

/** Espaces insécables de la typographie française : avant « : ; ! ? % » et après « (évite un signe seul en début de ligne). */
export function frenchSpacing(text: string): string {
  return text.replace(/ ([:;!?%»])/g, `${NBSP}$1`).replace(/« /g, `«${NBSP}`)
}
