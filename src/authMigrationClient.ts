function apiPath(path: string): string {
  const base = import.meta.env.BASE_URL || "/";
  return `${base.replace(/\/?$/, "/")}${path.replace(/^\/+/, "")}`;
}

type SupabaseSession = {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  expires_in?: number;
  token_type?: string;
  user?: unknown;
};

const SESSION_STORAGE_KEY = "corrige.moi.supabase.session";

export function supabaseAccessToken(): string | null {
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as SupabaseSession;
    return typeof session.access_token === "string" && session.access_token.trim()
      ? session.access_token
      : null;
  } catch {
    return null;
  }
}

export function supabaseReadsEnabled(): boolean {
  return String(import.meta.env.VITE_FIREBASE_SUPABASE_READS || "").toLowerCase() === "true";
}

export function supabaseWritesEnabled(): boolean {
  return String(import.meta.env.VITE_FIREBASE_SUPABASE_WRITES || "").toLowerCase() === "true";
}

export function supabaseAuthMigrationEnabled(): boolean {
  return String(import.meta.env.VITE_FIREBASE_SUPABASE_AUTH_MIGRATION || "").toLowerCase() === "true";
}

function supabaseUrl(): string {
  return String(import.meta.env.VITE_SUPABASE_URL || "").replace(/\/+$/, "");
}

function supabasePublishableKey(): string {
  return String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "");
}

async function ouvrirSessionSupabase(email: string, password: string): Promise<boolean> {
  const baseUrl = supabaseUrl();
  const publishableKey = supabasePublishableKey();
  if (!baseUrl || !publishableKey) return false;

  const response = await fetch(`${baseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: publishableKey,
    },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) return false;

  const session = await response.json() as SupabaseSession;
  if (!session.access_token) return false;
  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  return true;
}

/**
 * Après une connexion Firebase réussie, demande au serveur de vérifier le même
 * mot de passe avec le hash exporté puis de le définir dans Supabase.
 * Cette opération est volontairement non bloquante : Firebase reste la source
 * d'authentification tant que la bascule n'est pas explicitement activée.
 */
export function preparerMotDePasseSupabase(email: string, password: string): void {
  if (!supabaseAuthMigrationEnabled()) return;
  void (async () => {
    const response = await fetch(apiPath("api/migration/auth/upgrade-password"), {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (response.ok) await ouvrirSessionSupabase(email, password);
  })().catch(() => {
    // Une indisponibilité de la migration ne doit jamais casser Firebase.
  });
}