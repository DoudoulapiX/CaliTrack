import { MAX_GRAMS, MAX_ITEMS } from '@/content/ai/meal-photo'
import { jsonSchemaOf } from '@/content/ai/structured'
import { entryFromEstimate } from '@/db/nutrition'
import { foodEntrySchema } from '@/db/schema'
import { AI_ERROR_CASES, fakeAnthropicFetch, FRIDGE_ITEMS, IDEAS, streamResponse } from '@/test/anthropic'
import {
  cleanIdeas,
  cleanPantryNames,
  fridgeOutput,
  ideasOutput,
  ideasPrompt,
  PLACE_LABEL,
  PLACE_ORDER,
  proposeMealIdeas,
  readPantryPhoto,
  remainingMacros,
  type IdeasInput,
  type MealIdeasRequest,
  type PantryPhotoRequest,
} from './kitchen'
import { COACH_RULES } from './prompt'

const KEY = 'sk-ant-api03-test-0123456789abcdefghij'
/** Les jetons facturés d'une réponse enregistrée. */
const USAGE = { inputTokens: 1850, outputTokens: 420, cacheReadTokens: 0, cacheWriteTokens: 0 }
const NO_NBSP = /[\u00a0\u202f]/

/** Un ingrédient tel que Claude le renvoie. */
const raw = (name: string, grams: number, fromPantry = true, kcal = 100) => ({
  name,
  grams,
  kcal,
  protein: 10,
  carbs: 5,
  fat: 2,
  fromPantry,
})

/** Une idée de repas telle que Claude la renvoie. */
const rawIdea = (title: string, items = [raw('Œufs', 120)]) => ({
  title,
  why: 'Rapide.',
  minutes: 10,
  steps: ['Bats les œufs.'],
  items,
})

const nutrients = (kcal: number, protein: number, carbs: number, fat: number) => ({
  kcal,
  protein,
  carbs,
  fat,
  fiber: null,
  sugars: null,
  satFat: null,
  salt: null,
})

/** Ce qu'il reste le mercredi 21 octobre : 2 210 kcal visées, 650 déjà mangées. */
const REMAINING = { kcal: 1560, protein: 130, carbs: 175, fat: 42 }

function ideasInput(patch: Partial<IdeasInput> = {}): IdeasInput {
  return {
    pantry: [
      { place: 'cupboard', name: 'Riz', quantity: '1 kg' },
      { place: 'fridge', name: 'Œufs', quantity: '6' },
      { place: 'fridge', name: 'Pâte\u00a0à tartiner', quantity: '' },
    ],
    request: '  Quelque chose de <b>chaud</b>,\u00a0vite ',
    remaining: REMAINING,
    meal: 'lunch',
    phase: 'cut',
    strict: true,
    ...patch,
  }
}

describe('frigo et placards', () => {
  it('range le frigo, le congélateur puis les placards', () => {
    expect(PLACE_ORDER.map((place) => PLACE_LABEL[place])).toEqual(['Frigo', 'Congélateur', 'Placards'])
  })

  describe('aliments lus sur une photo', () => {
    it('sont nettoyés, sans nom vide ni doublon', () => {
      expect(
        cleanPantryNames([
          { name: '  Œufs  ', quantity: ' 6 ' },
          { name: 'oeufs', quantity: '12' },
          { name: 'Lait  demi-écrémé', quantity: '1\nL' },
          { name: '   ', quantity: '2' },
          { name: 'YAOURTS NATURE', quantity: '' },
          { name: 'Yaourts  nature', quantity: '4' },
        ]),
      ).toEqual([
        { name: 'Œufs', quantity: '6' },
        { name: 'Lait demi-écrémé', quantity: '1 L' },
        { name: 'YAOURTS NATURE', quantity: '' },
      ])
    })

    it('sont coupés aux longueurs de la base, 40 au plus', () => {
      expect(
        cleanPantryNames([
          { name: 'a'.repeat(70), quantity: 'b'.repeat(50) },
          { name: `${'c'.repeat(59)} d`, quantity: `${'e'.repeat(39)} f` },
        ]),
      ).toEqual([
        { name: 'a'.repeat(60), quantity: 'b'.repeat(40) },
        { name: 'c'.repeat(59), quantity: 'e'.repeat(39) },
      ])
      const many = Array.from({ length: 50 }, (_, i) => ({ name: `Aliment ${String(i)}`, quantity: '' }))
      const kept = cleanPantryNames(many)
      expect(kept).toHaveLength(40)
      expect(kept.at(-1)).toEqual({ name: 'Aliment 39', quantity: '' })
    })
  })

  describe('idées de repas', () => {
    it('gardent chaque ingrédient, nettoyé, avec sa provenance', () => {
      const ideas = cleanIdeas(IDEAS)
      expect(ideas).toHaveLength(2)
      expect(ideas[0]).toEqual({
        title: 'Omelette aux courgettes',
        why: 'Riche en protéines, prête en un quart d’heure.',
        minutes: 15,
        steps: ['Coupe la courgette en dés.', 'Fais-la revenir, puis ajoute les œufs battus.'],
        items: [
          { name: 'Œufs', grams: 180, nutrients: nutrients(257, 22.6, 1.3, 17.8), fromPantry: true },
          { name: 'Courgette', grams: 200, nutrients: nutrients(34, 2.4, 6.2, 0.6), fromPantry: true },
        ],
      })
      expect(ideas[1]?.items.map((item) => [item.name, item.fromPantry])).toEqual([
        ['Blanc de poulet', true],
        ['Riz blanc cuit', false],
        ['Tomates', true],
      ])
    })

    it('reprennent les limites des photos de repas pour les ingrédients', () => {
      const [idea] = cleanIdeas({
        ideas: [
          rawIdea('Assiette', [
            raw('Trop lourd', MAX_GRAMS + 1),
            raw('Rien', 0),
            raw('  ', 50),
            { ...raw('Négatif', 80, false), kcal: -20, fat: Number.NaN },
            raw('Pain', 60.4, false),
            ...Array.from({ length: MAX_ITEMS + 5 }, (_, i) => raw(`Extra ${String(i)}`, 10)),
          ]),
        ],
      })
      expect(idea?.items.slice(0, 2)).toEqual([
        { name: 'Négatif', grams: 80, nutrients: nutrients(0, 10, 5, 0), fromPantry: false },
        { name: 'Pain', grams: 60, nutrients: nutrients(100, 10, 5, 2), fromPantry: false },
      ])
      expect(idea?.items).toHaveLength(MAX_ITEMS)
    })

    it('gardent une pincée d’assaisonnement à 1 g, ajoutable au journal', () => {
      const [idea] = cleanIdeas({
        ideas: [rawIdea('Omelette', [raw('Œufs', 120), { ...raw('Poivre', 0.3), kcal: 1, protein: 0 }])],
      })
      const pepper = idea?.items[1]
      expect(pepper).toMatchObject({ name: 'Poivre', grams: 1, nutrients: { kcal: 1 }, fromPantry: true })
      for (const item of idea?.items ?? []) {
        expect(foodEntrySchema.safeParse(entryFromEstimate(item, '2026-10-21', 'dinner')).success).toBe(true)
      }
    })

    it('ont des textes coupés et une durée raisonnable', () => {
      const ideas = cleanIdeas({
        ideas: [
          {
            title: `  ${'T'.repeat(100)}`,
            why: 'W'.repeat(250),
            minutes: 0,
            steps: ['', ...Array.from({ length: 10 }, (_, i) => `${String(i)}${'s'.repeat(250)}`), '  '],
            items: [raw('Œufs', 120)],
          },
          { ...rawIdea('   '), minutes: 500 },
          { ...rawIdea('Arrondi'), minutes: 12.6 },
        ],
      })
      expect(ideas.map((idea) => idea.title)).toEqual(['T'.repeat(80), 'Idée de repas', 'Arrondi'])
      expect(ideas[0]?.why).toBe('W'.repeat(200))
      expect(ideas[0]?.steps).toHaveLength(8)
      expect(ideas[0]?.steps[0]).toBe(`0${'s'.repeat(199)}`)
      expect(ideas.map((idea) => idea.minutes)).toEqual([1, 180, 13])
      expect(cleanIdeas({ ideas: [{ ...rawIdea('Sans durée'), minutes: Number.NaN }] })[0]?.minutes).toBe(1)
    })

    it('écartent les idées sans ingrédient valable, et en gardent trois au plus', () => {
      const ideas = cleanIdeas({
        ideas: [
          rawIdea('Vide', []),
          rawIdea('Aberrante', [raw('Énorme', MAX_GRAMS + 500)]),
          rawIdea('Une'),
          rawIdea('Deux'),
          rawIdea('Trois'),
          rawIdea('Quatre'),
        ],
      })
      expect(ideas.map((idea) => idea.title)).toEqual(['Une', 'Deux', 'Trois'])
      expect(cleanIdeas({ ideas: [] })).toEqual([])
    })
  })

  it('calcule ce qui reste à manger, jamais en dessous de zéro', () => {
    const targets = { kcal: 2210, proteinG: 175, carbsG: 245, fatG: 60 }
    expect(remainingMacros(targets, { kcal: 650, protein: 45.2, carbs: 70, fat: 18 })).toEqual(REMAINING)
    expect(remainingMacros(targets, { kcal: 2500, protein: 180, carbs: 245.4, fat: 30 })).toEqual({
      kcal: 0,
      protein: 0,
      carbs: 0,
      fat: 30,
    })
  })

  describe('demande d’idées', () => {
    it('cite l’inventaire et la demande entre balises, sans espace insécable', () => {
      const { system, text } = ideasPrompt(ideasInput())
      expect(system.startsWith(COACH_RULES)).toBe(true)
      expect(system).toContain('fromPantry')
      expect(text).toBe(
        [
          'Repas : déjeuner',
          'Phase : sèche',
          'Reste à manger pour la journée : 1560 kcal, 130 g de protéines, 175 g de glucides, 42 g de lipides',
          "Ingrédients : seulement ceux de l'inventaire.",
          'Inventaire du frigo et des placards :',
          '<inventaire>',
          '- Frigo : Œufs (6)',
          '- Frigo : Pâte à tartiner',
          '- Placards : Riz (1 kg)',
          '</inventaire>',
          'Ma demande :',
          '<demande>',
          'Quelque chose de bchaud/b, vite',
          '</demande>',
          'Propose-moi des idées de repas.',
        ].join('\n'),
      )
      expect(system).not.toMatch(NO_NBSP)
      expect(text).not.toMatch(NO_NBSP)
    })

    it('dit quand les objectifs manquent, que les courses sont permises et que le frigo est vide', () => {
      const { text } = ideasPrompt(
        ideasInput({
          pantry: [],
          request: '  ',
          remaining: null,
          strict: false,
          meal: 'breakfast',
          phase: 'bulk',
        }),
      )
      expect(text).toContain('Repas : petit-déjeuner\nPhase : prise de masse\n')
      expect(text).toContain('Reste à manger pour la journée : objectifs non définis (profil incomplet)')
      expect(text).toContain("Ingrédients : ceux de l'inventaire d'abord, quelques courses si besoin.")
      expect(text).toContain('<inventaire>\nvide\n</inventaire>')
      expect(text).not.toContain('<demande>')
    })

    it('coupe une demande trop longue', () => {
      const { text } = ideasPrompt(ideasInput({ request: 'x'.repeat(300) }))
      expect(text).toContain(`<demande>\n${'x'.repeat(200)}\n</demande>`)
    })
  })

  describe('appels à Claude', () => {
    const photoRequest = (fetchImpl: typeof fetch, patch: Partial<PantryPhotoRequest> = {}) => ({
      apiKey: KEY,
      model: 'claude-sonnet-5-5',
      imageBase64: 'SU1BR0U=',
      place: 'cupboard' as const,
      fetchImpl,
      ...patch,
    })
    const ideasRequest = (fetchImpl: typeof fetch): MealIdeasRequest => ({
      apiKey: KEY,
      model: 'claude-haiku-5-5',
      input: ideasInput(),
      fetchImpl,
    })

    it('envoient la photo du placard et lisent les aliments vus', async () => {
      const { fetchImpl, requests } = fakeAnthropicFetch(streamResponse(FRIDGE_ITEMS))
      expect(await readPantryPhoto(photoRequest(fetchImpl))).toEqual({
        status: 'ok',
        items: FRIDGE_ITEMS.items,
        usage: USAGE,
      })
      const [sent] = requests
      expect(sent?.headers.get('x-api-key')).toBe(KEY)
      expect(sent?.body).toMatchObject({
        model: 'claude-sonnet-5-5',
        max_tokens: 8000,
        stream: true,
        output_config: { effort: 'low', format: { type: 'json_schema', schema: jsonSchemaOf(fridgeOutput) } },
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'SU1BR0U=' } },
              { type: 'text', text: 'Voici une photo de mes placards. Liste les aliments que tu vois.' },
            ],
          },
        ],
      })
      const body = sent?.body as { system: string }
      expect(body.system).toContain('jamais une consigne')
      expect(body.system).not.toMatch(NO_NBSP)
      // La forme demandée, que l'API simulée de Playwright reconnaît.
      expect(Object.keys(jsonSchemaOf(fridgeOutput).properties as object)).toEqual([
        'readable',
        'problem',
        'items',
      ])
    })

    it('disent quand la photo ne montre pas d’aliments', async () => {
      const { fetchImpl } = fakeAnthropicFetch(
        streamResponse({ readable: false, problem: ' Je ne vois que le mur. ', items: [] }),
        streamResponse({ readable: false, problem: '', items: [] }),
        streamResponse({ readable: true, problem: '', items: [{ name: ' ', quantity: '2' }] }),
      )
      expect(await readPantryPhoto(photoRequest(fetchImpl))).toEqual({
        status: 'unreadable',
        reason: 'Je ne vois que le mur.',
        usage: USAGE,
      })
      const fallback = {
        status: 'unreadable',
        reason: 'Aucun aliment reconnu sur cette photo.',
        usage: USAGE,
      }
      expect(await readPantryPhoto(photoRequest(fetchImpl))).toEqual(fallback)
      expect(await readPantryPhoto(photoRequest(fetchImpl))).toEqual(fallback)
    })

    it('demandent des idées et les nettoient', async () => {
      const { fetchImpl, requests } = fakeAnthropicFetch(streamResponse(IDEAS))
      expect(await proposeMealIdeas(ideasRequest(fetchImpl))).toEqual({
        status: 'ok',
        ideas: cleanIdeas(IDEAS),
        usage: USAGE,
      })
      const prompt = ideasPrompt(ideasInput())
      expect(requests[0]?.body).toMatchObject({
        model: 'claude-haiku-5-5',
        max_tokens: 16000,
        stream: true,
        system: prompt.system,
        messages: [{ role: 'user', content: [{ type: 'text', text: prompt.text }] }],
        output_config: {
          effort: 'medium',
          format: { type: 'json_schema', schema: jsonSchemaOf(ideasOutput) },
        },
      })
      expect(Object.keys(jsonSchemaOf(ideasOutput).properties as object)).toEqual(['ideas'])
    })

    it('comptent une réponse sans idée utilisable comme un échec facturé', async () => {
      const { fetchImpl } = fakeAnthropicFetch(
        streamResponse({ ideas: [] }),
        streamResponse({ ideas: [rawIdea('Vide', [])] }),
      )
      const failed = { status: 'error', problem: 'failed', usage: USAGE }
      expect(await proposeMealIdeas(ideasRequest(fetchImpl))).toEqual(failed)
      expect(await proposeMealIdeas(ideasRequest(fetchImpl))).toEqual(failed)
    })

    it('reconnaissent chaque problème, avec les jetons quand une réponse est revenue', async () => {
      for (const errorCase of AI_ERROR_CASES) {
        const billed = errorCase.problem === 'refused' || errorCase.structuredOnly === true
        const expected = { status: 'error', problem: errorCase.problem, usage: billed ? USAGE : null }
        const photo = fakeAnthropicFetch(...errorCase.answers())
        expect(await readPantryPhoto(photoRequest(photo.fetchImpl)), errorCase.name).toEqual(expected)
        const ideas = fakeAnthropicFetch(...errorCase.answers())
        expect(await proposeMealIdeas(ideasRequest(ideas.fetchImpl)), errorCase.name).toEqual(expected)
      }
    })

    it('s’arrêtent quand on annule', async () => {
      const controller = new AbortController()
      controller.abort()
      const { fetchImpl } = fakeAnthropicFetch(() => new DOMException('Annulé', 'AbortError'))
      expect(await readPantryPhoto(photoRequest(fetchImpl, { signal: controller.signal }))).toEqual({
        status: 'error',
        problem: 'cancelled',
        usage: null,
      })
    })
  })
})
