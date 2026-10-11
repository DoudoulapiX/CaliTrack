/** Espace insécable (entre un nombre et son unité, avant « : ; ! ? % »). */
export const NBSP = '\u00a0'

/** Espaces insécables de la typographie française : avant « : ; ! ? % » et après « (évite un signe seul en début de ligne). */
export function frenchSpacing(text: string): string {
  return text.replace(/ ([:;!?%»])/g, `${NBSP}$1`).replace(/« /g, `«${NBSP}`)
}

/**
 * Garde un groupe de mots sur une même ligne (« 1 h 30 », « À fond ») : ses espaces deviennent
 * insécables (un tiret reste, lui, un endroit où la ligne peut se couper).
 */
export function keepTogether(text: string): string {
  return text.replace(/ /g, NBSP)
}

/** Énumération à la française : « a », « a et b », « a, b et c ». */
export function joinFrench(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} et ${items[items.length - 1] ?? ''}`
}

/**
 * Met un nom en minuscule au milieu d'une phrase (« Pompes archer » → « pompes archer ») sans
 * abîmer les sigles ni les noms comme « L-sit » ou « TRX ».
 */
export function lowerFirst(text: string): string {
  const [first, second] = text
  if (
    first === undefined ||
    second === undefined ||
    second.toLowerCase() !== second ||
    second.toUpperCase() === second
  ) {
    return text
  }
  return first.toLowerCase() + text.slice(1)
}
