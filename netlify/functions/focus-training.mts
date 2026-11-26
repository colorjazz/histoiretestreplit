/**
 * POST /api/focus-training — port Netlify de routes/focus-training.ts (serveur Replit).
 *
 * - « generate » : la génération peut demander plusieurs appels Gemini (validation,
 *   réparation, sous-lots). Elle passe par un job stocké dans Netlify Blobs et
 *   exécuté par une fonction d'arrière-plan; le navigateur suit /api/focus-training/jobs/:id.
 * - « correct » : appel direct, réponse immédiate.
 *
 * Accès : utilisateur Firebase connecté (jeton dans Authorization) et quotas, voir lib/acces.ts.
 *
 * Variables : GEMINI_API_KEY (obligatoire), GEMINI_MODEL (facultatif).
 */
import { randomUUID } from "node:crypto";
import type { Config } from "@netlify/functions";
import { buildEducationalContext } from "../lib/histoire-educational-context";
import { validerRequeteFocusTraining } from "../lib/focusTrainingContracts";
import { executerGeminiAvecReparation } from "../lib/focusTrainingLogic";
import { createJob, getJobByIdempotencyKey, jobOrphelin } from "../lib/jobs";
import { logger } from "../lib/logger";
import { consommerQuota, identifierUtilisateur } from "../lib/acces";
import {
  declencherWorker,
  FOCUS_TRAINING_TRACKING_UNAVAILABLE_CODE,
  FOCUS_TRAINING_TRACKING_UNAVAILABLE_MESSAGE,
  json,
  lireEnv,
  reponseJob,
  reponseSucces,
  statutHttpJob,
} from "../lib/focus-service";

const GEMINI_NOT_CONFIGURED = {
  code: "GEMINI_NOT_CONFIGURED",
  error: "Le service Gemini n'est pas configuré. Ajoute GEMINI_API_KEY dans les variables d'environnement Netlify.",
};

export default async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return json(405, { error: "Méthode non permise." });

  const utilisateur = await identifierUtilisateur(req);
  if (!("uid" in utilisateur)) return json(utilisateur.status, { error: utilisateur.error, code: utilisateur.code });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Corps JSON invalide." });
  }
  const validation = validerRequeteFocusTraining(body);
  if (!validation.ok) return json(validation.status, { error: validation.error });
  const { action, prompt } = validation;

  let context: string;
  try {
    context = buildEducationalContext(action);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    return json(500, { error: `Impossible de charger le contexte historique : ${message}` });
  }

  const apiKey = lireEnv("GEMINI_API_KEY");

  if (action === "generate") {
    const idempotencyKey = (req.headers.get("Idempotency-Key") || randomUUID()).trim();
    if (idempotencyKey.length > 200) return json(400, { error: "La clé de génération est trop longue." });
    const origin = new URL(req.url).origin;

    try {
      const existant = await getJobByIdempotencyKey(idempotencyKey);
      if (existant) {
        if (existant.prompt !== prompt || existant.action !== action) {
          return json(409, { error: "Cette clé de génération est déjà associée à une autre demande." });
        }
        if (jobOrphelin(existant)) await declencherWorker(origin, existant.id);
        return json(statutHttpJob(existant), reponseJob(existant));
      }
      if (!apiKey) return json(503, GEMINI_NOT_CONFIGURED);
      const refus = await consommerQuota(utilisateur.uid);
      if (refus) return json(refus.status, { error: refus.error, code: refus.code });
      const job = await createJob({
        id: randomUUID(),
        idempotencyKey,
        action,
        prompt,
        progress: { stage: "queued", completedParts: 0, totalParts: 2, percent: 0 },
      });
      await declencherWorker(origin, job.id);
      return json(statutHttpJob(job), reponseJob(job));
    } catch (error) {
      logger.error({ message: error instanceof Error ? error.message : "Erreur inconnue" }, "Suivi des générations indisponible");
      return json(503, {
        error: FOCUS_TRAINING_TRACKING_UNAVAILABLE_MESSAGE,
        code: FOCUS_TRAINING_TRACKING_UNAVAILABLE_CODE,
      });
    }
  }

  if (!apiKey) return json(503, GEMINI_NOT_CONFIGURED);
  const refus = await consommerQuota(utilisateur.uid);
  if (refus) return json(refus.status, { error: refus.error, code: refus.code });
  const result = await executerGeminiAvecReparation({
    apiKey,
    prompt,
    context,
    action,
    useGrounding: false,
    logger,
    signal: req.signal,
  });
  if (!result.ok) return json(result.status, { error: result.error, ...(result.code ? { code: result.code } : {}) });
  return json(200, reponseSucces(result.text));
};

export const config: Config = {
  path: "/api/focus-training",
};
