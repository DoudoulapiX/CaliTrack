/** Réponses enregistrées du coach IA, pour l'API Claude simulée (voir fakeClaude). */

/** Le coach allège la séance : une série de moins sur le créneau slot-1 (à adapter au programme du test). */
export const DAILY_LIGHTER = {
  decision: 'lighter',
  headline: 'Séance allégée',
  summary: 'Ta nuit a été courte : garde la séance, avec un peu moins de volume.',
  tips: ['Allonge l’échauffement de cinq minutes.', 'Couche-toi tôt ce soir.'],
  changes: [
    {
      slotId: 'slot-1',
      action: 'lighter',
      exerciseId: 'pullup',
      sets: 3,
      loadKg: null,
      reason: 'Nuit courte : une série de moins.',
    },
  ],
}

/** Le coach conseille le repos. */
export const DAILY_REST = {
  decision: 'rest',
  headline: 'Repos conseillé',
  summary: 'Tes courbatures sont fortes : une journée de repos te fera progresser plus vite.',
  tips: ['Marche vingt minutes pour récupérer.'],
  changes: [],
}

/** Les conseils du coach un jour sans séance. */
export const DAILY_TIPS = {
  decision: '',
  headline: 'Conseils du jour',
  summary: 'Pas de séance aujourd’hui : profites-en pour bien manger et bien dormir.',
  tips: ['Vise tes protéines du jour.', 'Étire tes avant-bras après l’escalade.'],
  changes: [],
}

/** L'analyse physique : Claude conseille une sèche alors que la masse grasse est déjà basse (8 à 11 %). */
export const BODY_CUT_LEAN = {
  readable: true,
  problem: '',
  phase: 'cut',
  bodyFatLow: 8,
  bodyFatHigh: 11,
  summary: 'Silhouette sèche et musclée.',
  observations: ['Abdominaux bien visibles.', 'Épaules et dos développés.'],
  advice: ['Garde tes protéines hautes.'],
}

/** Ce que Claude lit sur une photo de frigo (7 aliments). */
export const FRIDGE_ITEMS = {
  readable: true,
  problem: '',
  items: [
    { name: 'Œufs', quantity: '6' },
    { name: 'Lait demi-écrémé', quantity: '1 L' },
    { name: 'Yaourts nature', quantity: '4' },
    { name: 'Tomates', quantity: '3' },
    { name: 'Courgette', quantity: '1' },
    { name: 'Emmental râpé', quantity: '1 sachet' },
    { name: 'Blanc de poulet', quantity: '2 filets' },
  ],
}

/** Les idées de repas du coach (une recette avec ce qu'il y a dans le frigo, une autre avec un achat). */
export const IDEAS = {
  ideas: [
    {
      title: 'Omelette aux courgettes',
      why: 'Riche en protéines, prête en un quart d’heure.',
      minutes: 15,
      steps: ['Coupe la courgette en dés.', 'Fais-la revenir, puis ajoute les œufs battus.'],
      items: [
        { name: 'Œufs', grams: 180, kcal: 257, protein: 22.6, carbs: 1.3, fat: 17.8, fromPantry: true },
        { name: 'Courgette', grams: 200, kcal: 34, protein: 2.4, carbs: 6.2, fat: 0.6, fromPantry: true },
      ],
    },
    {
      title: 'Poulet, riz et tomates',
      why: 'Des glucides pour récupérer de ta séance.',
      minutes: 25,
      steps: ['Fais cuire le riz.', 'Saisis le poulet, puis ajoute les tomates.'],
      items: [
        {
          name: 'Blanc de poulet',
          grams: 150,
          kcal: 248,
          protein: 46.5,
          carbs: 0,
          fat: 5.4,
          fromPantry: true,
        },
        {
          name: 'Riz blanc cuit',
          grams: 180,
          kcal: 234,
          protein: 4.9,
          carbs: 51.8,
          fat: 0.5,
          fromPantry: false,
        },
        { name: 'Tomates', grams: 150, kcal: 27, protein: 1.2, carbs: 4.2, fat: 0.3, fromPantry: true },
      ],
    },
  ],
}

/** Une réponse du coach dans la discussion. */
export const CHAT_ANSWER =
  'Pour progresser sur les tractions, garde trois séances par semaine et ajoute une série tous les quinze jours.'
