/**
 * Protection du service Gemini : seul un utilisateur connecté à Firebase peut
 * lancer une génération ou une correction, et chacun a une limite d'appels.
 *
 * Le jeton Firebase (ID token) est vérifié avec les clés publiques de Google :
 * aucun compte de service n'est nécessaire.
 *
 * Variables facultatives :
 *   FIREBASE_PROJECT_ID   (défaut : histoire-nationale)
 *   QUOTA_PAR_HEURE       (défaut : 60 appels par utilisateur)
 *   QUOTA_PAR_JOUR        (défaut : 300 appels par utilisateur)
 *   QUOTA_GLOBAL_PAR_JOUR (défaut : 6000 appels pour tout le site)
 */
import { getStore } from "@netlify/blobs";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { surNetlify } from "./jobs";
import { logger } from "./logger";

const CLES_GOOGLE = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"),
);

export type RefusAcces = { status: number; code: string; error: string };

function entier(nom: string, defaut: number): number {
  const valeur = Number(process.env[nom]);
  return Number.isFinite(valeur) && valeur > 0 ? Math.floor(valeur) : defaut;
}

/** Hors Netlify (serveur local, mode démo), la vérification est sautée sauf si on la force. */
function verificationActive(): boolean {
  return surNetlify() || process.env.FOCUS_AUTH_FORCE === "1";
}

export async function identifierUtilisateur(req: Request): Promise<{ uid: string } | RefusAcces> {
  if (!verificationActive()) return { uid: "local" };
  const entete = req.headers.get("authorization") || "";
  const jeton = entete.startsWith("Bearer ") ? entete.slice(7).trim() : "";
  if (!jeton) {
    return { status: 401, code: "AUTH_REQUIRED", error: "Connecte-toi pour utiliser corrige.moi." };
  }
  const projet = process.env.FIREBASE_PROJECT_ID || "histoire-nationale";
  try {
    const { payload } = await jwtVerify(jeton, CLES_GOOGLE, {
      issuer: `https://securetoken.google.com/${projet}`,
      audience: projet,
    });
    if (!payload.sub) throw new Error("Jeton sans utilisateur");
    return { uid: payload.sub };
  } catch (error) {
    logger.warn({ raison: error instanceof Error ? error.name : "inconnue" }, "Jeton Firebase refusé");
    return { status: 401, code: "AUTH_REQUIRED", error: "Ta session a expiré. Reconnecte-toi pour continuer." };
  }
}

type Compteurs = Map<string, number>;
const compteursMemoire: Compteurs = new Map();

async function incrementer(cle: string): Promise<number> {
  if (!surNetlify()) {
    const valeur = (compteursMemoire.get(cle) || 0) + 1;
    compteursMemoire.set(cle, valeur);
    return valeur;
  }
  // Lecture puis écriture : deux appels simultanés peuvent compter pour un, ce qui
  // reste acceptable pour un plafond de protection.
  const store = getStore({ name: "quotas-gemini", consistency: "strong" });
  const actuel = Number(await store.get(cle, { type: "text" })) || 0;
  await store.set(cle, String(actuel + 1));
  return actuel + 1;
}

/** Compte un appel et refuse au-delà des plafonds. En cas de panne du stockage, on laisse passer. */
export async function consommerQuota(uid: string): Promise<RefusAcces | null> {
  const maintenant = new Date();
  const jour = maintenant.toISOString().slice(0, 10);
  const heure = maintenant.toISOString().slice(0, 13);
  const uidSur = encodeURIComponent(uid);
  try {
    const [parHeure, parJour, global] = await Promise.all([
      incrementer(`heure/${heure}/${uidSur}`),
      incrementer(`jour/${jour}/${uidSur}`),
      incrementer(`global/${jour}`),
    ]);
    if (global > entier("QUOTA_GLOBAL_PAR_JOUR", 6000)) {
      logger.warn({ global }, "Plafond quotidien global atteint");
      return { status: 429, code: "QUOTA_GLOBAL", error: "corrige.moi a atteint sa limite d’activités pour aujourd’hui. Reviens demain!" };
    }
    if (parJour > entier("QUOTA_PAR_JOUR", 300) || parHeure > entier("QUOTA_PAR_HEURE", 60)) {
      logger.warn({ uid, parHeure, parJour }, "Quota d'un utilisateur atteint");
      return { status: 429, code: "QUOTA_UTILISATEUR", error: "Tu as atteint la limite d’activités pour le moment. Prends une pause et reviens un peu plus tard." };
    }
    return null;
  } catch (error) {
    logger.error({ message: error instanceof Error ? error.message : "inconnue" }, "Quotas indisponibles");
    return null;
  }
}
