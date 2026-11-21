export type ShadowReadResult = {
  id: string;
  horodatage?: unknown;
};

function apiPath(path: string): string {
  const base = import.meta.env.BASE_URL || "/";
  return `${base.replace(/\/?$/, "/")}${path.replace(/^\/+/, "")}`;
}

function shadowReadEnabled(): boolean {
  return String(import.meta.env.VITE_FIREBASE_SUPABASE_SHADOW_READ || "").toLowerCase() === "true";
}

/**
 * Sends a minimal, non-blocking summary. Firebase remains the displayed
 * source of truth. The client flag avoids even making the request when
 * shadow verification is parked.
 */
export function signalerLectureFirebase(
  uid: string | undefined,
  code: string,
  results: ShadowReadResult[],
): void {
  if (!shadowReadEnabled()) return;
  void fetch(apiPath("api/migration/shadow/compare"), {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      firebase: {
        uid: uid || undefined,
        code,
        results: results.slice(0, 2_000).map((result) => ({
          id: result.id,
          horodatage: result.horodatage,
        })),
      },
    }),
  }).catch(() => {
    // Shadow verification must never block or change the Firebase journey.
  });
}
