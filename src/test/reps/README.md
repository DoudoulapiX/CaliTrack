# Fichiers de points du compteur caméra

Chaque fichier `.json` de ce dossier est le squelette d'une série (les points du corps, image par image),
jamais une image ni une vidéo. Les tests les rejouent dans le compteur (`src/content/reps/`) :

- `fixtures.test.ts` vérifie le compte attendu de chaque fichier ; un nouveau fichier est pris sans changer le
  code ;
- `accuracy.test.ts` vérifie les cibles de justesse à 15, 10 et 8 images par seconde : pour un mouvement validé
  (squats, curls), au moins 90 % de comptes exacts, tous à une répétition près, erreur moyenne d'au plus 0,15,
  au plus 2 % de comptes sûrs mais faux (aucun sur les fichiers `split: 'check'`) ; rien sur les fichiers
  négatifs, quel que soit le mouvement ; jamais de compte sûr pour un mouvement en essai (pompes, dips,
  tractions), ni pour une variante en essai d'un mouvement validé (tous les curls sauf
  `Dumbbell_Alternate_Bicep_Curl`, le seul que MM-Fit filme) ;
- `npm run reps:eval` imprime le tableau de justesse et la liste des séries mal comptées.

Le dossier reste sous 3 Mo (vérifié par `fixtures.test.ts`). Prettier ne touche pas aux `.json`.

## Format

Le format est décrit et validé par `src/content/reps/fixture.ts` (`repFixtureSchema`). Une entrée de `frames`
par image : `[t, points sur l'image, points dans l'espace]`, en entiers (millièmes de la largeur et de la
hauteur, visibilité en millièmes ; millimètres dans l'espace, hanches en 0), pour les 13 points de `joints`
(nez, épaules, coudes, poignets, hanches, genoux, chevilles, numérotation MediaPipe). `0` à la place des points :
personne n'est vu. `expected` donne le compte exact attendu et, s'il est connu, s'il doit être sûr ; `split`
vaut `tune` (sert à régler les seuils) ou `check` (sert seulement à les vérifier).

## Ce qu'il y a ici

| Fichiers                                    | Contenu                                                                  | Attendu                                 |
| ------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------- |
| `mmfit-squats-*.json` (8)                   | séries de squats de MM-Fit, dont des squats peu profonds (w17)           | le compte de MM-Fit, sûr                |
| `mmfit-curls-*.json` (8)                    | curls alternés de MM-Fit, dont deux séries lentes (w20)                  | le compte de MM-Fit (deux bras), sûr    |
| `mmfit-pushups-front-*.json` (3)            | pompes de MM-Fit filmées de face                                         | jamais sûr (le compteur veut un profil) |
| `mmfit-negative-*.json` (4)                 | 30 s sans exercice compté : marche, jumping jacks, abdominaux, développé | 0 pour les cinq mouvements              |
| `sports2d-walk.json`                        | démo de Sports2D (parkour, une personne qui passe) vue par MediaPipe     | 0 pour les cinq mouvements              |
| `synth-squat-3.json`, `synth-pullup-3.json` | séries fabriquées par `src/test/pose-synth.ts`, rejouées de bout en bout | 3 (squats sûrs, tractions à vérifier)   |

Deux séries de squats ont une note :

- `mmfit-squats-w00-0` : les points de MM-Fit commencent 333 ms après le début étiqueté de la série, genou déjà
  plié (94°) : 9 répétitions sont visibles sur les 10 étiquetées.
- `mmfit-squats-w17-1` : après la septième répétition, la personne fait deux pas, se baisse jusqu'à avoir les
  mains à hauteur des genoux, se relève et revient à sa place. Ce n'est pas un squat : les pieds ont bougé
  depuis la répétition précédente, le compteur le refuse et rend 7, sûr.

Les séries MM-Fit gardées ici ne sont pas choisies pour cacher des erreurs. Le compteur a été passé sur toutes
les séries étiquetées de MM-Fit (64 de squats, 59 de curls, chaque série avec 3 s de marge), à 15, 10 et 8 images
par seconde : squats 64/64 exacts à 15 et 10 images par seconde, 63/64 à 8 (la série fausse, 9 pour 10, est à
vérifier) ; curls 59/59 partout ; aucun compte sûr mais faux. Deux séries de squats (w00 et w02, série 0)
commencent au milieu de la première répétition et sont comptées sur leurs 9 répétitions visibles.

Les quatre fichiers négatifs, eux, sont des moments où rien n'est compté. Sur les 458 moments de 30 s de MM-Fit
essayés (276 repos, 57 jumping jacks, 65 abdominaux, 60 développés épaules), squats, pompes, dips et tractions
comptent au plus un mouvement en tout chacun, jamais sûr ; les curls en comptent dans 88 moments, presque toujours
un seul (jamais sûr), mais 8 repos donnent 2 à 5 curls sûrs (bras pliés debout, coudes au corps, comme un curl).
C'est pour cela que l'appli n'analyse aucune image pendant le repos.

## Crédits

### MM-Fit (fichiers `mmfit-*`)

David Strömbäck, Sheng Huang et Valentin Radu, « MM-Fit: Multimodal Deep Learning for Automatic Exercise
Logging across Sensing Devices », Proceedings of the ACM on Interactive, Mobile, Wearable and Ubiquitous
Technologies (IMWUT), vol. 4, n° 4, 2020. Données : https://mmfit.github.io/, sous licence Creative Commons
Attribution 4.0 International (CC BY 4.0, https://creativecommons.org/licenses/by/4.0/).

Changements faits pour CaliTrack : points 2D (OpenPose) et 3D (VideoPose3D) de MM-Fit renumérotés comme ceux de
MediaPipe (13 points gardés), une image sur deux (15 images par seconde au lieu de 30), visibilité 1 pour un point
présent, découpe de la série avec 3 s de marge (30 s pour les fichiers négatifs), valeurs arrondies au millième
(image) et au millimètre (espace). Le champ `source` de chaque fichier donne la séance, la série et les images de
la vidéo d'origine.

### Sports2D (fichier `sports2d-walk.json`)

Démo de Sports2D (https://github.com/davidpagnon/Sports2D, vidéo `Sports2D/Demo/demo.mp4`), points calculés
par MediaPipe Pose Landmarker lite 0.10.35 sur processeur, 15 images par seconde. Les images de la même démo
servent aux tests de bout en bout (`e2e/media/sports2d-walk/SOURCE.txt`). Licence de Sports2D :

```text
BSD 3-Clause License

Copyright (c) 2022, perfanalytics
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its
   contributors may be used to endorse or promote products derived from
   this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

### Séries fabriquées (fichiers `synth-*`)

Squelettes calculés par `src/test/pose-synth.ts`, sans personne filmée ni source extérieure.
`pose-synth.test.ts` vérifie qu'ils sont à jour ; après un changement du générateur :
`npx vitest run src/test/pose-synth.test.ts -u`.

## Ajouter une série filmée

Les vidéos ne sont jamais ajoutées au dépôt : seuls leurs points le sont.

```sh
# Depuis une vidéo (ffmpeg et le Chromium de Playwright sont nécessaires) :
npm run reps:add -- --video ~/Downloads/tractions-1.MOV --movement pullup --exercise pullup --reps 8 \
  --name charles-pullup-1 [--start 2 --end 31.5] [--licence "Charles, avec son accord"]
# Depuis « Infos de réglage › Exporter les points de la série » dans l'appli :
npm run reps:add -- --trace ~/Downloads/calitrack-points-pullup-2026-10-21-1130.json --name charles-pullup-2 [--reps 8]
```

La commande écrit `src/test/reps/<nom>.json` (`split: 'check'`), puis affiche ce que le compteur en fait (compte,
sûr ou non, raisons). Pour une série ratée exprès (demi-répétitions, sortie de l'image), `--reps` donne le vrai
nombre de répétitions. Ensuite :

```sh
npm run reps:eval                                  # toutes les images
npm run reps:eval -- --fps 8                       # comme un téléphone lent
npm run reps:eval -- --variant dip:supportRatio    # un réglage à comparer (SPEC_ALTERNATIVES dans specs.ts)
npm test
```

Si une cible n'est plus atteinte, on règle les seuils de `src/content/reps/specs.ts` en gardant toutes les
cibles, jamais `expected`. Un mouvement en essai ne devient validé (compte sûr enregistré tout seul) qu'avec au
moins 6 séries filmées avec MediaPipe, dont 2 ratées exprès, qui atteignent les cibles.
