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

Les données sont gardées dans l'appli, sur l'iPhone. Rien ne part ailleurs, sauf quand tu te sers de ces
fonctions : la photo d'un repas (envoyée à Anthropic avec ta clé Claude), les demandes au coach IA et
leurs photos (envoyées à Anthropic de la même façon), un code-barres scanné (cherché sur Open Food Facts)
et la lecture de ta bague (demandée à Oura par ton relais). Le compteur de répétitions analyse l'image de
la caméra sur l'iPhone même : aucune image n'est envoyée ni enregistrée. Pour ne rien perdre :

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

## Ce que fait la deuxième étape

- **Nutrition** : journal des repas jour par jour, table Ciqual de l'Anses (plus de 3 400 aliments),
  aliments perso, saisie rapide, repas de la veille à recopier ; objectifs de calories et de macros
  calculés d'après le profil et l'objectif (sèche, maintien, prise de masse), ou fixés à la main.
- **Code-barres** : scan à la caméra (ou code tapé), produit lu sur Open Food Facts puis gardé.
- **Photo du repas** : Claude reconnaît les aliments et estime quantités et valeurs, à vérifier avant
  l'ajout. Il faut ta propre clé Claude (Plus → Intelligence artificielle), gardée sur l'iPhone et hors
  des sauvegardes ; chaque analyse est facturée par Anthropic sur ton compte.
- **Bague Oura** : sommeil et récupération de la nuit sur l'accueil, relus à l'ouverture quand ils
  ont plus d'une heure.

### Connecter la bague Oura

Oura ne laisse pas une appli web lire les données directement. Un petit relais gratuit (un Worker
Cloudflare, dont l'appli donne le code) transmet les lectures sans rien garder. Les étapes sont dans
**Plus → Bague Oura** :

1. créer le relais chez Cloudflare et coller son adresse dans l'appli, qui le vérifie ;
2. déclarer l'appli sur cloud.ouraring.com (adresse de retour fournie) et coller son Client ID ;
3. toucher **Connecter ma bague** et accepter chez Oura.

L'accès dure 30 jours ; l'appli prévient quand il faut le renouveler. Si le retour d'Oura s'ouvre dans
Safari au lieu de l'appli, la page affichée donne un lien à copier puis à coller dans **Plus → Bague
Oura**.

## Coach IA

La troisième étape ajoute un coach qui passe par Claude, avec ta propre clé (**Plus → Intelligence
artificielle**). Ses quatre parties sont dans **Plus → Coach IA**. Rien n'est demandé à Claude tant que
tu ne touches pas le bouton qui lance la demande.

- **Coach du jour** (aussi sur la carte de la séance du jour : « Ajuster avec le coach ») : tu dis
  comment tu te sens (énergie, courbatures, et sommeil quand la bague Oura ne l'a pas mesuré). D'après
  ta forme, ta nuit, tes dernières séances et ton programme, le coach valide la séance prévue, l'allège
  (moins de séries, charge plus légère, variante plus facile, exercice sauté) ou conseille le repos. Un
  exercice modifié par le coach ne compte pas pour la progression. Sans séance prévue, il donne des
  conseils pour la journée.
- **Coach physique** (aussi depuis les objectifs caloriques) : une à trois photos (de face, de profil,
  de dos). Le coach estime ta masse grasse et conseille une phase : sèche, maintien ou prise de masse.
  CaliTrack la ramène au maintien quand elle ne convient pas à ta corpulence (pas de sèche si tu es déjà
  mince ou sec, pas de prise de masse en obésité), puis calcule elle-même les calories et les macros :
  Claude ne fixe jamais ces chiffres. Réservé aux adultes : il faut ton année de naissance et au moins
  18 ans. C'est une estimation pour guider tes phases, pas un avis médical.
- **Frigo et placards** : la liste de ce que tu as, tenue à la main ou d'après une photo du frigo (les
  aliments reconnus sont à vérifier avant l'enregistrement). Le coach en tire des idées de repas pour un
  jour et un repas, d'après ce qu'il te reste à manger ; celle que tu choisis s'ajoute au journal (aussi
  depuis l'ajout d'un aliment : « Idées avec mon frigo »).
- **Discussion avec le coach** : pose tes questions. Le coach connaît ton profil, ton programme, tes
  séances et ton escalade, ton sommeil, tes pesées, tes repas, ton frigo et ta dernière analyse physique.
  L'appli garde les 200 derniers messages.

Ce qui part vers Anthropic : ta demande, ses photos et les données utiles au coach (profil sans ton
prénom, programme, séances et escalade récentes, nuits Oura, pesées, repas, frigo, dernière analyse
physique avec sa phase et sa masse grasse estimée). Les photos sont réduites avant l'envoi et CaliTrack
n'en garde aucune, celles de ton corps pas plus que les autres. Les conseils, les analyses (sans les
photos), le frigo et la discussion vont dans les sauvegardes ; la clé et le compteur des demandes restent
sur l'iPhone.

Ce que ça coûte : chaque demande est facturée par Anthropic sur ton compte, en dollars ; son prix
habituel est affiché sous le bouton qui la lance. Pour un mois d'usage régulier (un conseil et une photo
de repas par jour, une soixantaine de messages, quelques idées de repas, photos du frigo et analyses du
coach physique), compte environ 6,72 $ avec Opus 5.5 (le modèle par défaut), 3,39 $ avec Sonnet 5.5 et
0,17 $ avec Haiku 5.5. **Plus → Intelligence artificielle** affiche ces estimations et le compteur du
mois : ce qu'ont coûté les demandes faites sur cet iPhone, calculé sur place (ta facture Anthropic fait
foi).

## Ce que fait la quatrième étape

**Compteur caméra** : pendant une séance, le bouton **Compter à la caméra** d'un exercice compte tes
répétitions en direct. Il connaît les squats, pompes, dips, tractions et curls (y compris alternés, les deux
bras comptent) et leurs variantes courantes, dont un nouvel exercice : le **Curl à l'élastique**. Les
exercices sur une seule jambe ou un seul bras (pistol, squat bulgare, traction à un bras…) ne sont pas
comptés.

- **Placement** : l'écran « Place ton téléphone » dit où le poser pour chaque mouvement (à 2 ou 3 mètres
  environ, de profil pour les pompes et les dips) : tout ton corps dans l'image, de la lumière face à toi et
  personne d'autre dans l'image.
- **Comptage** : le compte démarre quand tu restes une seconde en position. Quand tu t'arrêtes (ou avec
  **Terminer la série**), la série s'enregistre toute seule et le repos démarre, compté depuis ta dernière
  répétition ; à la fin du repos, le compteur repart pour la série suivante du même exercice.
- **Vérification** : si le compte est douteux (tu es sorti de l'image, mouvement refusé, téléphone trop
  lent), rien n'est enregistré avant que tu aies vérifié le nombre. Les pompes, les dips et les tractions
  restent « en essai » (compte toujours à vérifier) tant qu'ils n'ont pas été validés sur de vraies séries.
- **Correction** : un compte se corrige juste après l'enregistrement (**Corriger**), ou plus tard dans la
  séance, comme n'importe quelle série.
- **Bips et voix** : **Son du minuteur** et **Annonces vocales** (Plus → Réglages → Pendant la séance)
  annoncent chaque répétition. En mode silencieux, l'iPhone peut couper les bips.
- **Infos de réglage** (pendant le comptage) : ce que voit le compteur, et l'export des points du squelette
  de la dernière série (sans aucune image), pour régler le compteur quand il se trompe.

La détection du squelette (MediaPipe) tourne sur l'iPhone : l'image ne quitte jamais le téléphone. Le
compteur est téléchargé avec l'appli (environ 17 Mo, une seule fois par version de MediaPipe), puis marche
sans connexion. Il faut iOS 16.4 ou plus récent. Ouverte depuis l'écran d'accueil, l'appli garde l'écran
allumé pendant le comptage à partir d'iOS 18.4 ; avant, règle Verrouillage automatique sur « Jamais »
(Réglages de l'iPhone → Luminosité et affichage).

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
- Valeurs nutritionnelles : [table Ciqual 2025 de l'Anses](https://ciqual.anses.fr), licence ouverte
  Etalab 2.0, avec les portions de l'étude INCA3.
- Produits scannés : [Open Food Facts](https://world.openfoodfacts.org), base ouverte sous licence ODbL.
- Lecture des codes-barres : [zxing-wasm](https://github.com/Sec-ant/zxing-wasm), licence MIT.
- Compteur de répétitions :
  [MediaPipe Pose Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker) de
  Google et son modèle BlazePose GHUM, licence Apache 2.0.
- Données de test du compteur : [MM-Fit](https://mmfit.github.io/) (Strömbäck, Huang et Radu, 2020), licence
  CC BY 4.0, et la démo de [Sports2D](https://github.com/davidpagnon/Sports2D), licence BSD-3-Clause.
- Icônes : [Lucide](https://lucide.dev), licence ISC.
- Équivalences Fontainebleau des couleurs Vertical'Art : d'après la table publique de Kaskad Coaching, à
  titre indicatif.
