import { useEffect, useSyncExternalStore } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useSettings } from '@/app/data-context'
import { db } from '@/db/db'
import { lastOuraSync, syncOura, type OuraSyncResult } from '@/db/oura'
import type { OuraDay, Secret } from '@/db/types'
import { today as todayISO } from '@/lib/dates'
import { ouraConnection, type OuraConnection } from './oura-view'

/** Les données ont plus d'une heure : on les relit à l'ouverture de l'accueil ou des réglages. */
const FRESH_MS = 60 * 60 * 1000

/* Une seule synchronisation à la fois, pour toute l'appli, et son état pour l'affichage. */
let running: Promise<OuraSyncResult> | null = null
let lastAutoAttempt = 0
const listeners = new Set<() => void>()

function setRunning(promise: Promise<OuraSyncResult> | null) {
  running = promise
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const isSyncing = () => running !== null

/** Lance la synchronisation (ou rejoint celle en cours). */
export function syncOuraNow(): Promise<OuraSyncResult> {
  if (running) return running
  const promise = syncOura().finally(() => {
    setRunning(null)
  })
  setRunning(promise)
  return promise
}

/** Synchronise si les données datent, au plus une tentative automatique par heure. */
function autoSync(lastSync: string | null, now: number) {
  if (lastSync !== null && now - Date.parse(lastSync) < FRESH_MS) return
  if (now - lastAutoAttempt < FRESH_MS) return
  lastAutoAttempt = now
  void syncOuraNow()
}

/** Pour les tests : oublie la dernière tentative automatique. */
export function resetOuraAutoSync(): void {
  lastAutoAttempt = 0
}

export function useOuraSyncing(): boolean {
  return useSyncExternalStore(subscribe, isSyncing, isSyncing)
}

export interface OuraStatus {
  connection: OuraConnection
  secret: Secret | undefined
  lastSync: string | null
  /** La journée la plus récente, jusqu'à aujourd'hui. */
  latest: OuraDay | undefined
}

/** L'état de la connexion à Oura et les dernières données ; undefined pendant la lecture. */
export function useOura(): OuraStatus | undefined {
  const { ouraClientId, ouraRelayUrl } = useSettings()
  return useLiveQuery(async () => {
    const [secret, lastSync, latest] = await Promise.all([
      db.secrets.get('oura'),
      lastOuraSync(),
      db.ouraDays.where('date').belowOrEqual(todayISO()).last(),
    ])
    const connection = ouraConnection({ ouraClientId, ouraRelayUrl }, secret, new Date())
    return { connection, secret, lastSync, latest }
  }, [ouraClientId, ouraRelayUrl])
}

/** Relit les données Oura en arrière-plan quand la bague est connectée et que les données datent. */
export function useOuraAutoSync(status: OuraStatus | undefined): void {
  const connected = status?.connection === 'connected'
  const lastSync = status?.lastSync ?? null
  useEffect(() => {
    if (connected) autoSync(lastSync, Date.now())
  }, [connected, lastSync])
}
