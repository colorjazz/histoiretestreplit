/**
 * Stockage des générations longues (remplace la table Postgres du serveur Replit).
 * Sur Netlify : Netlify Blobs, cohérence forte. En local : mémoire du processus.
 */
import { getStore } from "@netlify/blobs";
import type { FocusTrainingProgress, GeminiResult } from "./focusTrainingLogic";

export const JOB_TTL_MS = 15 * 60 * 1000;
/** Au-delà de ce délai sans nouvelle, un job « pending » peut être repris. */
export const JOB_LEASE_MS = 90 * 1000;

export type FocusTrainingJob = {
  id: string;
  idempotencyKey: string;
  action: "generate" | "correct";
  prompt: string;
  status: "pending" | "completed" | "failed";
  progress: FocusTrainingProgress;
  result?: GeminiResult;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  workerId?: string;
  workerLeaseUntil?: number;
};

type Store = {
  get(key: string): Promise<any>;
  setJSON(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
};

const memoire = new Map<string, unknown>();
const storeMemoire: Store = {
  async get(key) { return memoire.get(key) ?? null; },
  async setJSON(key, value) { memoire.set(key, structuredClone(value)); },
  async delete(key) { memoire.delete(key); },
};

export function surNetlify(): boolean {
  return Boolean((globalThis as any).Netlify) || Boolean(process.env.NETLIFY_BLOBS_CONTEXT);
}

let storeCache: Store | undefined;
function store(): Store {
  if (storeCache) return storeCache;
  if (!surNetlify()) return (storeCache = storeMemoire);
  const blobs = getStore({ name: "focus-training-jobs", consistency: "strong" });
  const netlifyStore: Store = {
    get: (key) => blobs.get(key, { type: "json" }),
    setJSON: async (key, value) => { await blobs.setJSON(key, value); },
    delete: (key) => blobs.delete(key),
  };
  storeCache = netlifyStore;
  return netlifyStore;
}

const cleJob = (id: string) => `job/${id}`;
const cleIdem = (key: string) => `idem/${encodeURIComponent(key)}`;

function expire(job: FocusTrainingJob | null | undefined): boolean {
  return !job || job.expiresAt < Date.now();
}

export async function getJob(id: string): Promise<FocusTrainingJob | undefined> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return undefined;
  const job = await store().get(cleJob(id)) as FocusTrainingJob | null;
  if (expire(job)) return undefined;
  return job!;
}

export async function getJobByIdempotencyKey(key: string): Promise<FocusTrainingJob | undefined> {
  const ref = await store().get(cleIdem(key)) as { id?: string } | null;
  return ref?.id ? getJob(ref.id) : undefined;
}

export async function createJob(input: Pick<FocusTrainingJob, "id" | "idempotencyKey" | "action" | "prompt" | "progress">): Promise<FocusTrainingJob> {
  const now = Date.now();
  const job: FocusTrainingJob = {
    ...input,
    status: "pending",
    createdAt: now,
    updatedAt: now,
    expiresAt: now + JOB_TTL_MS,
  };
  await store().setJSON(cleJob(job.id), job);
  await store().setJSON(cleIdem(job.idempotencyKey), { id: job.id });
  return job;
}

async function ecrire(job: FocusTrainingJob): Promise<void> {
  job.updatedAt = Date.now();
  await store().setJSON(cleJob(job.id), job);
}

/** Réserve le job pour un exécuteur. Renvoie undefined s'il est déjà pris ou terminé. */
export async function claimJob(id: string, workerId: string): Promise<FocusTrainingJob | undefined> {
  const job = await getJob(id);
  if (!job || job.status !== "pending") return undefined;
  if (job.workerId && job.workerId !== workerId && (job.workerLeaseUntil ?? 0) > Date.now()) return undefined;
  job.workerId = workerId;
  job.workerLeaseUntil = Date.now() + JOB_LEASE_MS;
  await ecrire(job);
  // Relecture : si un autre exécuteur a écrit entre-temps, on lui laisse le job.
  const relu = await getJob(id);
  return relu?.workerId === workerId ? relu : undefined;
}

export async function updateProgress(id: string, workerId: string, progress: FocusTrainingProgress): Promise<void> {
  const job = await getJob(id);
  if (!job || job.status !== "pending" || job.workerId !== workerId) return;
  job.progress = progress;
  job.workerLeaseUntil = Date.now() + JOB_LEASE_MS;
  await ecrire(job);
}

export async function finishJob(id: string, workerId: string, result: GeminiResult, progress: FocusTrainingProgress): Promise<void> {
  const job = await getJob(id);
  if (!job || job.status !== "pending" || job.workerId !== workerId) return;
  job.status = result.ok ? "completed" : "failed";
  job.result = result;
  job.progress = progress;
  job.workerLeaseUntil = undefined;
  await ecrire(job);
}

/** Renouvelle le bail pendant qu'un exécuteur travaille encore. */
export async function renewLease(id: string, workerId: string): Promise<void> {
  const job = await getJob(id);
  if (!job || job.status !== "pending" || job.workerId !== workerId) return;
  job.workerLeaseUntil = Date.now() + JOB_LEASE_MS;
  await ecrire(job);
}

/**
 * Vrai si personne ne travaille sur ce job : bail expiré, ou jamais pris
 * après le délai de grâce qui suit sa création.
 */
export function jobOrphelin(job: FocusTrainingJob): boolean {
  if (job.status !== "pending") return false;
  const limite = job.workerLeaseUntil ?? job.createdAt + JOB_LEASE_MS;
  return limite < Date.now();
}
