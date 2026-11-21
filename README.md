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
- **Appli** : la consigne du lot demande `ordreCorrect` pour le classement; l'exigence
  d'un `elementsChronologiques` ne s'applique plus qu'au module « Réponses courtes ».
- La clé Gemini passe dans un en-tête (`x-goog-api-key`), jamais dans l'URL.
