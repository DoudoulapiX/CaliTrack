type ClassValue = string | false | null | undefined | 0

/** Assemble des classes CSS en ignorant les valeurs vides. */
export function cn(...values: ClassValue[]): string {
  return values.filter(Boolean).join(' ')
}
