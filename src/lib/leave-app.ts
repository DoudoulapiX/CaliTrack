/** Quitte l'appli pour une autre adresse (la page d'autorisation d'Oura). */
export function leaveApp(url: string): void {
  window.location.assign(url)
}
