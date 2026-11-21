import { auth } from "../firebase";

export type PushProfile = {
  studentCode: string;
  studentName: string;
  level: 3 | 4 | null;
};

export type PushActivity = PushProfile & {
  event: "app-opened" | "result-saved";
  score?: unknown;
  operation?: unknown;
};

export type PushAvailability = {
  supported: boolean;
  configured: boolean;
  permission: NotificationPermission | "unsupported";
};

const PROMPT_DELAY_KEY = "corrige-push-prompt-after";
const PROMPT_DELAY_MS = 7 * 24 * 60 * 60 * 1_000;

function pushSupported(): boolean {
  return typeof window !== "undefined"
    && "Notification" in window
    && "serviceWorker" in navigator
    && "PushManager" in window;
}

function urlBase64ToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const decoded = window.atob(base64);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

function sameApplicationServerKey(subscription: PushSubscription, publicKey: string): boolean {
  const existing = subscription.options.applicationServerKey;
  if (!existing) return false;
  const currentBytes = new Uint8Array(existing);
  const expectedBytes = urlBase64ToUint8Array(publicKey);
  return currentBytes.length === expectedBytes.length
    && currentBytes.every((value, index) => value === expectedBytes[index]);
}

async function firebaseAuthorizationHeader(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) throw new Error("Connecte-toi avant d’activer les notifications.");
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

async function pushRequest(path: string, init: RequestInit = {}): Promise<any> {
  const authorization = await firebaseAuthorizationHeader();
  const response = await fetch(path, {
    ...init,
    headers: {
      ...authorization,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(body?.error || "Le service de notifications est indisponible."));
  return body;
}

export async function getPushAvailability(): Promise<PushAvailability> {
  if (!pushSupported()) {
    return { supported: false, configured: false, permission: "unsupported" };
  }
  try {
    const response = await fetch("/api/push-notifications/public-key");
    const body = await response.json().catch(() => ({}));
    return {
      supported: true,
      configured: response.ok && body?.configured === true && typeof body?.publicKey === "string",
      permission: Notification.permission,
    };
  } catch {
    return { supported: true, configured: false, permission: Notification.permission };
  }
}

export function shouldPromptForPush(): boolean {
  if (!pushSupported() || Notification.permission !== "default") return false;
  try {
    const promptAfter = Number(window.localStorage.getItem(PROMPT_DELAY_KEY) || 0);
    return !Number.isFinite(promptAfter) || promptAfter <= Date.now();
  } catch {
    return true;
  }
}

export function postponePushPrompt(): void {
  try {
    window.localStorage.setItem(PROMPT_DELAY_KEY, String(Date.now() + PROMPT_DELAY_MS));
  } catch {
    // Le report reste limité à la session si le navigateur bloque le stockage.
  }
}

export async function enablePushNotifications(profile: PushProfile): Promise<PushAvailability> {
  const availability = await getPushAvailability();
  if (!availability.supported) {
    throw new Error("Les notifications push ne sont pas prises en charge sur cet appareil.");
  }
  if (!availability.configured) {
    throw new Error("Le service de notifications push n’est pas encore configuré.");
  }

  const permission = Notification.permission === "granted"
    ? "granted"
    : await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error(permission === "denied"
      ? "Les notifications sont bloquées dans les réglages du navigateur."
      : "L’autorisation de notification n’a pas été accordée.");
  }

  const configResponse = await fetch("/api/push-notifications/public-key");
  const config = await configResponse.json();
  const registration = await navigator.serviceWorker.register("/push-sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  let existing = await registration.pushManager.getSubscription();
  if (existing && !sameApplicationServerKey(existing, config.publicKey)) {
    await existing.unsubscribe();
    existing = null;
  }
  const subscription = existing || await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(config.publicKey),
  });

  await pushRequest("/api/push-notifications/subscribe", {
    method: "POST",
    body: JSON.stringify({
      subscription: subscription.toJSON(),
      ...profile,
    }),
  });
  try {
    window.localStorage.removeItem(PROMPT_DELAY_KEY);
  } catch {
    // Aucun impact sur l’abonnement.
  }
  return { supported: true, configured: true, permission: "granted" };
}

export async function reportPushActivity(activity: PushActivity): Promise<void> {
  if (!pushSupported() || Notification.permission !== "granted") return;
  try {
    await pushRequest("/api/push-notifications/activity", {
      method: "POST",
      body: JSON.stringify(activity),
    });
  } catch {
    // Une panne push ne doit jamais bloquer l’exercice ou sa sauvegarde.
  }
}