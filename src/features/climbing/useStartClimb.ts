import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useSettings } from '@/app/data-context'
import { liveSession } from '@/content/climbing/session'
import { addClimb, ClimbInProgressError } from '@/db/climbing'
import { db } from '@/db/db'
import { nowISO } from '@/lib/dates'
import { userMessage } from '@/lib/errors'
import { newId } from '@/lib/ids'
import { frenchSpacing } from '@/lib/typography'
import { useToast } from '@/ui/toast-context'
import { climbLivePath } from './climb-view'
import { activeScaleOf, sortScales } from './useClimbing'

/** Commence une séance d'escalade maintenant et ouvre son écran (ou rouvre celle déjà en cours). */
export function useStartClimb(): { start: () => void; busy: boolean } {
  const navigate = useNavigate()
  const toast = useToast()
  const settings = useSettings()
  const [busy, setBusy] = useState(false)

  const start = async () => {
    setBusy(true)
    try {
      const scale = activeScaleOf(sortScales(await db.gradeScales.toArray()), settings)
      if (!scale) {
        throw new Error(
          frenchSpacing('Aucune échelle de cotation : ajoutes-en une dans « Couleurs et cotations ».'),
        )
      }
      const session = await addClimb(
        liveSession({ gym: settings.climbingGym, scaleId: scale.id }, nowISO(), newId()),
      )
      void navigate(climbLivePath(session.id))
    } catch (error) {
      if (error instanceof ClimbInProgressError) {
        toast(frenchSpacing('Une séance d’escalade est déjà en cours : la voici.'))
        void navigate(climbLivePath(error.active.id))
      } else {
        toast(userMessage(error, 'Impossible de commencer la séance.'), 'error')
      }
    } finally {
      setBusy(false)
    }
  }

  return { start: () => void start(), busy }
}
