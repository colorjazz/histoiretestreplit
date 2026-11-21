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
   - `GEMINI_MODEL` (facultatif, défaut `gemini-3.6-flash`)
3. Déployer.
4. Firebase console → **Authentication → Settings → Authorized domains** : ajouter le domaine
   Netlify (ex. `ton-site.netlify.app`) et, plus tard, ton domaine personnalisé.
