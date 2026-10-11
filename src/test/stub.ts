/** Remplace une propriété du navigateur le temps d'un test (à retirer ensuite avec Reflect.deleteProperty). */
export function stubProperty(target: object, key: string, value: unknown): void {
  Object.defineProperty(target, key, { configurable: true, writable: true, value })
}
