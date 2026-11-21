import {
  supabaseAccessToken,
  supabaseReadsEnabled,
  supabaseWritesEnabled,
} from "./authMigrationClient";

export type SupabaseStudentResult = Record<string, unknown> & {
  id: string;
  horodatage?: unknown;
};

function apiPath(path: string): string {
  const base = import.meta.env.BASE_URL || "/";
  return `${base.replace(/\/?$/, "/")}${path.replace(/^\/+/, "")}`;
}

function normalizedCode(code: string): string {
  return code.trim().toUpperCase();
}

async function request<T>(path: string, init: RequestInit): Promise<T | null> {
  const token = supabaseAccessToken();
  if (!token) return null;
  try {
    const response = await fetch(apiPath(path), {
      ...init,
      credentials: "same-origin",
      headers: {
        ...(init.headers || {}),
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
    if (!response.ok) return null;
    return await response.json() as T;
  } catch {
    return null;
  }
}

export async function lireResultatsSupabase(code: string): Promise<SupabaseStudentResult[] | null> {
  if (!supabaseReadsEnabled()) return null;
  const normalized = normalizedCode(code);
  if (!normalized) return [];
  const body = await request<{ results?: unknown[] }>(
    `api/migration/supabase/student-results?code=${encodeURIComponent(normalized)}`,
    { method: "GET" },
  );
  if (!body || !Array.isArray(body.results)) return null;
  return body.results.filter((result): result is SupabaseStudentResult =>
    Boolean(result && typeof result === "object" && typeof (result as { id?: unknown }).id === "string"),
  );
}

export async function ecrireResultatSupabase(
  code: string,
  result: Record<string, unknown>,
): Promise<SupabaseStudentResult | null> {
  if (!supabaseWritesEnabled()) return null;
  const body = await request<{ result?: unknown }>(
    "api/migration/supabase/student-results",
    {
      method: "POST",
      body: JSON.stringify({ code: normalizedCode(code), result }),
    },
  );
  const saved = body?.result;
  return saved && typeof saved === "object" && typeof (saved as { id?: unknown }).id === "string"
    ? saved as SupabaseStudentResult
    : null;
}