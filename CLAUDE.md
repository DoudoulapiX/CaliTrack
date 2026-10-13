# CaliTrack : notes pour travailler sur le code

Appli web installable (PWA) pour iPhone, servie par GitHub Pages sous `/CaliTrack/`. React 19, TypeScript
strict, Vite, Tailwind 4, Dexie 4 (IndexedDB), react-router 7, zod 4. Pas de serveur : toutes les données
restent sur le téléphone.

## Avant chaque envoi

`npm run check` doit passer en entier : types, ESLint, Prettier, tests Vitest, build, puis Playwright.
Chaque fonction nouvelle ou modifiée a ses tests (unitaires dans `*.test.ts`, écrans dans `*.test.tsx`,
parcours dans `e2e/`). Ne jamais sauter, désactiver ni assouplir un test pour faire passer la CI.

## Organisation

- `src/content/` : logique sans interface (programmes, progression, records, agenda, objectifs,
  escalade, nutrition, IA, Oura), testée seule.
- `src/content/coach/` : le coach IA (conseil du jour, coach physique, frigo, discussion), son contexte
  (`context.ts`) et ses prompts (`prompt.ts`) ; les appels à Claude sont dans `src/content/ai/`.
- `src/db/` : base Dexie, schémas zod (`schema.ts`), écritures et sauvegardes (`backup.ts`).
- `src/features/<écran>/` : écrans ; la mise en forme des textes est dans `*-view.ts`, testée à part.
  Les écrans du coach IA sont dans `src/features/coach/`.
- `src/ui/` : composants communs. `src/lib/` : dates, unités, typographie, couleurs.
- `src/test/` : base de test, `renderApp`, jeux de données (`fixtures.ts`).

## Règles du code

- Toute l'interface est en français, au tutoiement.
- Typographie : espace insécable avant « : ; ! ? % » et à l'intérieur des guillemets avec
  `frenchSpacing()`, groupes à ne pas couper avec `keepTogether()`, sinon `NBSP`. Jamais d'espace
  insécable écrite telle quelle dans le code : toujours `\u00a0` (ESLint le vérifie). Les `aria-label`
  composés en code gardent des espaces normales.
- Prettier : pas de point-virgule, guillemets simples, 110 colonnes.
- Classes Tailwind écrites en entier (pas de noms construits par morceaux).
- Le routeur garde la barre finale de `BASENAME` (`/CaliTrack/`) : sans elle, recharger l'accueil échoue.

## Données des utilisateurs

Une fois l'appli en ligne, les données vivent sur les iPhone : tout changement de schéma passe par une
nouvelle version Dexie (`DB_VERSION` et `instance.version(n)` dans `src/db/db.ts`) avec sa migration,
jamais par une modification de `SCHEMA_V1`. Les fichiers de sauvegarde déjà faits doivent rester
restaurables : si leur format change, augmenter la version du format dans `src/db/backup.ts` et convertir
les anciens fichiers.

Avant de changer une valeur par défaut des réglages (`DEFAULT_TABS`, `DEFAULT_DASHBOARD_CARDS`,
`DEFAULT_AI_MODEL`), figer d'abord ses valeurs actuelles en constantes `V2_…` dans `src/db/migrations.ts`,
comme les `V1_…` : la conversion depuis la version 1 doit toujours donner les réglages de la version 2.

## Services extérieurs

- Clé Claude et accès Oura : table `secrets`, sur l'appareil seulement, jamais dans les sauvegardes ni
  dans le dépôt.
- Claude (photos des repas, coach IA) : SDK officiel appelé depuis le navigateur avec la clé de
  l'utilisateur.
  - Aucun appel à Claude sans geste de l'utilisateur (testé écran par écran).
  - Schémas de sortie lâches (`z.string()` puis `choice()`, jamais `z.enum`) ; `stop_reason` vérifié
    avant `JSON.parse`.
  - Pas d'espace insécable dans les prompts : les textes envoyés passent par `promptText`.
  - `aiUsage` (compteur des demandes) reste sur l'appareil, avec `secrets` et `snapshots`
    (`DEVICE_TABLES`) : jamais dans les sauvegardes.
- Open Food Facts : lecture seule des produits scannés, gardés ensuite dans `foods`.
- Oura : accès par OAuth implicite (30 jours), lectures par le relais Cloudflare dont le code est produit
  par `src/content/oura/relay.ts`. Changer ce code oblige chaque utilisateur à le recopier dans son
  Worker : garder la compatibilité (`/ping`, `/v2/usercollection/…`).
- Dans les tests, ces services sont simulés (`src/test/anthropic.ts`, `src/test/oura.ts`, routes
  Playwright dans `e2e/`) : aucun test n'appelle le vrai réseau.

## Tests

- Vitest : jsdom, fake-indexeddb, fuseau `Europe/Paris`. Pour fixer la date :
  `vi.setSystemTime(new Date(2026, 9, 21, 11, 0))`, puis `vi.useRealTimers()` après le test.
- Testing Library ramène les espaces insécables du texte affiché à des espaces normales, mais pas dans
  les noms accessibles : dans une expression régulière sur un `name`, écrire `\s`.
- La navigation entre écrans est asynchrone (routes chargées à la demande) : attendre avec `waitFor` ou
  `findBy…`.
- Claude simulé (`src/test/anthropic.ts`, `fakeClaude` dans `e2e/nutrition-helpers.ts`) : les faux
  répondent en SSE quand la requête demande un flux (`stream: true`), en JSON sinon.
- Playwright simule un iPhone 13 : Chromium en local, Chromium et WebKit en CI. `E2E_PORT` change son
  port (4173 par défaut) : deux copies du dépôt peuvent lancer leurs tests en même temps.
- Un test qui simule un service extérieur avec `page.route` bloque le service worker
  (`test.use({ serviceWorkers: 'block' })`) : sous WebKit, les requêtes d'une page qu'il contrôle échappent
  à `page.route` et partent sur le vrai réseau.

## Mise en ligne

Le workflow `.github/workflows/ci.yml` vérifie chaque demande de fusion. Un envoi sur `main` repasse les
vérifications puis publie `dist/` sur GitHub Pages.
