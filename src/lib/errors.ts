/**
 * Message à montrer après un échec : nos propres messages (de simples `Error`, écrits en français)
 * tels quels, sinon `fallback` (erreurs techniques de validation, de la base ou du navigateur).
 */
export function userMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.name === 'Error' && error.message !== '' ? error.message : fallback
}
