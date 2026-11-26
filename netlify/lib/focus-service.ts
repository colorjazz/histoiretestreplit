import { SOURCES_DOCUMENTAIRES } from "./histoire-educational-context";
import { GEMINI_MODEL } from "./focusTrainingLogic";
import type { FocusTrainingJob } from "./jobs";

export const WORKER_PATH = "/.netlify/functions/focus-training-worker-background";
export const FOCUS_TRAINING_JOB_EXPIRED_CODE = "FOCUS_TRAINING_JOB_EXPIRED";
export const FOCUS_TRAINING_TRACKING_UNAVAILABLE_CODE = "FOCUS_TRAINING_TRACKING_UNAVAILABLE";
export const FOCUS_TRAINING_TRACKING_UNAVAILABLE_MESSAGE =
  "Le suivi de la génération est temporairement indisponible. Réessaie dans quelques instants.";

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export function lireEnv(nom: string): string | undefined {
  return (globalThis as any).Netlify?.env?.get?.(nom) ?? process.env[nom];
}

export function reponseSucces(text: string) {
  return {
    text,
    sourceCatalog: SOURCES_DOCUMENTAIRES,
    researchPolicy: "catalogue-autorise",
    model: GEMINI_MODEL,
  };
}

export function reponseJob(job: FocusTrainingJob) {
  if (job.status === "completed" && job.result?.ok) return reponseSucces(job.result.text);
  if (job.status === "failed" && job.result && !job.result.ok) {
    return { error: job.result.error, ...(job.result.code ? { code: job.result.code } : {}) };
  }
  return {
    jobId: job.id,
    status: job.status,
    statusUrl: `/api/focus-training/jobs/${job.id}`,
    progress: job.progress,
  };
}

export function statutHttpJob(job: FocusTrainingJob): number {
  if (job.status === "completed") return 200;
  if (job.status === "failed" && job.result && !job.result.ok) return job.result.status;
  return 202;
}

/** Lance la fonction d'arrière-plan qui exécute le job (jusqu'à 15 minutes). */
export async function declencherWorker(origin: string, jobId: string): Promise<void> {
  const response = await fetch(new URL(WORKER_PATH, origin), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jobId }),
  });
  if (!response.ok && response.status !== 202) {
    throw new Error(`Déclenchement du worker refusé (${response.status})`);
  }
}
