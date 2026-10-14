// GitHub Pages renvoie 404.html pour une adresse inconnue : en copiant index.html,
// un lien direct vers /CaliTrack/calendar ouvre quand même l'appli.
import { copyFile, access, readFile, readdir, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const dist = fileURLToPath(new URL('../dist/', import.meta.url))
await access(`${dist}index.html`)
await copyFile(`${dist}index.html`, `${dist}404.html`)
console.log('dist/404.html créé')

// Précache du service worker : le compteur caméra (MediaPipe et son modèle) doit marcher hors ligne dès
// la première fois, sans que l'appli devienne trop lourde ni appelle Google.
const MIB = 1024 * 1024
/** « 20,1 » : des Mio, à la française. */
const mib = (bytes) => (bytes / MIB).toFixed(1).replace('.', ',')
const POSE_WASM = /^assets\/vision_wasm_internal-[\w-]+\.wasm$/
const REQUIRED = [
  POSE_WASM,
  /^assets\/vision_wasm_internal-[\w-]+\.js$/,
  /^assets\/pose_landmarker_lite-[\w-]+\.task$/,
]
// Seule mention permise : le nom de type protobuf `type.googleapis.com/mediapipe…` de MediaPipe, jamais appelé.
const ALLOWED_GOOGLE = new Set(['type.googleapis.com'])

const sw = await readFile(`${dist}sw.js`, 'utf8')
const urls = [...new Set([...sw.matchAll(/url:"([^"]+)"/g)].map((match) => match[1]))]
const problems = []

const missing = REQUIRED.filter((pattern) => !urls.some((url) => pattern.test(url)))
if (missing.length > 0) {
  problems.push(`fichiers du compteur caméra absents du précache : ${missing.map(String).join(', ')}`)
}

let total = 0
for (const url of urls) {
  const { size } = await stat(`${dist}${decodeURIComponent(url)}`)
  total += size
  if (size > 6 * MIB && !POSE_WASM.test(url)) {
    problems.push(`${url} pèse ${mib(size)} Mio : seul le WebAssembly de MediaPipe dépasse 6 Mio`)
  }
}
if (total > 24 * MIB) {
  problems.push(`précache de ${mib(total)} Mio : plus de 24 Mio à télécharger à l'installation`)
}

for (const file of await readdir(`${dist}assets`)) {
  if (!file.endsWith('.js')) continue
  const code = await readFile(`${dist}assets/${file}`, 'utf8')
  const hosts = new Set(code.match(/[\w.-]*googleapis\.com/g) ?? [])
  const calls = [...hosts].filter((host) => !ALLOWED_GOOGLE.has(host))
  if (calls.length > 0) {
    problems.push(`assets/${file} mentionne ${calls.join(', ')} : rien ne doit partir chez Google`)
  }
}

if (problems.length > 0) {
  for (const problem of problems) console.error(`postbuild : ${problem}`)
  process.exit(1)
}
console.log(`précache : ${String(urls.length)} fichiers, ${mib(total)} Mio (compteur caméra compris)`)
