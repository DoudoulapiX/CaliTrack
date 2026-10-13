import type { AiProblem } from '@/content/ai/client'
import { Button, ButtonLink } from '@/ui/Button'
import { AI_SETTINGS_PATH, canRetry, needsAiSettings, problemText, type AiTask } from './ai-view'

/**
 * Ce qui a empêché Claude de répondre, avec la suite possible : réessayer (problème passager) ou ouvrir
 * les réglages de l'IA (clé ou modèle refusés).
 */
export function AiProblemNote({
  problem,
  task,
  onRetry,
}: {
  problem: AiProblem
  task: AiTask
  /** Relance la demande ; sans elle, pas de bouton « Réessayer ». */
  onRetry?: () => void
}) {
  const retry = onRetry && canRetry(problem)
  const settings = needsAiSettings(problem)
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-surface px-5 py-5">
      <p role="alert" className="text-[15px] text-ink-2">
        {problemText(problem, task)}
      </p>
      {(retry || settings) && (
        <div className="flex flex-col gap-2">
          {retry && (
            <Button block onClick={onRetry}>
              Réessayer
            </Button>
          )}
          {settings && (
            <ButtonLink block variant={retry ? 'secondary' : 'primary'} to={AI_SETTINGS_PATH}>
              Réglages de l’IA
            </ButtonLink>
          )}
        </div>
      )}
    </div>
  )
}
