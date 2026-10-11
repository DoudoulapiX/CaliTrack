/** Ce que répond le relais à `/ping` : la preuve que c'est bien celui de CaliTrack. */
export const RELAY_ID = 'calitrack-relais-oura'

/**
 * Le relais Oura : un petit programme gratuit (Cloudflare Worker) que l'utilisateur crée une fois. Oura
 * n'autorise pas les navigateurs à lire ses données directement ; le relais transmet les lectures (GET)
 * à l'API Oura, pour la seule adresse de l'appli, sans rien garder.
 *
 * Le code est produit ici, avec l'adresse de l'appli, pour être copié tel quel dans Cloudflare.
 */
export function relayWorkerCode(appOrigin: string): string {
  return `// Relais CaliTrack → Oura. Transmet les lectures de données à l'API Oura, sans rien garder.
const APP_ORIGIN = ${JSON.stringify(appOrigin)}
const OURA_API = 'https://api.ouraring.com'
const RELAY_ID = ${JSON.stringify(RELAY_ID)}

export default {
  async fetch(request) {
    const cors = {
      'Access-Control-Allow-Origin': APP_ORIGIN,
      'Access-Control-Allow-Headers': 'Authorization',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    }
    if (request.headers.get('Origin') !== APP_ORIGIN) {
      return new Response('Origine refusée', { status: 403 })
    }
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
    const url = new URL(request.url)
    if (request.method === 'GET' && url.pathname === '/ping') {
      return new Response(RELAY_ID, { status: 200, headers: cors })
    }
    if (request.method !== 'GET' || !url.pathname.startsWith('/v2/usercollection/')) {
      return new Response('Demande refusée', { status: 404, headers: cors })
    }
    const answer = await fetch(OURA_API + url.pathname + url.search, {
      headers: { Authorization: request.headers.get('Authorization') ?? '' },
    })
    const headers = new Headers(cors)
    headers.set('Content-Type', answer.headers.get('Content-Type') ?? 'application/json')
    return new Response(answer.body, { status: answer.status, headers })
  },
}
`
}
