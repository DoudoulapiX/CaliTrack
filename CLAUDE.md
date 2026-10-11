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
- `src/db/` : base Dexie, schémas zod (`schema.ts`), écritures et sauvegardes (`backup.ts`).
- `src/features/<écran>/` : écrans ; la mise en forme des textes est dans `*-view.ts`, testée à part.
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

## Services extérieurs

- Clé Claude et accès Oura : table `secrets`, sur l'appareil seulement, jamais dans les sauvegardes ni
  dans le dépôt.
- Claude (photos des repas) : SDK officiel appelé depuis le navigateur avec la clé de l'utilisateur.
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
- Playwright simule un iPhone 13 : Chromium en local, Chromium et WebKit en CI.

## Mise en ligne

Le workflow `.github/workflows/ci.yml` vérifie chaque demande de fusion. Un envoi sur `main` repasse les
vérifications puis publie `dist/` sur GitHub Pages.
