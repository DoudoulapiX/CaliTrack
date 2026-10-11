# CaliTrack

Appli web installable (PWA) pour suivre la calisthénie et l'escalade (cotations Vertical'Art), pensée pour
l'iPhone. Tout reste sur le téléphone : pas de compte, pas de serveur.

Adresse : https://doudoulapix.github.io/CaliTrack/

## L'installer sur iPhone

1. Ouvre l'adresse ci-dessus dans **Safari**.
2. Touche le bouton **Partager**, puis **Sur l'écran d'accueil**.
3. CaliTrack s'ouvre alors en plein écran, comme une appli, et marche sans connexion.

Quand une nouvelle version est en ligne, l'appli le propose d'elle-même (ou Plus → À propos → Rechercher
une mise à jour).

## Tes données

Les données sont gardées dans l'appli, sur l'iPhone. Pour ne rien perdre :

- **Plus → Sauvegarde → Enregistrer dans Fichiers** crée un fichier avec toutes tes données (de
  préférence dans iCloud Drive). Un rappel s'affiche sur l'accueil quand la dernière sauvegarde date.
- **Restaurer une sauvegarde** (même écran, ou dès le premier lancement) remet tout depuis ce fichier.
- L'appli garde aussi ses trois dernières copies de sécurité internes.

## Ce que fait la première étape

- **Accueil** : séance du jour, semaine, objectifs épinglés, escalade, poids et records ; cartes au
  choix et dans l'ordre voulu.
- **Exercices** : bibliothèque complète en français, avec images, et progressions de calisthénie
  (tractions, dips, planche, levers, drapeau, muscle-up…).
- **Profil et niveau** : test de niveau, lieux d'entraînement et matériel de chacun.
- **Programmes** : programme adapté au niveau, au matériel et aux jours choisis, qui progresse tout seul.
- **Séances** : séance en direct, minuteur de repos, chrono pour les exercices tenus, bilan, historique
  et records.
- **Calendrier** : séances du programme, séances perso (course, vélo…) et séances répétées.
- **Objectifs** : figures étape par étape (muscle-up, front lever…), nombre de répétitions, poids,
  escalade ou objectif libre, avec leur barre d'avancement.
- **Escalade** : blocs notés par couleur Vertical'Art, bilan, statistiques et cotations modifiables.
- **Réglages** : thème clair ou sombre, couleur de l'appli, onglets, unités, options de séance.

Les étapes suivantes ajoutent la nutrition (calories et photos des repas), le coach sèche ou prise de
masse, les idées de repas d'après le frigo, le programme du jour d'après la bague Oura et le comptage des
répétitions à la caméra.

## Développement

Il faut Node 22.

```sh
npm ci
npm run dev          # http://localhost:5173/CaliTrack/
```

Vérifications (toutes passent avant chaque envoi) :

```sh
npm run typecheck    # types TypeScript
npm run lint         # ESLint
npm run format:check # Prettier
npm test             # tests unitaires et d'intégration (Vitest)
npm run build        # appli de production dans dist/
npm run e2e          # parcours complets sur iPhone simulé (Playwright)
npm run check        # tout à la suite
```

Chaque demande de fusion passe ces vérifications sur GitHub (Chromium et WebKit, le moteur de Safari).
Chaque envoi sur `main` les repasse, puis met l'appli en ligne sur GitHub Pages.

## Crédits

- Exercices et images : [free-exercise-db](https://github.com/yuhonas/free-exercise-db), domaine public,
  traduite en français pour CaliTrack.
- Icônes : [Lucide](https://lucide.dev), licence ISC.
- Équivalences Fontainebleau des couleurs Vertical'Art : d'après la table publique de Kaskad Coaching, à
  titre indicatif.
