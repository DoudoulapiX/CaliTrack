import { resetDb } from '@/test/db'
import { collectBackup, resetAllData, restoreBackup, serializeBackup } from './backup'
import { db } from './db'
import { deleteSecret, saveSecret, validSecret } from './secrets'

describe('secrets', () => {
  beforeEach(resetDb)

  it('enregistre, remplace et supprime une clé', async () => {
    await saveSecret('anthropic', '  sk-ant-une  ')
    expect(await db.secrets.get('anthropic')).toMatchObject({ value: 'sk-ant-une', expiresAt: null })
    await saveSecret('anthropic', 'sk-ant-deux')
    expect(validSecret(await db.secrets.get('anthropic'))).toBe('sk-ant-deux')
    await deleteSecret('anthropic')
    expect(validSecret(await db.secrets.get('anthropic'))).toBeNull()
  })

  it('ignore un jeton expiré ou vide', () => {
    const token = {
      id: 'oura' as const,
      value: 'jeton',
      expiresAt: '2026-11-20T10:00:00.000Z',
      updatedAt: '',
    }
    expect(validSecret(token, new Date('2026-11-20T09:59:00.000Z'))).toBe('jeton')
    expect(validSecret(token, new Date('2026-11-20T10:00:00.000Z'))).toBeNull()
    expect(validSecret({ ...token, value: '', expiresAt: null })).toBeNull()
  })

  it('reste hors des sauvegardes, survit à une restauration et part avec « Tout effacer »', async () => {
    await saveSecret('anthropic', 'sk-ant-secret')
    const backup = await collectBackup()
    expect(serializeBackup(backup)).not.toContain('sk-ant-secret')
    await restoreBackup(backup)
    expect(validSecret(await db.secrets.get('anthropic'))).toBe('sk-ant-secret')
    await resetAllData()
    expect(await db.secrets.count()).toBe(0)
  })
})
