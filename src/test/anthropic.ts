/** Réponses de l'API Claude enregistrées, pour tester sans réseau ni clé. */

export interface RecordedRequest {
  url: string
  headers: Headers
  body: unknown
}

/** Une réponse de l'API Messages dont le texte est `output` (sortie structurée). */
export function messageResponse(
  output: unknown,
  stopReason: 'end_turn' | 'refusal' | 'max_tokens' = 'end_turn',
): Response {
  const body = {
    id: 'msg_01Test',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5-5',
    content: stopReason === 'refusal' ? [] : [{ type: 'text', text: JSON.stringify(output) }],
    stop_reason: stopReason,
    stop_sequence: null,
    usage: { input_tokens: 1850, output_tokens: 420 },
  }
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
}

/** Une erreur de l'API (`authentication_error`, `billing_error`…), sans nouvel essai. */
export function errorResponse(status: number, type: string, message = 'Erreur de test'): Response {
  return new Response(JSON.stringify({ type: 'error', error: { type, message }, request_id: 'req_test' }), {
    status,
    // Pas de nouvel essai : le client réessaie seulement si le serveur ne l'interdit pas.
    headers: { 'content-type': 'application/json', 'x-should-retry': 'false' },
  })
}

/** Un `fetch` qui répond dans l'ordre (une erreur = pas de réseau) et note chaque requête. */
export function fakeAnthropicFetch(...answers: (Response | Error)[]) {
  const requests: RecordedRequest[] = []
  const fetchImpl = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = input instanceof Request ? input.url : String(input)
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : null
    requests.push({ url, headers: new Headers(init?.headers), body })
    const answer = answers.shift()
    if (answer === undefined) return Promise.reject(new Error('Aucune réponse prévue'))
    return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer)
  }
  return { fetchImpl, requests }
}

/** L'estimation de Claude pour une assiette de poulet, riz et haricots verts. */
export const PLATE_ESTIMATE = {
  isMeal: true,
  problem: '',
  items: [
    { name: 'Blanc de poulet grillé', grams: 150, kcal: 248, protein: 46.5, carbs: 0, fat: 5.4 },
    { name: 'Riz blanc cuit', grams: 180, kcal: 234, protein: 4.9, carbs: 51.8, fat: 0.5 },
    { name: 'Haricots verts', grams: 100, kcal: 31, protein: 1.8, carbs: 4.2, fat: 0.2 },
  ],
}
