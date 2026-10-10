import { nowISO } from '@/lib/dates'
import { db } from './db'
import type { AppSettings, Profile } from './types'

export type SettingsPatch = Partial<Omit<AppSettings, 'id' | 'createdAt' | 'updatedAt'>>
export type ProfilePatch = Partial<Omit<Profile, 'id' | 'createdAt' | 'updatedAt'>>

export async function updateSettings(patch: SettingsPatch): Promise<void> {
  await db.settings.update('app', { ...patch, updatedAt: nowISO() })
}

export async function updateProfile(patch: ProfilePatch): Promise<void> {
  await db.profile.update('me', { ...patch, updatedAt: nowISO() })
}
