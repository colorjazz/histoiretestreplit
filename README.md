# Corrige.moi

Application web (React + Vite + Tailwind) pour pratiquer les opérations intellectuelles
en histoire du Québec et du Canada, avec suivi par les enseignants.

- **Site** : `src/` — compilé en fichiers statiques dans `dist/`.
- **Données et comptes** : Firebase (Auth + Firestore), appelé directement par le navigateur
  (configuration dans `src/firebase.ts`).
- **API** : Netlify Functions dans `netlify/functions/`, portées depuis l'ancien serveur Express
  de Replit.

| Route | Fonction | État |
| --- | --- | --- |
| `POST /api/focus-training` | `focus-training.mts` | ✅ génération et correction Gemini |
| `GET /api/focus-training/jobs/:id` | `focus-training-job.mts` | ✅ suivi des générations longues |
| (interne) | `focus-training-worker-background.mts` | ✅ exécute les générations (jusqu'à 15 min) |
| `GET /api/banque-section-a` | `banque-section-a.mts` | ✅ lot de réserve si la génération échoue |
| `GET /api/historical-visuals[/maps\|/image]` | `historical-visuals.mts` | ✅ images Wikimedia Commons |
| `/api/auth/me`, push, migration Supabase | — | ⏳ pas encore portées (l'appli a un repli) |

Les générations (`action: "generate"`) peuvent enchaîner plusieurs appels Gemini (sous-lots,
validation, réparation du JSON). Elles sont donc stockées comme « jobs » dans **Netlify Blobs**
et exécutées par une **fonction d'arrière-plan**; le navigateur suit leur progression.

## Développement local

```bash
npm install
GEMINI_API_KEY=ta-cle npm run dev:api   # API locale sur :8888 (jobs en mémoire)
npm run dev                            # site sur :5173, /api relayé vers :8888
```

Mode démo élève (développement seulement) :
`http://localhost:5173/app?demo=section-a&code=HB_-423-01&nom=Test`

Vérifications : `npm run typecheck` et `npm run build`.

## Déploiement sur Netlify

1. Netlify → **Add new project → Import an existing project** → GitHub → ce dépôt.
   Les réglages viennent de `netlify.toml` (build `npm run build`, publication `dist`).
2. **Project configuration → Environment variables** :
   - `GEMINI_API_KEY` (obligatoire, portée « Functions »)
   - `GEMINI_MODEL` (facultatif, défaut `gemini-3.6-flash`, comme sur Replit)
   - `GEMINI_THINKING_LEVEL` (facultatif, défaut `medium` : `minimal`, `low`, `medium`, `high` ou `off`)
3. Déployer.
4. Firebase console → **Authentication → Settings → Authorized domains** : ajouter le domaine
   Netlify (ex. `ton-site.netlify.app`) et, plus tard, ton domaine personnalisé.

## Accès au service Gemini

`/api/focus-training` (génération et correction) n'accepte que les utilisateurs connectés :
le navigateur envoie le jeton Firebase de l'élève ou de l'enseignant, vérifié avec les clés
publiques de Google (`netlify/lib/acces.ts`). Chaque utilisateur a aussi des plafonds, comptés
dans Netlify Blobs. Variables facultatives pour les ajuster :

| Variable | Défaut | Rôle |
|---|---|---|
| `QUOTA_PAR_HEURE` | 60 | appels par utilisateur et par heure |
| `QUOTA_PAR_JOUR` | 300 | appels par utilisateur et par jour |
| `QUOTA_GLOBAL_PAR_JOUR` | 6000 | appels pour tout le site, par jour (plafond de dépenses) |
| `FIREBASE_PROJECT_ID` | `histoire-nationale` | projet Firebase des jetons |

Un lot de 10 questions compte pour 1 appel, chaque correction pour 1 appel. En local
(`npm run dev:api`), la vérification est sautée pour le mode démo ; `FOCUS_AUTH_FORCE=1` la réactive.

## Différences avec le serveur Replit

La logique de génération (`netlify/lib/focusTrainingLogic.ts`) reprend celle de Replit, avec
ces correctifs :

- **Troncature** : la « réflexion » de Gemini compte dans la limite de sortie. Avec 7 000 jetons,
  les sous-lots étaient souvent coupés (`MAX_TOKENS`) puis régénérés en boucle. Réflexion
  `medium` et limites relevées (16 000 / 24 000).
- **Validateur unique** : le serveur applique maintenant `validerContenuOperation` de l'appli
  (`src/histoire/assessmentContracts.ts`) avant d'accepter un sous-lot. Un lot que l'appli
  refuserait est régénéré côté serveur au lieu d'afficher « Oups! » à l'élève. L'ancien contrôle
  des comparaisons (`elementsComparer`…) ne correspondait plus à la consigne et échouait toujours.
- **Normalisations sans effet sur le texte élève** : liste `marqueursRelationAttendus` alignée sur
  les phrases attendues, catégorie de fait ramenée à la valeur permise, `faitsRelier` = `propositions`,
  documents mélangés si les associations restaient dans l'ordre `[0,1,2]`.
- **Relance ciblée** : la régénération d'un sous-lot indique à Gemini les problèmes précis détectés.
- **Plus rapide** : plus de tentative initiale « 10 questions d'un coup » (elle échouait presque
  toujours); les deux sous-lots de 5 questions sont générés directement en parallèle.
  Durée typique d'un lot : 45 s à 1 min 30 dans l'appli.
- **Appli** : la consigne du lot demande `ordreCorrect` pour le classement; l'exigence
  d'un `elementsChronologiques` ne s'applique plus qu'au module « Réponses courtes ».
- La clé Gemini passe dans un en-tête (`x-goog-api-key`), jamais dans l'URL.

## Réserve de lots (Section A)

Si la génération d'un lot de 10 questions échoue malgré 3 tentatives, l'appli pige
un lot dans une réserve au lieu d'afficher une erreur. L'élève ne voit pas la
différence; l'enseignant voit le badge « Question de réserve » dans le dossier de
l'élève (champ `sourceQuestion: "reserve"` du résultat).

- **Remplissage automatique** : chaque lot accepté par le serveur y est versé,
  question par question, par module et par période (Netlify Blobs, store
  `banque-section-a`, `netlify/lib/banque.ts`). Une question n'y entre que si
  l'appli peut l'afficher sans réparation (rattachement PFEQ, documents complets,
  réponse attendue).
- **Réserve de départ** : `netlify/lib/banque-initiale.json`, 1 lot par période du
  module « Réponses courtes » (80 questions). Pour la compléter :
  `npx tsx scripts/construire-banque-initiale.mts reponses lot1.json lot2.json`.
- **Questions déjà vues** : retenues dans le navigateur de l'élève pour éviter les
  répétitions.
- **Correction indisponible** : au lieu d'une erreur, l'élève est invité à
  réessayer et peut consulter la réponse attendue.
