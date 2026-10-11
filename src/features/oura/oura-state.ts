/**
 * Le `state` de la dernière demande d'accès à Oura, gardé le temps de l'aller-retour. Le stockage peut
 * être indisponible (navigation privée) : on fait alors sans.
 */
const KEY = 'calitrack.oura.state'

export function newOuraState(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function storeOuraState(state: string): void {
  try {
    localStorage.setItem(KEY, state)
  } catch {
    // Stockage indisponible : le lien collé à la main restera accepté.
  }
}

export function storedOuraState(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function clearOuraState(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // Rien à effacer.
  }
}
