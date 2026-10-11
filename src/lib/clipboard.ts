/** Copie un texte dans le presse-papiers ; false si le navigateur refuse. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator.clipboard === 'undefined') return false
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
