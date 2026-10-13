/**
 * La valeur reçue si elle fait partie des choix permis, sinon la valeur de repli. Les sorties de Claude
 * sont lues avec des schémas souples (une chaîne, jamais z.enum) puis ramenées ici aux choix permis.
 *
 * Ce module n'importe rien : la carte de la séance du jour s'en sert sans charger le SDK de Claude.
 */
export function choice<T extends string>(value: string, options: readonly T[], fallback: T): T {
  return (options as readonly string[]).includes(value) ? (value as T) : fallback
}
