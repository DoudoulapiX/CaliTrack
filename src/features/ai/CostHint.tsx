import { useSettings } from '@/app/data-context'
import { actionCost, type AiAction } from '@/content/ai/cost'
import { aiModelOption } from '@/content/ai/models'
import { costHintText } from './ai-view'

/** Le prix d'une demande ordinaire, sous le bouton qui la lance (avant de la faire). */
export function CostHint({ action }: { action: AiAction }) {
  const settings = useSettings()
  const option = aiModelOption(settings.aiModel)
  return (
    <p className="mt-2 px-1 text-[13px] text-ink-3">
      {costHintText(actionCost(action, settings.aiModel), option.label)}
    </p>
  )
}
