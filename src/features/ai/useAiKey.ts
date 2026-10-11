import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/db'
import { validSecret } from '@/db/secrets'

/** La clé Claude enregistrée sur cet appareil : null s'il n'y en a pas, undefined pendant la lecture. */
export function useAiKey(): string | null | undefined {
  return useLiveQuery(async () => validSecret(await db.secrets.get('anthropic')), [])
}
