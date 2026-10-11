import { createContext, useContext } from 'react'
import type { AppSettings, Profile } from '@/db/types'

export const SettingsContext = createContext<AppSettings | null>(null)
export const ProfileContext = createContext<Profile | null>(null)

export function useSettings(): AppSettings {
  const settings = useContext(SettingsContext)
  if (!settings) throw new Error('useSettings doit être utilisé dans DataProvider')
  return settings
}

export function useProfile(): Profile {
  const profile = useContext(ProfileContext)
  if (!profile) throw new Error('useProfile doit être utilisé dans DataProvider')
  return profile
}
