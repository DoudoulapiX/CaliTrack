import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
import type { AiModel, Nutrients } from '@/db/types'
import { roundNutrients } from '@/content/nutrition/nutrients'
import { aiProblem, createClient, type AiProblem } from './client'

/** Ce que Claude renvoie pour une photo de repas (contrôlé par l'API, puis par zod). */
export const mealPhotoSchema = z.object({
  isMeal: z.boolean().describe('Vrai si la photo montre de la nourriture ou une boisson qu’on peut estimer.'),
  problem: z
    .string()
    .describe('Si isMeal est faux : pourquoi, en une phrase courte en français, tutoiement. Sinon vide.'),
  items: z
    .array(
      z.object({
        name: z.string().describe('Nom de l’aliment en français, court (« Riz blanc cuit »).'),
        grams: z.number().describe('Poids estimé de la portion visible, en grammes.'),
        kcal: z.number().describe('Calories de cette portion.'),
        protein: z.number().describe('Protéines de cette portion, en grammes.'),
        carbs: z.number().describe('Glucides de cette portion, en grammes.'),
        fat: z.number().describe('Lipides de cette portion, en grammes.'),
      }),
    )
    .describe('Un élément par aliment distinct visible ; vide si isMeal est faux.'),
})

const SYSTEM_PROMPT = `Tu estimes les calories d'un repas à partir d'une photo, pour le journal alimentaire d'un sportif.
Repère chaque aliment distinct visible (plat, accompagnement, sauce, boisson) et estime le poids de la portion
en grammes d'après les objets autour (assiette, couverts, main, emballage). Donne pour cette portion les calories,
protéines, glucides et lipides, avec les valeurs de référence françaises (table Ciqual) quand tu les connais.
Compte les matières grasses de cuisson et les sauces visibles. Si l'utilisateur ajoute des précisions, elles
priment sur la photo. Si la photo ne montre pas de nourriture, ou est trop floue ou trop sombre pour estimer,
mets isMeal à faux et explique pourquoi dans problem.`

/** Valeurs maximales retenues, pour écarter une estimation aberrante. */
const MAX_ITEMS = 20
const MAX_GRAMS = 3000

export interface EstimatedItem {
  name: string
  grams: number
  nutrients: Nutrients
}

export type MealPhotoResult =
  | { status: 'ok'; items: EstimatedItem[] }
  | { status: 'notMeal'; reason: string }
  | { status: 'error'; problem: AiProblem }

export interface MealPhotoRequest {
  apiKey: string
  model: AiModel
  /** L'image en JPEG, encodée en base64 (sans le préfixe « data: »). */
  imageBase64: string
  /** Précisions de l'utilisateur (« cuit au beurre, grande assiette »). */
  note: string
  signal?: AbortSignal
  fetchImpl?: typeof fetch
}

const finite = (value: number) => (Number.isFinite(value) && value > 0 ? value : 0)

/** Garde les aliments plausibles, valeurs arrondies, sans nombres négatifs ni portions démesurées. */
export function cleanItems(items: z.infer<typeof mealPhotoSchema>['items']): EstimatedItem[] {
  return items
    .filter((item) => item.name.trim() !== '' && finite(item.grams) > 0 && item.grams <= MAX_GRAMS)
    .slice(0, MAX_ITEMS)
    .map((item) => ({
      name: item.name.trim().slice(0, 120),
      grams: Math.round(item.grams),
      nutrients: roundNutrients({
        kcal: finite(item.kcal),
        protein: finite(item.protein),
        carbs: finite(item.carbs),
        fat: finite(item.fat),
        fiber: null,
        sugars: null,
        satFat: null,
        salt: null,
      }),
    }))
}

/** Demande à Claude les aliments d'une photo de repas et leurs valeurs nutritionnelles. */
export async function estimateMealPhoto(request: MealPhotoRequest): Promise<MealPhotoResult> {
  const note = request.note.trim()
  try {
    const response = await createClient(request.apiKey, request.fetchImpl).messages.parse(
      {
        model: request.model,
        max_tokens: 8000,
        // Peu de réflexion suffit : la précision vient de l'image, et chaque photo coûte moins cher.
        output_config: { effort: 'low', format: zodOutputFormat(mealPhotoSchema) },
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: 'image/jpeg', data: request.imageBase64 },
              },
              {
                type: 'text',
                text: note === '' ? 'Estime ce repas.' : `Estime ce repas. Précisions : ${note}`,
              },
            ],
          },
        ],
      },
      { signal: request.signal },
    )
    if (response.stop_reason === 'refusal') return { status: 'error', problem: 'refused' }
    const parsed = response.parsed_output
    if (response.stop_reason !== 'end_turn' || !parsed) return { status: 'error', problem: 'failed' }
    if (!parsed.isMeal) {
      return { status: 'notMeal', reason: parsed.problem.trim() || 'Aucun aliment reconnu sur cette photo.' }
    }
    const items = cleanItems(parsed.items)
    if (items.length === 0) return { status: 'notMeal', reason: 'Aucun aliment reconnu sur cette photo.' }
    return { status: 'ok', items }
  } catch (error) {
    return { status: 'error', problem: aiProblem(error) }
  }
}
