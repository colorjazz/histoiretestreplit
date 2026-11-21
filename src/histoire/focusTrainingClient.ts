export type FocusTrainingAction = "generate" | "correct";
export type FocusTrainingErrorCode =
  | "GEMINI_NOT_CONFIGURED"
  | "FOCUS_TRAINING_JOB_EXPIRED"
  | "FOCUS_TRAINING_TRACKING_UNAVAILABLE";

export type FocusTrainingResponse = {
  text: string;
  sourceCatalog?: unknown;
  researchPolicy?: string;
  model?: string;
};

export type FocusTrainingProgress = {
  stage: "queued" | "generating" | "validating" | "completed";
  completedParts: number;
  totalParts: number;
  percent: number;
};

export type FocusTrainingCallOptions = {
  requestId?: string;
  statusUrl?: string;
  onJobCreated?: (job: FocusTrainingJobReference) => void;
  onProgress?: (progress: FocusTrainingProgress) => void;
  pollIntervalMs?: number;
  maxPollAttempts?: number;
  maxPollRetries?: number;
  pollRetryDelayMs?: number;
};

export type FocusTrainingJobReference = {
  jobId: string;
  requestId: string;
  statusUrl: string;
};

type FocusTrainingErrorPhase = "start" | "polling";

const MESSAGES_ERREUR_SÛRS: Record<FocusTrainingErrorCode, string> = {
  GEMINI_NOT_CONFIGURED:
    "Le service de génération n’est pas configuré. Demande à un administrateur de vérifier sa configuration.",
  FOCUS_TRAINING_JOB_EXPIRED:
    "Cette génération n’est plus disponible. Lance une nouvelle génération.",
  FOCUS_TRAINING_TRACKING_UNAVAILABLE:
    "Le suivi de la génération est temporairement indisponible. Réessaie dans quelques instants.",
};

function messageErreurSûr(
  status: number,
  code: FocusTrainingErrorCode | undefined,
  phase: FocusTrainingErrorPhase,
): string {
  if (code) return MESSAGES_ERREUR_SÛRS[code];

  if (status === 0) {
    return phase === "polling"
      ? "La connexion au suivi de la génération a été interrompue. Tu peux reprendre sans créer un doublon."
      : "La connexion au service de formation a échoué. Tu peux relancer sans créer un doublon.";
  }
  if (status === 400) {
    return "La demande de formation est invalide. Vérifie les données puis réessaie.";
  }
  if (status === 404 && phase === "polling") {
    return MESSAGES_ERREUR_SÛRS.FOCUS_TRAINING_JOB_EXPIRED;
  }
  if (status === 409) {
    return "Cette demande de génération est déjà associée à un autre contenu. Lance une nouvelle génération.";
  }
  if (status === 429) {
    return "Le quota du service de génération est temporairement atteint. Réessaie dans quelques instants.";
  }
  if (status === 502 || status === 503 || status === 504) {
    return phase === "polling"
      ? MESSAGES_ERREUR_SÛRS.FOCUS_TRAINING_TRACKING_UNAVAILABLE
      : "Le service de formation est temporairement indisponible. Réessaie dans quelques instants.";
  }
  if (status >= 500) {
    return phase === "polling"
      ? "Le suivi de la génération a rencontré un problème. Réessaie dans quelques instants."
      : "Le service de formation a rencontré un problème. Réessaie dans quelques instants.";
  }
  return `La demande de formation n’a pas abouti (code ${status}). Réessaie.`;
}

export class FocusTrainingError extends Error {
  readonly status: number;
  readonly code?: FocusTrainingErrorCode;

  constructor(message: string, status = 0, code?: FocusTrainingErrorCode) {
    super(message);
    this.name = "FocusTrainingError";
    this.status = status;
    this.code = code;
  }
}

function extraireCodeErreur(data: any): FocusTrainingErrorCode | undefined {
  return data?.code === "GEMINI_NOT_CONFIGURED"
    || data?.code === "FOCUS_TRAINING_JOB_EXPIRED"
    || data?.code === "FOCUS_TRAINING_TRACKING_UNAVAILABLE"
    ? data.code
    : undefined;
}

export function construireRequeteFocus(action: FocusTrainingAction, prompt: string) {
  return {
    action,
    prompt,
  };
}

/**
 * Client unique du relais Gemini. Il valide l'enveloppe reçue avant de la
 * transmettre aux écrans afin qu'une réponse HTTP 200 incomplète ne soit
 * jamais traitée comme une correction réussie.
 */
export async function appelerFocusTraining(
  action: FocusTrainingAction,
  prompt: string,
  fetcher: typeof fetch = fetch,
  options: FocusTrainingCallOptions = {},
): Promise<FocusTrainingResponse> {
  const requete = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(options.requestId ? { "Idempotency-Key": options.requestId } : {}),
    },
    body: JSON.stringify(construireRequeteFocus(action, prompt)),
  };
  const statutsRetentables = new Set([502, 503, 504]);
  const requestId = options.requestId
    || globalThis.crypto?.randomUUID?.()
    || `focus-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  requete.headers["Idempotency-Key"] = requestId;
  const pollIntervalMs = options.pollIntervalMs ?? 400;
  const maxPollAttempts = options.maxPollAttempts ?? 225;
  const maxPollRetries = options.maxPollRetries ?? 4;
  const pollRetryDelayMs = options.pollRetryDelayMs ?? 350;

  const attendre = (delayMs: number) => new Promise((resolve) => setTimeout(resolve, delayMs));
  const attendreReprisePolling = (retry: number) => attendre(
    Math.min(2_000, pollRetryDelayMs * (2 ** retry)),
  );

  const suivreJob = async (
    statusUrl: string,
    initialProgress?: FocusTrainingProgress,
  ): Promise<FocusTrainingResponse> => {
    if (initialProgress) options.onProgress?.(initialProgress);

    let pollAttempt = 0;
    let pollRetry = 0;
    while (pollAttempt < maxPollAttempts) {
      let statusResponse: Response;
      try {
        statusResponse = await fetcher(statusUrl, { headers: { Accept: "application/json" } });
      } catch {
        if (pollRetry < maxPollRetries) {
          await attendreReprisePolling(pollRetry);
          pollRetry += 1;
          continue;
        }
        throw new FocusTrainingError(
          messageErreurSûr(0, undefined, "polling"),
          0,
        );
      }

      pollAttempt += 1;
      const data = await statusResponse.json().catch(() => ({}));
      if (data?.progress) options.onProgress?.(data.progress);
      if (statusResponse.ok && typeof data.text === "string" && data.text.trim()) {
        options.onProgress?.({
          stage: "completed",
          completedParts: 2,
          totalParts: 2,
          percent: 100,
        });
        return data as FocusTrainingResponse;
      }

      if (
        !statusResponse.ok
        && statutsRetentables.has(statusResponse.status)
        && data?.code !== "GEMINI_NOT_CONFIGURED"
      ) {
        if (pollRetry < maxPollRetries) {
          await attendreReprisePolling(pollRetry);
          pollRetry += 1;
          continue;
        }
      }

      pollRetry = 0;
      if (!statusResponse.ok && statusResponse.status !== 202) {
        const statusErrorCode = extraireCodeErreur(data);
        throw new FocusTrainingError(
          messageErreurSûr(statusResponse.status, statusErrorCode, "polling"),
          statusResponse.status,
          statusErrorCode,
        );
      }
      await attendre(pollIntervalMs);
    }
    throw new FocusTrainingError("La génération prend plus de temps que prévu. Tu peux relancer sans créer un doublon.", 504);
  };

  const lireReponse = async (response: Response, tentative: number): Promise<FocusTrainingResponse | null> => {
    const data = await response.json().catch(() => ({}));
    const errorCode = extraireCodeErreur(data);
    if (response.status === 202 && data?.jobId) {
      const statusUrl = typeof data.statusUrl === "string" && data.statusUrl.trim()
        ? data.statusUrl.trim()
        : `/api/focus-training/jobs/${encodeURIComponent(data.jobId)}`;
      options.onJobCreated?.({ jobId: String(data.jobId), requestId, statusUrl });
      return suivreJob(statusUrl, data.progress);
    }

    if (response.ok && !data?.error) {
      if (!data || typeof data.text !== "string" || !data.text.trim()) {
        throw new FocusTrainingError("Le service de formation a renvoyé une réponse vide.", response.status);
      }
      return data as FocusTrainingResponse;
    }

      if (
        tentative === 0
        && statutsRetentables.has(response.status)
        && errorCode !== "GEMINI_NOT_CONFIGURED"
      ) {
      await attendre(350);
      return null;
    }

    throw new FocusTrainingError(
      messageErreurSûr(response.status, errorCode, "start"),
      response.status,
      errorCode,
    );
  };

  if (options.statusUrl) {
    return suivreJob(options.statusUrl);
  }

  for (let tentative = 0; tentative < 2; tentative += 1) {
    try {
      const response = await fetcher("/api/focus-training", requete);
      const result = await lireReponse(response, tentative);
      if (result) return result;
    } catch (error) {
      if (
        error instanceof FocusTrainingError
        && error.code === "GEMINI_NOT_CONFIGURED"
      ) {
        throw error;
      }
      if (
        error instanceof FocusTrainingError
        && error.status !== 0
        && !statutsRetentables.has(error.status)
      ) {
        throw error;
      }
      if (tentative === 0) {
        await new Promise((resolve) => setTimeout(resolve, 350));
        continue;
      }
      if (error instanceof FocusTrainingError) throw error;
      throw new FocusTrainingError(messageErreurSûr(0, undefined, "start"));
    }
  }

  throw new FocusTrainingError(messageErreurSûr(503, undefined, "start"), 503);
}