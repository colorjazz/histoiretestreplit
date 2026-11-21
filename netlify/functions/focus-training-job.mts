/** GET /api/focus-training/jobs/:jobId — suivi d'une génération. */
import type { Config, Context } from "@netlify/functions";
import { getJob, jobOrphelin } from "../lib/jobs";
import { logger } from "../lib/logger";
import {
  declencherWorker,
  FOCUS_TRAINING_JOB_EXPIRED_CODE,
  FOCUS_TRAINING_TRACKING_UNAVAILABLE_CODE,
  FOCUS_TRAINING_TRACKING_UNAVAILABLE_MESSAGE,
  json,
  reponseJob,
  statutHttpJob,
} from "../lib/focus-service";

export default async (req: Request, context: Context): Promise<Response> => {
  const jobId = context?.params?.jobId ?? new URL(req.url).pathname.split("/").pop() ?? "";
  try {
    const job = await getJob(decodeURIComponent(jobId));
    if (!job) {
      return json(404, {
        error: "Cette génération n'est plus disponible. Lance une nouvelle génération.",
        code: FOCUS_TRAINING_JOB_EXPIRED_CODE,
      });
    }
    // Un exécuteur interrompu (redéploiement, plantage) : on relance le travail.
    if (jobOrphelin(job)) await declencherWorker(new URL(req.url).origin, job.id);
    return json(statutHttpJob(job), reponseJob(job));
  } catch (error) {
    logger.error({ message: error instanceof Error ? error.message : "Erreur inconnue" }, "Lecture du job impossible");
    return json(503, {
      error: FOCUS_TRAINING_TRACKING_UNAVAILABLE_MESSAGE,
      code: FOCUS_TRAINING_TRACKING_UNAVAILABLE_CODE,
    });
  }
};

export const config: Config = {
  path: "/api/focus-training/jobs/:jobId",
};
