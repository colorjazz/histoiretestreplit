import { createHash } from "node:crypto";

export type GeminiContextCacheLogger = {
  warn?: (data: unknown, message: string) => void;
  info?: (data: unknown, message: string) => void;
};

export type GeminiContextCacheState =
  | "disabled"
  | "grounding_incompatible"
  | "too_small"
  | "created"
  | "reused"
  | "create_failed"
  | "expired"
  | "invalidated";

export type GeminiContextCacheLookup = {
  key: string;
  reference?: string;
  state: GeminiContextCacheState;
  durationMs: number;
};

export type GeminiContextCacheManagerOptions = {
  enabled?: boolean;
  ttlSeconds?: number;
  minimumTokens?: number;
  now?: () => number;
};

type CacheEntry = {
  reference: string;
  expiresAt: number;
};

const GEMINI_CACHE_URL = "https://generativelanguage.googleapis.com/v1beta/cachedContents";
const DEFAULT_TTL_SECONDS = 3_600;
const DEFAULT_MINIMUM_TOKENS = 4_096;

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function estimatedTokenCount(text: string): number {
  // This deliberately overestimates the number of characters per token. It is
  // only an activation guard; Gemini remains the authority on token counts.
  return Math.ceil(text.length / 4);
}

function fingerprint(model: string, action: string, stableContext: string): string {
  return createHash("sha256")
    .update(JSON.stringify({ model, action, stableContext }))
    .digest("hex");
}

export function createGeminiContextCacheManager(
  options: GeminiContextCacheManagerOptions = {},
) {
  const enabled = options.enabled ?? process.env.GEMINI_CONTEXT_CACHE_ENABLED !== "false";
  const ttlSeconds = options.ttlSeconds
    ?? positiveInteger(process.env.GEMINI_CONTEXT_CACHE_TTL_SECONDS, DEFAULT_TTL_SECONDS);
  const minimumTokens = options.minimumTokens
    ?? positiveInteger(process.env.GEMINI_CONTEXT_CACHE_MIN_TOKENS, DEFAULT_MINIMUM_TOKENS);
  const now = options.now ?? (() => Date.now());
  const entries = new Map<string, CacheEntry>();
  const inFlight = new Map<string, Promise<GeminiContextCacheLookup>>();

  const lookup = async ({
    apiKey,
    model,
    action,
    stableContext,
    fetcher,
    logger,
    signal,
  }: {
    apiKey: string;
    model: string;
    action: string;
    stableContext: string;
    fetcher: typeof fetch;
    logger?: GeminiContextCacheLogger;
    signal?: AbortSignal;
  }): Promise<GeminiContextCacheLookup> => {
    const startedAt = now();
    const key = fingerprint(model, action, stableContext);
    const result = (state: GeminiContextCacheState, reference?: string): GeminiContextCacheLookup => ({
      key,
      ...(reference ? { reference } : {}),
      state,
      durationMs: Math.max(0, now() - startedAt),
    });

    if (!enabled) return result("disabled");
    if (estimatedTokenCount(stableContext) < minimumTokens) return result("too_small");

    const existing = entries.get(key);
    if (existing && existing.expiresAt > now()) {
      return result("reused", existing.reference);
    }
    if (existing) entries.delete(key);

    const pending = inFlight.get(key);
    if (pending) return pending;

    const creation = (async () => {
      try {
        const response = await fetcher(GEMINI_CACHE_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          signal,
          body: JSON.stringify({
            model: `models/${model}`,
            systemInstruction: {
              parts: [{ text: stableContext }],
            },
            ttl: `${ttlSeconds}s`,
          }),
        });
        if (!response.ok) {
          logger?.warn?.(
            { phase: "context_cache_create", status: response.status, state: "create_failed" },
            "Cache de contexte Gemini indisponible; chemin direct conservé",
          );
          return result("create_failed");
        }
        const data = await response.json() as {
          name?: unknown;
          expireTime?: unknown;
          usageMetadata?: {
            cachedContentTokenCount?: number;
            totalCachedTokens?: number;
          };
        };
        if (typeof data.name !== "string" || !data.name.trim()) {
          logger?.warn?.(
            { phase: "context_cache_create", state: "create_failed" },
            "Gemini n'a pas retourné de référence de cache exploitable",
          );
          return result("create_failed");
        }
        const providerExpiry = typeof data.expireTime === "string"
          ? Date.parse(data.expireTime)
          : Number.NaN;
        const expiresAt = Number.isFinite(providerExpiry)
          ? providerExpiry
          : now() + ttlSeconds * 1_000;
        entries.set(key, { reference: data.name, expiresAt });
        logger?.info?.(
          {
            phase: "context_cache",
            state: "created",
            durationMs: Math.max(0, now() - startedAt),
            cachedPromptTokens: data.usageMetadata?.cachedContentTokenCount
              ?? data.usageMetadata?.totalCachedTokens,
          },
          "Cache de contexte Gemini créé",
        );
        return result("created", data.name);
      } catch {
        logger?.warn?.(
          { phase: "context_cache_create", state: "create_failed" },
          "Échec du cache de contexte Gemini; chemin direct conservé",
        );
        return result("create_failed");
      }
    })();

    inFlight.set(key, creation);
    try {
      return await creation;
    } finally {
      if (inFlight.get(key) === creation) inFlight.delete(key);
    }
  };

  return {
    lookup,
    invalidate(key: string): void {
      entries.delete(key);
    },
    clear(): void {
      entries.clear();
      inFlight.clear();
    },
  };
}
