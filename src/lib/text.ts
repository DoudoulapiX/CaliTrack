/**
 * Nom comparable, pour repérer un doublon : minuscules, sans accents ni ligatures, espaces resserrées
 * (« Œufs  frais » et « oeufs frais » donnent le même nom).
 */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
