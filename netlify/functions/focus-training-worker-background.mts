/**
 * Fonction d'arrière-plan (suffixe -background : jusqu'à 15 minutes).
 * Exécute un job de génération créé par /api/focus-training.
 * Elle ne fait rien pour un identifiant inconnu, terminé ou déjà pris.
 */
import { randomUUID } from "node:crypto";
import { buildEducationalContext } from "../lib/histoire-educational-context";
import { estLotDeDixQuestions, executerGeminiAvecReparation, type GeminiResult } from "../lib/focusTrainingLogic";
import { enregistrerLot } from "../lib/banque";
import { claimJob, finishJob, JOB_LEASE_MS, renewLease, updateProgress } from "../lib/jobs";
import { logger } from "../lib/logger";
import { lireEnv } from "../lib/focus-service";

export default async (req: Request): Promise<void> => {
  const { jobId } = await req.json().catch(() => ({})) as { jobId?: string };
  if (typeof jobId !== "string") return;

  const workerId = randomUUID();
  const job = await claimJob(jobId, workerId);
  if (!job) return;

  const apiKey = lireEnv("GEMINI_API_KEY");
  if (!apiKey) {
    await finishJob(job.id, workerId, {
      ok: false,
      status: 503,
      code: "GEMINI_NOT_CONFIGURED",
      error: "Le service Gemini n'est pas configuré. Ajoute GEMINI_API_KEY dans les variables d'environnement Netlify.",
    }, job.progress);
    return;
  }

  let progress = job.progress;
  // Toutes les écritures passent par une file : une mise à jour de progression
  // tardive ne peut jamais écraser le résultat final.
  let file: Promise<unknown> = Promise.resolve();
  const enfiler = (operation: () => Promise<void>) => {
    file = file.then(operation).catch(() => undefined);
    return file;
  };
  const heartbeat = setInterval(() => {
    void enfiler(() => renewLease(job.id, workerId));
  }, Math.floor(JOB_LEASE_MS / 3));
  try {
    const result = await executerGeminiAvecReparation({
      apiKey,
      prompt: job.prompt,
      context: buildEducationalContext(job.action),
      action: job.action,
      // Comme le serveur Replit : recherche Google pour les générations.
      useGrounding: job.action === "generate",
      logger,
      onProgress: (next) => {
        progress = next;
        void enfiler(() => updateProgress(job.id, workerId, next));
      },
    });
    if (result.ok) progress = { stage: "completed", completedParts: 2, totalParts: 2, percent: 100 };
    logger.info(
      { jobId: job.id, ok: result.ok, status: result.ok ? 200 : result.status, durationMs: Date.now() - job.createdAt },
      "Job de génération terminé",
    );
    clearInterval(heartbeat);
    await enfiler(() => finishJob(job.id, workerId, result, progress));
    // Un lot de 10 questions accepté alimente la réserve (utilisée si une
    // génération future échoue). Une erreur ici n'affecte pas l'élève.
    if (result.ok && estLotDeDixQuestions(job.prompt)) {
      try {
        const ajoutees = await enregistrerLot(job.prompt, result.text);
        logger.info({ jobId: job.id, ajoutees }, "Questions versées dans la réserve");
      } catch (error) {
        logger.warn({ jobId: job.id, message: error instanceof Error ? error.message : "Erreur inconnue" }, "Réserve non mise à jour");
      }
    }
  } catch (error) {
    logger.error({ jobId: job.id, message: error instanceof Error ? error.message : "Erreur inconnue" }, "Échec inattendu du job");
    const failure: GeminiResult = {
      ok: false,
      status: 502,
      error: "La génération des questions a échoué. Réessaie dans quelques instants.",
    };
    clearInterval(heartbeat);
    await enfiler(() => finishJob(job.id, workerId, failure, progress));
  } finally {
    clearInterval(heartbeat);
  }
};
