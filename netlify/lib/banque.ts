/**
 * Réserve de lots de la Section A.
 *
 * Chaque lot de 10 questions accepté par le serveur y est versé, question par
 * question, classé par module (réponses courtes / opérations) et par période.
 * Quand la génération échoue malgré les relances, l'appli demande un lot de
 * réserve assemblé à partir de ces questions.
 *
 * Stockage : Netlify Blobs (cohérence forte) une fois déployé, mémoire en local,
 * plus une réserve initiale livrée avec le code (banque-initiale.json).
 */
import { createHash } from "node:crypto";
import { getStore } from "@netlify/blobs";
import {
  assainirRattachementPFEQSectionA,
  classementChronologiqueValide,
  documentEstVisuelPourReponse,
  getSectionAFormat,
  validerRattachementPFEQ,
} from "../../src/histoire/assessmentContracts.ts";
import banqueInitiale from "./banque-initiale.json";

export type Parcours = "reponses" | "operations";
export type EntreeBanque = {
  id: string;
  parcours: Parcours;
  periodeId: number;
  format: string;
  operationId?: string;
  chrono?: boolean;
  question: any;
};

const MAX_PAR_CASE = 150;
const OPERATIONS_REQUISES: Record<string, string> = {
  faits: "court",
  "espace-temps": "classement",
  "mise-en-relation": "association-paires",
  "causes-consequences": "court",
  "liens-causalite": "causalite-3",
  "continuite-changement": "changement-continuite",
  comparaisons: "comparaison",
};

type Store = { get(key: string): Promise<any>; setJSON(key: string, value: unknown): Promise<void> };
const memoire = new Map<string, unknown>();
let storeCache: Store | undefined;
function store(): Store {
  if (storeCache) return storeCache;
  if (!(globalThis as any).Netlify && !process.env.NETLIFY_BLOBS_CONTEXT) {
    storeCache = {
      async get(key) { return memoire.get(key) ?? null; },
      async setJSON(key, value) { memoire.set(key, structuredClone(value)); },
    };
    return storeCache;
  }
  const blobs = getStore({ name: "banque-section-a", consistency: "strong" });
  storeCache = {
    get: (key) => blobs.get(key, { type: "json" }),
    setJSON: async (key, value) => { await blobs.setJSON(key, value); },
  };
  return storeCache;
}

const cleCase = (parcours: Parcours, periodeId: number) => `case/${parcours}/${periodeId}`;

export function parcoursDuPrompt(prompt: string): Parcours | null {
  if (/MODULE\s+RÉPONSES COURTES/i.test(prompt)) return "reponses";
  if (/MODULE\s+OPÉRATIONS INTELLECTUELLES/i.test(prompt)) return "operations";
  return null;
}

function texte(value: unknown): string {
  return String(value ?? "").trim();
}

function identifiant(question: any): string {
  return createHash("sha256").update(texte(question?.question).toLowerCase()).digest("hex").slice(0, 16);
}

/** Une question n'entre en réserve que si l'appli pourra l'afficher sans réparation. */
export function entreeAdmissible(question: any, parcours: Parcours): EntreeBanque | null {
  if (!question || typeof question !== "object" || !texte(question.question)) return null;
  const periodeId = Number(question.periodeId);
  if (!Number.isInteger(periodeId) || periodeId < 1 || periodeId > 8) return null;
  const q = assainirRattachementPFEQSectionA(structuredClone(question));
  try {
    validerRattachementPFEQ(q);
  } catch {
    return null;
  }
  const format = getSectionAFormat(q);
  const chrono = format === "court" && classementChronologiqueValide(q.elementsChronologiques);
  const documents = Array.isArray(q.documents) ? q.documents : [];
  if (!chrono) {
    if (documents.length === 0 || documents.some(documentEstVisuelPourReponse)) return null;
    if (documents.some((d: any) => !texte(d?.titre) || !texte(d?.typeDoc) || !texte(d?.reference) || !texte(d?.texte))) return null;
  }
  if (format === "qcm") {
    const choix = Array.isArray(q.choix) ? q.choix.map(texte) : [];
    if (choix.length !== 4 || new Set(choix.map((c: string) => c.toLowerCase())).size !== 4 || choix.some((c: string) => !c)) return null;
    if (!Number.isInteger(q.indexReponseCorrecte) || q.indexReponseCorrecte < 0 || q.indexReponseCorrecte > 3) return null;
  } else if (format === "court") {
    if (chrono) {
      // L'appli exige une réponse attendue partout; pour un classement, elle se
      // déduit de l'ordre des éléments (déjà du plus ancien au plus récent).
      if (!texte(q.reponseAttendue)) {
        q.reponseAttendue = `Ordre chronologique : ${q.elementsChronologiques
          .map((element: any) => `${texte(element.label)}${texte(element.annee) ? ` (${texte(element.annee)})` : ""}`)
          .join(" → ")}.`;
      }
      if (!Array.isArray(q.criteresCorrection) || q.criteresCorrection.length === 0) {
        q.criteresCorrection = ["Les quatre éléments sont placés du plus ancien au plus récent."];
      }
    }
    if (!texte(q.reponseAttendue) || !Array.isArray(q.criteresCorrection) || q.criteresCorrection.length === 0) return null;
  }
  if (parcours === "reponses" && !["qcm", "court"].includes(format)) return null;
  const operationId = parcours === "operations" && texte(q.operationId) ? texte(q.operationId) : undefined;
  if (parcours === "operations" && !operationId && format !== "qcm") return null;
  if (operationId && OPERATIONS_REQUISES[operationId] !== format) return null;
  if (parcours === "reponses") { delete q.operationId; delete q.operation; }
  return { id: identifiant(q), parcours, periodeId, format, ...(operationId ? { operationId } : {}), ...(chrono ? { chrono } : {}), question: q };
}

/** Verse les questions d'un lot accepté dans la réserve. Ne lève jamais d'erreur. */
export async function enregistrerLot(prompt: string, texteLot: string): Promise<number> {
  const parcours = parcoursDuPrompt(prompt);
  if (!parcours) return 0;
  let questions: unknown;
  try { questions = JSON.parse(texteLot); } catch { return 0; }
  if (!Array.isArray(questions)) return 0;
  const parCase = new Map<number, EntreeBanque[]>();
  for (const question of questions) {
    const entree = entreeAdmissible(question, parcours);
    if (!entree) continue;
    parCase.set(entree.periodeId, [...(parCase.get(entree.periodeId) || []), entree]);
  }
  let ajoutees = 0;
  for (const [periodeId, entrees] of parCase) {
    const cle = cleCase(parcours, periodeId);
    const actuelles = ((await store().get(cle)) as EntreeBanque[] | null) || [];
    const connues = new Set(actuelles.map((e) => e.id));
    const nouvelles = entrees.filter((e) => !connues.has(e.id));
    ajoutees += nouvelles.length;
    if (nouvelles.length) await store().setJSON(cle, [...actuelles, ...nouvelles].slice(-MAX_PAR_CASE));
  }
  return ajoutees;
}

function melanger<T>(items: T[]): T[] {
  const copie = items.slice();
  for (let i = copie.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copie[i], copie[j]] = [copie[j], copie[i]];
  }
  return copie;
}

/** Les « emplacements » d'un lot : chacun doit être rempli par une question compatible. */
function emplacements(parcours: Parcours): Array<(e: EntreeBanque) => boolean> {
  if (parcours === "reponses") {
    return [
      (e) => e.format === "court" && Boolean(e.chrono),
      ...Array(4).fill((e: EntreeBanque) => e.format === "court"),
      ...Array(5).fill((e: EntreeBanque) => e.format === "qcm"),
    ];
  }
  return [
    ...Object.keys(OPERATIONS_REQUISES).map((op) => (e: EntreeBanque) => e.operationId === op),
    ...Array(3).fill((e: EntreeBanque) => e.format === "qcm" && !e.operationId),
  ];
}

/**
 * Assemble un lot de 10 questions des périodes demandées, sans question déjà
 * vue, en couvrant chaque période au moins une fois. null si la réserve ne
 * permet pas un lot complet.
 */
export async function tirerLot(parcours: Parcours, periodes: number[], exclus: Set<string>): Promise<EntreeBanque[] | null> {
  const candidates: EntreeBanque[] = [];
  const vus = new Set<string>();
  for (const periodeId of periodes) {
    const stockees = ((await store().get(cleCase(parcours, periodeId))) as EntreeBanque[] | null) || [];
    const initiales = (banqueInitiale as EntreeBanque[]).filter((e) => e.parcours === parcours && e.periodeId === periodeId);
    for (const e of [...initiales, ...stockees]) {
      if (exclus.has(e.id) || vus.has(e.id)) continue;
      vus.add(e.id);
      candidates.push(e);
    }
  }
  for (let essai = 0; essai < 40; essai += 1) {
    const pool = melanger(candidates);
    const choisis: EntreeBanque[] = [];
    const pris = new Set<string>();
    let ok = true;
    for (const accepte of emplacements(parcours)) {
      // Priorité aux périodes encore absentes du lot.
      const manquantes = new Set(periodes.filter((p) => !choisis.some((c) => c.periodeId === p)));
      const compatibles = pool.filter((e) => !pris.has(e.id) && accepte(e));
      const choix = compatibles.find((e) => manquantes.has(e.periodeId)) || compatibles[0];
      if (!choix) { ok = false; break; }
      choisis.push(choix); pris.add(choix.id);
    }
    if (ok && periodes.every((p) => choisis.some((c) => c.periodeId === p))) return melanger(choisis);
  }
  return null;
}
