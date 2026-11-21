export const FOCUS_TRAINING_ACTIONS = ["generate", "correct"] as const;
export type FocusTrainingAction = (typeof FOCUS_TRAINING_ACTIONS)[number];

export const FOCUS_TRAINING_MIN_PROMPT_LENGTH = 40;
export const FOCUS_TRAINING_MAX_PROMPT_LENGTH = 60000;

export type FocusTrainingRequest =
  | { ok: true; action: FocusTrainingAction; prompt: string }
  | { ok: false; status: 400; error: string };

export function validerRequeteFocusTraining(body: unknown): FocusTrainingRequest {
  const candidate = body && typeof body === "object"
    ? body as { action?: unknown; prompt?: unknown }
    : {};
  const action = candidate.action;
  const prompt = candidate.prompt;

  if (!FOCUS_TRAINING_ACTIONS.includes(action as FocusTrainingAction)) {
    return { ok: false, status: 400, error: "Action de formation invalide." };
  }
  if (
    typeof prompt !== "string"
    || prompt.trim().length < FOCUS_TRAINING_MIN_PROMPT_LENGTH
    || prompt.length > FOCUS_TRAINING_MAX_PROMPT_LENGTH
  ) {
    return { ok: false, status: 400, error: "Le contexte de formation est incomplet ou trop volumineux." };
  }

  return { ok: true, action: action as FocusTrainingAction, prompt };
}