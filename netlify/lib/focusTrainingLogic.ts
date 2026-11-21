import {
  normaliserConsigneTroisPicots,
  normaliserQuestionSectionA as normaliserQuestionApplication,
  pointsOperation,
  validerContenuOperation,
} from "../../src/histoire/assessmentContracts.ts";
import { OPERATIONS } from "../../src/histoire/operations.js";
import {
  createGeminiContextCacheManager,
  type GeminiContextCacheLookup,
} from "../lib/gemini-context-cache";

export type GeminiResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: unknown }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
    totalTokenCount?: number;
    cachedContentTokenCount?: number;
    totalCachedTokens?: number;
  };
};

export type GeminiErrorCode = "GEMINI_NOT_CONFIGURED";

export type GeminiResult =
  | { ok: true; text: string }
  | { ok: false; error: string; status: number; code?: GeminiErrorCode };

export type FocusTrainingProgress = {
  stage: "queued" | "generating" | "validating" | "completed";
  completedParts: number;
  totalParts: number;
  percent: number;
};

export type FocusTrainingProgressReporter = (progress: FocusTrainingProgress) => void;

type GeminiLogger = {
  warn?: (data: unknown, message: string) => void;
  info?: (data: unknown, message: string) => void;
  error?: (data: unknown, message: string) => void;
};

type JsonOperationResult =
  | { ok: true; text: string }
  | { ok: false; error: string; status: number };

// Modèle configurable sur Netlify (GEMINI_MODEL); défaut identique au serveur Replit.
export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";
// Les jetons de « réflexion » comptent dans maxOutputTokens : avec la réflexion par
// défaut (élevée) et des limites de 7000/12000, les sorties JSON longues étaient souvent
// coupées (finishReason MAX_TOKENS), d'où des régénérations en chaîne. « medium » avec
// des limites plus larges termine les lots; « low » respecte moins bien les contrats.
// Valeurs : minimal | low | medium | high | off (n'envoie rien). Gemini 3+ seulement.
const GEMINI_THINKING_LEVEL = (process.env.GEMINI_THINKING_LEVEL || "medium").trim().toLowerCase();
function thinkingConfig(): { thinkingConfig?: { thinkingLevel: string } } {
  if (GEMINI_THINKING_LEVEL === "off" || !/^gemini-(?:[3-9]|\d{2,})/.test(GEMINI_MODEL)) return {};
  return { thinkingConfig: { thinkingLevel: GEMINI_THINKING_LEVEL } };
}
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const SECTION_A_PRIMARY_MAX_OUTPUT_TOKENS = 24000;
const SECTION_A_FALLBACK_MAX_OUTPUT_TOKENS = 16000;
const STRUCTURED_BATCH_RETRY_ATTEMPTS = 2;
const SECTION_A_SUBLOT_RETRY_ATTEMPTS = 4;
type ProviderLogStatus = number | "network_error" | "unknown";
type GeminiGenerationConfig = {
  maxOutputTokens: number;
  responseMimeType?: string;
};

const cacheManagers = new WeakMap<Function, ReturnType<typeof createGeminiContextCacheManager>>();

function gestionnaireCachePour(fetcher: typeof fetch) {
  let manager = cacheManagers.get(fetcher);
  if (!manager) {
    manager = createGeminiContextCacheManager();
    cacheManagers.set(fetcher, manager);
  }
  return manager;
}

function journaliserErreurFournisseur(
  logger: GeminiLogger,
  phase: string,
  status: ProviderLogStatus,
  message: string,
): void {
  // Ne jamais journaliser le message ou le corps brut retourné par le fournisseur :
  // ils peuvent contenir une clé, un token ou le prompt envoyé.
  logger.error?.(
    { phase, status, model: GEMINI_MODEL },
    message,
  );
}

function journaliserAppelGemini(
  logger: GeminiLogger,
  phase: string,
  startedAt: number,
  data: GeminiResponse,
): void {
  const usage = data.usageMetadata;
  logger.info?.(
    {
      phase,
      model: GEMINI_MODEL,
      durationMs: Date.now() - startedAt,
      promptTokens: usage?.promptTokenCount,
      outputTokens: usage?.candidatesTokenCount,
      thinkingTokens: usage?.thoughtsTokenCount,
      totalTokens: usage?.totalTokenCount,
      cachedPromptTokens: usage?.cachedContentTokenCount ?? usage?.totalCachedTokens,
      finishReason: data.candidates?.[0]?.finishReason,
    },
    "Appel Gemini terminé",
  );
}

function journaliserEtatCache(
  logger: GeminiLogger,
  phase: string,
  cache: GeminiContextCacheLookup,
): void {
  logger.info?.(
    {
      phase,
      cacheState: cache.state,
      cacheDurationMs: cache.durationMs,
    },
    "État du cache de contexte Gemini",
  );
}

async function appelerGeminiGenerateContent({
  apiKey,
  stableContext,
  variablePrompt,
  action,
  useGrounding,
  fetcher,
  logger,
  signal,
  phase,
  generationConfig,
}: {
  apiKey: string;
  stableContext: string;
  variablePrompt: string;
  action: "generate" | "correct";
  useGrounding: boolean;
  fetcher: typeof fetch;
  logger: GeminiLogger;
  signal?: AbortSignal;
  phase: string;
  generationConfig: GeminiGenerationConfig;
}): Promise<Response> {
  const manager = gestionnaireCachePour(fetcher);
  const cache = useGrounding
    ? {
        key: "",
        state: "grounding_incompatible" as const,
        durationMs: 0,
      }
    : await manager.lookup({
        apiKey,
        model: GEMINI_MODEL,
        action,
        stableContext,
        fetcher,
        logger,
        signal,
      });
  journaliserEtatCache(logger, phase, cache);

  // La clé passe dans un en-tête plutôt que dans l'URL (jamais journalisée).
  const url = `${GEMINI_API_URL}/${GEMINI_MODEL}:generateContent`;
  const body = (cachedContent?: string) => ({
    contents: [{
      role: "user",
      parts: [{ text: cachedContent ? variablePrompt : `${stableContext.trim()}\n\n${variablePrompt.trim()}`.trim() }],
    }],
    ...(cachedContent ? { cachedContent } : {}),
    ...(useGrounding ? { tools: [{ google_search: {} }] } : {}),
    generationConfig: { ...generationConfig, ...thinkingConfig() },
  });

  let response = await fetcher(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    signal,
    body: JSON.stringify(body(cache.reference)),
  });

  // A provider-side expiry or an unsupported cached-content reference must not
  // turn a valid exercise into an error. Retry the identical request directly.
  if (!response.ok && cache.reference && [400, 404, 422].includes(response.status)) {
    manager.invalidate(cache.key);
    logger.warn?.(
      { phase, cacheState: "invalidated", status: response.status },
      "Référence de cache Gemini refusée; reprise sans cache",
    );
    response = await fetcher(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      signal,
      body: JSON.stringify(body()),
    });
  }
  return response;
}

function maximumOutputTokens(prompt: string, useGrounding: boolean): number {
  if (!useGrounding) {
    if (/associationsDocuments|section\s+c|documents.*(?:pertinent|iconographique)|grille.*correction/i.test(prompt)) return 8000;
    return 4000;
  }
  if (/exactement\s+8 documents|entre\s+8\s+et\s+10 documents|au moins deux documents iconographiques|schéma conceptuel|branches.*documents/i.test(prompt)) return 12000;
  if (/exactement\s+5 questions/i.test(prompt)) return 7000;
  if (/exactement\s+(?:une liste de\s+)?10 questions/i.test(prompt)) return 12000;
  return 6000;
}

export function extraireTexteGemini(data: GeminiResponse): string {
  return data.candidates?.[0]?.content?.parts
    ?.map((part) => typeof part.text === "string" ? part.text : "")
    .join("")
    .trim() ?? "";
}

export function normaliserJsonComplet(text: string): string | null {
  const nettoye = text.replace(/```(?:json)?/gi, "").trim();
  const candidatsImparfaits = [
    { debut: nettoye.indexOf("{"), fin: nettoye.lastIndexOf("}") },
    { debut: nettoye.indexOf("["), fin: nettoye.lastIndexOf("]") },
  ].filter(({ debut, fin }) => debut >= 0 && fin > debut)
    .sort((a, b) => a.debut - b.debut);
  const candidats = [...trouverStructuresJson(nettoye), ...candidatsImparfaits]
    .filter((candidat, index, tous) => tous.findIndex((autre) => autre.debut === candidat.debut && autre.fin === candidat.fin) === index)
    .sort((a, b) => a.debut - b.debut || (b.fin - b.debut) - (a.fin - a.debut));

  for (const candidat of [...candidats, { debut: 0, fin: nettoye.length - 1 }]) {
    try {
      const parsed = JSON.parse(nettoye.slice(candidat.debut, candidat.fin + 1));
      if (parsed && typeof parsed === "object") return JSON.stringify(parsed);
    } catch {
      // Essaie le candidat suivant : une explication peut précéder le JSON.
    }
  }
  return null;
}

function extraireTableauQuestions(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return null;
  for (const cle of ["questions", "listeQuestions", "items", "results", "data", "result"]) {
    const candidat = (value as Record<string, unknown>)[cle];
    if (Array.isArray(candidat)) return candidat;
  }
  return null;
}

/** Champs où l'appli cherche un marqueur de relation, par opération. */
const CHAMPS_AVEC_MARQUEURS: Record<string, string[]> = {
  "causes-consequences": ["elementAttendu"],
  "liens-causalite": ["liensAttendus"],
  comparaisons: ["positionCommuneAttendue", "positionDissidenteAttendue"],
  "continuite-changement": ["changementAttendu", "continuiteAttendue"],
};

/**
 * Aligne la liste interne « marqueursRelationAttendus » sur les phrases attendues :
 * ajoute les marqueurs autorisés qu'elles emploient réellement et retire ceux qui
 * ne sont pas permis pour l'opération. Le texte présenté à l'élève n'est pas modifié.
 */
function alignerMarqueurs(question: any): void {
  const champs = CHAMPS_AVEC_MARQUEURS[question?.operationId];
  if (!champs) return;
  const operation: any = OPERATIONS.find((item: any) => item.id === question.operationId);
  const autorises: string[] = (operation?.marqueursRecommandes || [])
    .flatMap((groupe: any) => String(groupe.marqueurs || "").split(","))
    .map((marqueur: string) => marqueur.trim())
    .filter(Boolean);
  if (autorises.length === 0) return;
  const estAutorise = (marqueur: string) =>
    autorises.some((autorise) => normaliserTexteSectionA(autorise) === normaliserTexteSectionA(marqueur));
  const textes = champs.flatMap((champ) => Array.isArray(question[champ]) ? question[champ] : [question[champ]])
    .map(normaliserTexteSectionA)
    .filter(Boolean);
  const employes = autorises.filter((marqueur) =>
    textes.some((texte) => texte.includes(normaliserTexteSectionA(marqueur))));
  const actuels = textesSectionA(question.marqueursRelationAttendus).filter(estAutorise);
  const fusion = [...actuels];
  for (const marqueur of employes) {
    if (!fusion.some((actuel) => normaliserTexteSectionA(actuel) === normaliserTexteSectionA(marqueur))) {
      fusion.push(marqueur);
    }
  }
  if (fusion.length > 0) question.marqueursRelationAttendus = fusion;
}

// Listes reprises de src/histoire/assessmentContracts.ts (validées aussi par l'appli).
const CATEGORIES_FAIT = [
  "acteur", "groupe", "institution", "gouvernement", "action", "mesure", "loi", "rôle",
  "territoire", "activité économique", "mouvement de pensée", "phénomène historique",
];
const ASPECTS_SOCIETE = ["politique", "économique", "social", "culturel", "territorial"];

function normaliserQuestionSectionA(question: any): any {
  if (!question || typeof question !== "object") return question;
  const type = String(question.type || "").trim().toLowerCase();
  const format = question.format || question.formatReponse
    || (type === "qcm" || type === "court" ? type : undefined);
  const consigne = question.question || question.consigne;
  const normalisee: any = {
    ...question,
    ...(format ? { format } : {}),
    ...(consigne ? { question: consigne } : {}),
  };
  // Petites incohérences fréquentes de Gemini, corrigées plutôt que de rejeter le lot.
  if (normalisee.operationId === "faits" && normalisee.categorieFait !== undefined) {
    const valeur = normaliserTexteSectionA(normalisee.categorieFait);
    const correspondance = CATEGORIES_FAIT
      .filter((categorie) => valeur === normaliserTexteSectionA(categorie)
        || valeur.includes(normaliserTexteSectionA(categorie)))
      .sort((a, b) => b.length - a.length)[0];
    if (correspondance) normalisee.categorieFait = correspondance;
  }
  if (normalisee.operationId === "faits" && !String(normalisee.faitAttendu || "").trim()) {
    const faits = textesSectionA(normalisee.faitsAttendus);
    if (faits.length > 0) normalisee.faitAttendu = faits.join(" ; ");
  }
  alignerMarqueurs(normalisee);
  if (["faits", "causes-consequences"].includes(normalisee.operationId)
    && normalisee.aspectSociete !== undefined && normalisee.aspectSociete !== null
    && String(normalisee.aspectSociete).trim()
    && !ASPECTS_SOCIETE.map(normaliserTexteSectionA).includes(normaliserTexteSectionA(normalisee.aspectSociete))) {
    // Champ facultatif : une valeur hors liste ferait rejeter la question par l'appli.
    delete normalisee.aspectSociete;
  }
  if (normalisee.operationId === "comparaisons"
    && !normalisee.positionDissidenteAttendue && normalisee.positionDissidentAttendue) {
    normalisee.positionDissidenteAttendue = normalisee.positionDissidentAttendue;
  }
  if (normalisee.operationId === "mise-en-relation"
    && Array.isArray(normalisee.propositions) && normalisee.propositions.length === 3
    && normalisee.propositions.every((item: unknown) => typeof item === "string" && item.trim())
    && Array.isArray(normalisee.faitsRelier) && normalisee.faitsRelier.length === 3) {
    // Les deux listes doivent être identiques; « propositions » est celle affichée à l'élève.
    normalisee.faitsRelier = [...normalisee.propositions];
  }
  if (normalisee.operationId === "mise-en-relation"
    && Array.isArray(normalisee.documents) && normalisee.documents.length === 3
    && Array.isArray(normalisee.associationsAttendues)
    && normalisee.associationsAttendues.map(Number).every((valeur: number, index: number) => valeur === index)) {
    // Associations laissées dans l'ordre [0,1,2] : la réponse serait évidente.
    // On déplace les documents (A,B,C → C,A,B) et on ajuste la clé en conséquence.
    const [a, b, c] = normalisee.documents;
    normalisee.documents = [c, a, b];
    normalisee.associationsAttendues = [1, 2, 0];
  }
  return normalisee;
}

function normaliserQuestionsSectionA(questions: unknown[]): any[] {
  return questions.map(normaliserQuestionSectionA);
}

function trouverStructuresJson(texte: string): Array<{ debut: number; fin: number }> {
  const structures: Array<{ debut: number; fin: number }> = [];
  for (let debut = 0; debut < texte.length; debut += 1) {
    const ouverture = texte[debut];
    if (ouverture !== "{" && ouverture !== "[") continue;
    const pile: string[] = [];
    let dansChaine = false;
    let echappe = false;
    for (let index = debut; index < texte.length; index += 1) {
      const caractere = texte[index];
      if (dansChaine) {
        if (echappe) {
          echappe = false;
        } else if (caractere === "\\") {
          echappe = true;
        } else if (caractere === "\"") {
          dansChaine = false;
        }
        continue;
      }
      if (caractere === "\"") {
        dansChaine = true;
        continue;
      }
      if (caractere === "{" || caractere === "[") {
        pile.push(caractere);
        continue;
      }
      if (caractere !== "}" && caractere !== "]") continue;
      const attendu = caractere === "}" ? "{" : "[";
      if (pile[pile.length - 1] !== attendu) break;
      pile.pop();
      if (pile.length === 0) {
        structures.push({ debut, fin: index });
        break;
      }
    }
  }
  return structures;
}

export function estLotDeDixQuestions(prompt: string): boolean {
  return /exactement\s+(?:une liste de\s+)?10 questions/i.test(prompt);
}

const OPERATIONS_SECTION_A = [
  "faits",
  "espace-temps",
  "mise-en-relation",
  "causes-consequences",
  "liens-causalite",
  "continuite-changement",
  "comparaisons",
] as const;

function formatQuestionSectionA(question: any): string {
  return String(question?.format || question?.formatReponse || "").trim();
}

function textesSectionA(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean) : [];
}

function normaliserTexteSectionA(value: unknown): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[’']/g, "'")
    .toLowerCase()
    .trim();
}

/**
 * Applique le validateur de l'appli (src/histoire/assessmentContracts.ts) avec la même
 * préparation qu'elle (App.tsx, genererLotQuestionsA). Un lot que l'appli refuserait
 * est ainsi régénéré ici plutôt que d'afficher une erreur à l'élève.
 * Renvoie le message d'erreur de l'appli, ou null si la question est acceptée.
 */
function erreurContratApplication(question: any): string | null {
  try {
    const copie = normaliserQuestionApplication(structuredClone(question));
    if (copie.operationId === "liens-causalite") {
      copie.question = normaliserConsigneTroisPicots(copie.question, copie.etapes);
    }
    copie.points = pointsOperation(copie, copie.operationId);
    validerContenuOperation(copie);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "Contrat de l'appli non respecté.";
  }
}

function operationSectionAUtilisable(question: any): boolean {
  return operationSectionAUtilisableServeur(question) && erreurContratApplication(question) === null;
}

function operationSectionAUtilisableServeur(question: any): boolean {
  const marqueurs = textesSectionA(question.marqueursRelationAttendus);
  switch (question.operationId) {
    case "faits":
      return CATEGORIES_FAIT.map(normaliserTexteSectionA).includes(normaliserTexteSectionA(question.categorieFait))
        && Boolean(String(question.faitAttendu || "").trim() || textesSectionA(question.faitsAttendus).length === 2);
    case "espace-temps":
      return question.dimension === "temps"
        && Boolean(String(question.repereAttendu || "").trim())
        && marqueurs.length > 0
        && Array.isArray(question.ordreCorrect)
        && question.ordreCorrect.length === 4;
    case "mise-en-relation":
      const propositions = textesSectionA(
        textesSectionA(question.propositions).length > 0 ? question.propositions : question.relations,
      );
      const faitsRelier = textesSectionA(
        textesSectionA(question.faitsRelier).length > 0
          ? question.faitsRelier
          : textesSectionA(question.elementsRelier).length > 0
            ? question.elementsRelier
            : propositions,
      );
      const associationsBrutes = [
        question.associationsAttendues,
        question.associationsCorrectes,
        question.correspondances,
      ].find((items) => Array.isArray(items) && items.length > 0);
      const associations = Array.isArray(associationsBrutes)
        ? associationsBrutes.map(Number)
        : [];
      const marqueursAutorises = [
        "est associé à",
        "est lié à",
        "correspond à",
        "s’inscrit dans",
        "illustre",
        "témoigne de",
        "contribue à",
        "est caractéristique de",
      ].map(normaliserTexteSectionA);
      const marqueursNormalises = marqueurs.map(normaliserTexteSectionA);
      const constatNormalise = normaliserTexteSectionA(question.constatAttendu);
      return Array.isArray(question.documents)
        && question.documents.length === 3
        && propositions.length === 3
        && new Set(propositions.map((item) => item.toLowerCase())).size === 3
        && faitsRelier.length === 3
        && faitsRelier.every((fait, index) => fait.toLowerCase() === propositions[index].toLowerCase())
        && associations.length === 3
        && associations.every((index: number) => Number.isInteger(index) && index >= 0 && index <= 2)
        && new Set(associations).size === 3
        && !associations.every((association: number, index: number) => association === index)
        && Boolean(String(question.constatAttendu || "").trim())
        // Aligné sur l'appli (assessmentContracts.ts) : le constat ne doit pas être
        // causal; il n'a pas à contenir lui-même un marqueur de relation.
        && !/\b(parce que|donc|entraine|provoque|cause|consequence|par consequent)\b/.test(constatNormalise)
        && marqueursNormalises.length > 0
        && marqueursNormalises.every((marqueur) => marqueursAutorises.includes(marqueur));
    case "causes-consequences":
      return ["cause", "consequence", "conséquence"].includes(String(question.relationDemandee || "").toLowerCase())
        && Boolean(String(question.evenementCible || "").trim() && String(question.elementAttendu || "").trim())
        && marqueurs.length > 0;
    case "liens-causalite":
      return textesSectionA(question.etapes).length === 3
        && new Set(textesSectionA(question.etapes).map((item) => item.toLowerCase())).size === 3
        && textesSectionA(question.liensAttendus).length === 2
        && marqueurs.length > 0;
    case "comparaisons": {
      // Aligné sur le contrat actuel de l'appli (assessmentContracts.ts) :
      // trois acteurs, un enjeu commun, un acteur dissident et deux positions.
      // L'ancien contrat (elementsComparer, similitudeAttendue…) n'est plus demandé
      // dans la consigne, ce qui faisait échouer chaque sous-lot.
      const acteurs = textesSectionA(question.acteursComparer);
      const acteursNormalises = acteurs.map(normaliserTexteSectionA);
      return acteurs.length === 3
        && new Set(acteursNormalises).size === 3
        && Boolean(String(question.enjeuCommun || "").trim())
        && acteursNormalises.includes(normaliserTexteSectionA(question.acteurDissident))
        && Boolean(String(question.positionCommuneAttendue || "").trim())
        && Boolean(String(question.positionDissidenteAttendue || "").trim())
        && marqueurs.length > 0;
    }
    case "continuite-changement":
      return Boolean(String(question.realiteComparee || "").trim())
        && textesSectionA(question.moments).length === 2
        && Boolean(String(question.changementAttendu || "").trim())
        && Boolean(String(question.continuiteAttendue || "").trim())
        && marqueurs.length > 0;
    default:
      return false;
  }
}

export function lotSectionAUtilisable(questions: unknown, prompt: string): boolean {
  if (!Array.isArray(questions) || questions.length !== 10) return false;
  if (questions.some((question) => !question || typeof question !== "object"
    || !String((question as any).question || "").trim()
    || !formatQuestionSectionA(question))) {
    return false;
  }
  const qcmValide = (question: any) => Array.isArray(question.choix)
    && question.choix.length === 4
    && question.choix.every((choix: unknown) => String(choix || "").trim())
    && new Set(question.choix.map((choix: unknown) => String(choix || "").trim().toLowerCase())).size === 4
    && Number.isInteger(question.indexReponseCorrecte)
    && question.indexReponseCorrecte >= 0
    && question.indexReponseCorrecte <= 3;
  if (/MODULE\s+RÉPONSES COURTES/i.test(prompt)) {
    const qcm = questions.filter((question) => formatQuestionSectionA(question) === "qcm");
    const courtes = questions.filter((question) => formatQuestionSectionA(question) === "court");
    return qcm.length === 5
      && courtes.length === 5
      && qcm.every(qcmValide)
      && courtes.some((question) => Array.isArray((question as any).elementsChronologiques)
        && (question as any).elementsChronologiques.length === 4
        && (question as any).elementsChronologiques.every((element: any) =>
          element && typeof element === "object"
          && String(element.label || "").trim()
          && String(element.annee ?? element.ordre ?? "").trim()));
  }

  const operations = new Set(questions.map((question) => String((question as any).operationId || "")));
  const consolidations = questions.filter((question) =>
    formatQuestionSectionA(question) === "qcm" && !(question as any).operationId);
  const formatsAttendus: Record<string, string> = {
    faits: "court",
    "espace-temps": "classement",
    "mise-en-relation": "association-paires",
    "causes-consequences": "court",
    "liens-causalite": "causalite-3",
    "continuite-changement": "changement-continuite",
    comparaisons: "comparaison",
  };
  return OPERATIONS_SECTION_A.every((operation) => operations.has(operation))
    && consolidations.length === 3
    && consolidations.every(qcmValide)
    && questions.filter((question) => (question as any).operationId).every(operationSectionAUtilisable)
    && Object.entries(formatsAttendus).every(([operationId, format]) =>
      questions.some((question) =>
        (question as any).operationId === operationId && formatQuestionSectionA(question) === format));
}

function resumeStructureLotSectionA(questions: unknown): Record<string, unknown> {
  if (!Array.isArray(questions)) return { count: 0, type: typeof questions };
  return {
    count: questions.length,
    operationIds: questions.map((question: any) => String(question?.operationId || "")).filter(Boolean),
    formats: questions.map((question: any) => formatQuestionSectionA(question)).filter(Boolean),
    qcmCount: questions.filter((question: any) => formatQuestionSectionA(question) === "qcm").length,
    // Diagnostic : opérations présentes mais refusées par le contrat structurel.
    operationsRefusees: questions
      .filter((question: any) => question?.operationId && !operationSectionAUtilisable(question))
      .map((question: any) => {
        const erreur = erreurContratApplication(question);
        return erreur ? `${question.operationId}: ${erreur}` : String(question.operationId);
      }),
    qcmRefuses: questions.filter((question: any) => formatQuestionSectionA(question) === "qcm" && !qcmSectionAUtilisable(question)).length,
    keys: questions.map((question: any) =>
      question && typeof question === "object" ? Object.keys(question).sort() : []),
  };
}

function normaliserIdentifiantsSousLotSectionA(questions: any[], prompt: string): any[] {
  if (/MODULE\s+RÉPONSES COURTES/i.test(prompt)) return questions;
  const premiereMoitie = /PREMIÈRE MOITIÉ DU LOT/i.test(prompt);
  const operationsAttendues = premiereMoitie
    ? ["faits", "espace-temps", "mise-en-relation", "causes-consequences", "liens-causalite"]
    : ["continuite-changement", "comparaisons"];
  const formatsAttendus = premiereMoitie
    ? ["court", "classement", "association-paires", "court", "causalite-3"]
    : ["changement-continuite", "comparaison"];

  return questions.map((question, index) => {
    if (!question || typeof question !== "object" || index >= operationsAttendues.length) return question;
    const operationId = String(question.operationId || "").trim();
    if (operationId) return question;
    const operationAlias = String(question.operation || "").trim();
    if (operationAlias && operationsAttendues.includes(operationAlias)) {
      return { ...question, operationId: operationAlias };
    }
    return formatQuestionSectionA(question) === formatsAttendus[index]
      ? { ...question, operationId: operationsAttendues[index] }
      : question;
  });
}

/** Problèmes précis du sous-lot précédent, pour guider la nouvelle génération. */
function problemesSousLot(questions: unknown): string {
  if (!Array.isArray(questions)) return "";
  const problemes = questions
    .filter((question: any) => question?.operationId && !operationSectionAUtilisable(question))
    .map((question: any) => {
      const erreur = erreurContratApplication(question) || "champs internes incomplets ou incohérents pour cette opération";
      const operation: any = OPERATIONS.find((item: any) => item.id === question.operationId);
      const marqueurs = (operation?.marqueursRecommandes || [])
        .map((groupe: any) => `${groupe.typeLien} : ${groupe.marqueurs}`)
        .join(" ; ");
      const precision = question.operationId === "faits"
        ? ` "categorieFait" doit valoir exactement l'une de ces valeurs : ${CATEGORIES_FAIT.join(", ")}.`
        : CHAMPS_AVEC_MARQUEURS[question.operationId] && marqueurs
          ? ` Chaque phrase de ${CHAMPS_AVEC_MARQUEURS[question.operationId].map((champ) => `"${champ}"`).join(" et ")} doit contenir mot pour mot un de ces marqueurs, aussi inscrit dans "marqueursRelationAttendus" : ${marqueurs}.`
          : "";
      return `- ${question.operationId} : ${erreur}${precision}`;
    });
  return problemes.length ? `\nPROBLÈMES DÉTECTÉS DANS LA VERSION PRÉCÉDENTE :\n${problemes.join("\n")}` : "";
}

function qcmSectionAUtilisable(question: any): boolean {
  return Array.isArray(question?.choix)
    && question.choix.length === 4
    && question.choix.every((choix: unknown) => String(choix || "").trim())
    && new Set(question.choix.map((choix: unknown) => String(choix || "").trim().toLowerCase())).size === 4
    && Number.isInteger(question.indexReponseCorrecte)
    && question.indexReponseCorrecte >= 0
    && question.indexReponseCorrecte <= 3;
}

function sousLotSectionAUtilisable(questions: any[], prompt: string): boolean {
  if (questions.length !== 5) return false;
  if (/MODULE\s+RÉPONSES COURTES/i.test(prompt)) {
    const premiereMoitie = /PREMIÈRE MOITIÉ DU LOT/i.test(prompt);
    const qcmAttendus = premiereMoitie ? 3 : 2;
    const courtes = questions.filter((question) => formatQuestionSectionA(question) === "court");
    const qcm = questions.filter((question) => formatQuestionSectionA(question) === "qcm");
    return qcm.length === qcmAttendus
      && courtes.length === 5 - qcmAttendus
      && qcm.every(qcmSectionAUtilisable)
      && courtes.every((question) => String(question?.question || "").trim());
  }

  const premiereMoitie = /PREMIÈRE MOITIÉ DU LOT/i.test(prompt);
  const operationsAttendues = premiereMoitie
    ? ["faits", "espace-temps", "mise-en-relation", "causes-consequences", "liens-causalite"]
    : ["continuite-changement", "comparaisons"];
  const formatsAttendus = premiereMoitie
    ? ["court", "classement", "association-paires", "court", "causalite-3"]
    : ["changement-continuite", "comparaison"];
  if (premiereMoitie) {
    return questions.every((question, index) =>
      question?.operationId === operationsAttendues[index]
      && formatQuestionSectionA(question) === formatsAttendus[index]
      && operationSectionAUtilisable(question));
  }
  return questions.slice(0, 2).every((question, index) =>
    question?.operationId === operationsAttendues[index]
    && formatQuestionSectionA(question) === formatsAttendus[index]
    && operationSectionAUtilisable(question))
    && questions.slice(2).every((question) =>
      formatQuestionSectionA(question) === "qcm" && qcmSectionAUtilisable(question));
}

function messageErreurGemini(status: number): string {
  if (status === 401 || status === 403) return "La configuration de l'API Gemini est invalide. Vérifie la clé dans les Secrets Replit.";
  if (status === 404) return "Le modèle Gemini configuré n'est pas disponible pour cette clé API.";
  if (status === 429) return "Le quota Gemini est temporairement dépassé. Réessaie dans quelques instants.";
  return "Le service Gemini est temporairement indisponible. Réessaie dans quelques instants.";
}

function statutPublicGemini(status: number): number {
  if (status === 429) return 429;
  if (status === 401 || status === 403) return 503;
  return 502;
}

async function reparerJsonGemini(
  apiKey: string,
  stableContext: string,
  malformedText: string,
  action: "generate" | "correct",
  fetcher: typeof fetch,
  logger: GeminiLogger,
  signal?: AbortSignal,
): Promise<JsonOperationResult> {
  try {
    const upstream = await appelerGeminiGenerateContent({
      apiKey,
      stableContext,
      variablePrompt: `Répare uniquement la syntaxe JSON du contenu suivant.
Ne résume pas, ne commente pas, n'ajoute aucune information et ne retire aucun champ.
Retourne seulement le JSON complet et valide.

${malformedText}`,
      action,
      useGrounding: false,
      fetcher,
      logger,
      signal,
      phase: "json_repair",
      generationConfig: { maxOutputTokens: 12000, responseMimeType: "application/json" },
    });
    if (!upstream.ok) {
      journaliserErreurFournisseur(logger, "json_repair", upstream.status, "Gemini JSON repair error");
      return { ok: false, status: statutPublicGemini(upstream.status), error: messageErreurGemini(upstream.status) };
    }
    const text = normaliserJsonComplet(extraireTexteGemini(await upstream.json() as GeminiResponse));
    return text
      ? { ok: true, text }
      : { ok: false, status: 502, error: "Gemini n'a pas retourné un JSON réparable. Réessaie dans quelques instants." };
  } catch {
    journaliserErreurFournisseur(logger, "json_repair", "network_error", "Gemini JSON repair network error");
    return { ok: false, status: 502, error: "La réparation de la réponse Gemini a échoué. Réessaie dans quelques instants." };
  }
}

async function garantirLotDeQuestions(
  apiKey: string,
  stableContext: string,
  prompt: string,
  jsonText: string,
  action: "generate" | "correct",
  fetcher: typeof fetch,
  logger: GeminiLogger,
  nombreAttendu: number,
  libelleLot: string,
  signal?: AbortSignal,
): Promise<JsonOperationResult> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    const repair = await reparerJsonGemini(apiKey, stableContext, jsonText, action, fetcher, logger, signal);
    if (!repair.ok) return repair;
    try {
      parsed = JSON.parse(repair.text);
    } catch {
      return { ok: false, status: 502, error: "Gemini n'a pas produit un lot JSON exploitable. Réessaie dans quelques instants." };
    }
  }
  if (Array.isArray(parsed) && parsed.length === nombreAttendu) return { ok: true, text: jsonText };

  const questionsInitiales = extraireTableauQuestions(parsed);
  if (questionsInitiales && questionsInitiales.length === nombreAttendu) {
    return { ok: true, text: JSON.stringify(normaliserQuestionsSectionA(questionsInitiales)) };
  }
  const nombreRecu = questionsInitiales?.length ?? 0;
  logger.warn?.({ model: GEMINI_MODEL, nombreRecu, nombreAttendu }, `${libelleLot} incomplet; régénération structurée`);

  let dernierEchec: JsonOperationResult = {
    ok: false,
    status: 502,
    error: `Gemini n'a pas produit exactement ${nombreAttendu} questions. Réessaie dans quelques instants.`,
  };
  let sortieAExaminer = jsonText;

  for (let tentative = 1; tentative <= STRUCTURED_BATCH_RETRY_ATTEMPTS; tentative += 1) {
    let upstream: Response;
    try {
      upstream = await appelerGeminiGenerateContent({
        apiKey,
        stableContext,
        variablePrompt: `La sortie précédente n'est pas acceptable : elle contient ${nombreRecu} question(s), mais le contrat exige EXACTEMENT ${nombreAttendu} questions pour ce lot.
Régénère ce lot complet en respectant toutes les consignes ci-dessous.
Retourne uniquement un tableau JSON valide de ${nombreAttendu} objets distincts.

CONSIGNES DU LOT :
${prompt}

SORTIE INCOMPLÈTE À REMPLACER :
${sortieAExaminer}`,
        action,
        useGrounding: false,
        fetcher,
        logger,
        signal,
        phase: "batch_regeneration",
        generationConfig: { maxOutputTokens: nombreAttendu === 5 ? 16000 : 24000, responseMimeType: "application/json" },
      });
    } catch {
      journaliserErreurFournisseur(logger, "batch_regeneration", "network_error", "Erreur réseau pendant la régénération du lot Section A");
      dernierEchec = { ok: false, status: 502, error: "La régénération du lot Gemini a échoué. Réessaie dans quelques instants." };
      continue;
    }

    if (!upstream.ok) {
      journaliserErreurFournisseur(logger, "batch_regeneration", upstream.status, "Échec de la régénération du lot Section A");
      dernierEchec = { ok: false, status: statutPublicGemini(upstream.status), error: messageErreurGemini(upstream.status) };
      if ([401, 403, 404, 429].includes(upstream.status)) return dernierEchec;
      continue;
    }

    let data: GeminiResponse;
    try {
      data = await upstream.json() as GeminiResponse;
    } catch {
      dernierEchec = { ok: false, status: 502, error: "Gemini n'a pas retourné une réponse exploitable. Réessaie dans quelques instants." };
      continue;
    }
    journaliserAppelGemini(logger, "batch_regeneration", Date.now(), data);

    const regeneratedText = extraireTexteGemini(data);
    let regenerated = normaliserJsonComplet(regeneratedText);
    if (!regenerated && regeneratedText) {
      logger.warn?.({ model: GEMINI_MODEL, nombreAttendu, tentative }, `${libelleLot} régénéré mal formé; réparation JSON`);
      const repair = await reparerJsonGemini(apiKey, stableContext, regeneratedText, action, fetcher, logger, signal);
      if (!repair.ok) {
        dernierEchec = repair;
        if (repair.status === 429) return repair;
        continue;
      }
      regenerated = repair.text;
    }
    if (!regenerated) {
      dernierEchec = { ok: false, status: 502, error: "Gemini n'a pas produit un lot régénéré exploitable. Réessaie dans quelques instants." };
      continue;
    }
    sortieAExaminer = regenerated;
    try {
      const regeneratedParsed = JSON.parse(regenerated);
      const regeneratedQuestions = extraireTableauQuestions(regeneratedParsed);
      if (regeneratedQuestions && regeneratedQuestions.length === nombreAttendu) {
        return { ok: true, text: JSON.stringify(normaliserQuestionsSectionA(regeneratedQuestions)) };
      }
      dernierEchec = { ok: false, status: 502, error: `Gemini n'a pas produit exactement ${nombreAttendu} questions. Réessaie dans quelques instants.` };
    } catch {
      dernierEchec = { ok: false, status: 502, error: "Gemini n'a pas produit un lot JSON valide. Réessaie dans quelques instants." };
    }
  }
  return dernierEchec;
}

async function garantirLotDeDixQuestions(
  apiKey: string,
  stableContext: string,
  prompt: string,
  jsonText: string,
  action: "generate" | "correct",
  fetcher: typeof fetch,
  logger: GeminiLogger,
  signal?: AbortSignal,
): Promise<JsonOperationResult> {
  return garantirLotDeQuestions(apiKey, stableContext, prompt, jsonText, action, fetcher, logger, 10, "Lot Section A", signal);
}

function construireLotsSectionA(prompt: string): [string, string] {
  const moduleReponses = /MODULE\s+RÉPONSES COURTES/i.test(prompt);
  if (moduleReponses) {
    return [
      `${prompt}

DIRECTIVE PRIORITAIRE — PREMIÈRE MOITIÉ DU LOT :
Pour éviter une sortie trop volumineuse, génère exactement 5 questions dans ce sous-lot, pas 10 : exactement 3 QCM au format "qcm" et exactement 2 réponses courtes au format "court". Ne génère pas encore le classement chronologique obligatoire; il sera produit dans la deuxième moitié. Les cinq questions doivent être distinctes et conserver tous les champs, documents textuels et exigences PFEQ demandés.`,
      `${prompt}

DIRECTIVE PRIORITAIRE — DEUXIÈME MOITIÉ DU LOT :
Pour éviter une sortie trop volumineuse, génère exactement 5 questions dans ce sous-lot, pas 10 : exactement 2 QCM au format "qcm" et exactement 3 réponses courtes au format "court". Au moins une de ces réponses courtes doit contenir exactement quatre "elementsChronologiques". Les cinq questions doivent être distinctes de la première moitié et conserver tous les champs, documents textuels et exigences PFEQ demandés.`,
    ];
  }
  return [
    `${prompt}

DIRECTIVE PRIORITAIRE — PREMIÈRE MOITIÉ DU LOT :
Génère exactement 5 questions dans ce sous-lot, pas 10. Inclus obligatoirement une question pour chacune de ces opérations, avec le format exact demandé : faits, espace-temps, mise-en-relation, causes-consequences et liens-causalite. N'ajoute aucune question de consolidation dans ce sous-lot.`,
    `${prompt}

DIRECTIVE PRIORITAIRE — DEUXIÈME MOITIÉ DU LOT :
Génère exactement 5 questions dans ce sous-lot, pas 10. Inclus obligatoirement une question pour chacune de ces opérations, avec le format exact demandé : continuite-changement et comparaisons, puis exactement trois QCM de consolidation sans operationId. N'ajoute aucune autre opération dans ce sous-lot.`,
  ];
}

async function genererSousLotSectionA(
  apiKey: string,
  stableContext: string,
  prompt: string,
  action: "generate" | "correct",
  fetcher: typeof fetch,
  logger: GeminiLogger,
  signal?: AbortSignal,
  onCompleted?: () => void,
  tentative = 1,
): Promise<
  | { ok: true; questions: any[] }
  | { ok: false; error: string; status: number }
> {
  const startedAt = Date.now();
  const upstream = await appelerGeminiGenerateContent({
    apiKey,
    stableContext,
    variablePrompt: prompt,
    action,
    useGrounding: false,
    fetcher,
    logger,
    signal,
    phase: "section_a_fallback_batch",
    generationConfig: {
      maxOutputTokens: SECTION_A_FALLBACK_MAX_OUTPUT_TOKENS,
      responseMimeType: "application/json",
    },
  });
  if (!upstream.ok) {
    journaliserErreurFournisseur(logger, "section_a_batch", upstream.status, "Échec de la génération d'un sous-lot Section A");
    return {
      ok: false,
      status: statutPublicGemini(upstream.status),
      error: messageErreurGemini(upstream.status),
    };
  }

  const data = await upstream.json() as GeminiResponse;
  journaliserAppelGemini(logger, "section_a_fallback_batch", startedAt, data);
  const text = extraireTexteGemini(data);
  if (!text) {
    return { ok: false, status: 502, error: "Gemini n'a pas retourné de contenu exploitable. Réessaie dans quelques instants." };
  }
  onCompleted?.();

  let jsonNormalise = normaliserJsonComplet(text);
  if (!jsonNormalise) {
    logger.warn?.({ model: GEMINI_MODEL }, "Sous-lot Section A mal formé; réparation JSON");
    const repair = await reparerJsonGemini(apiKey, stableContext, text, action, fetcher, logger, signal);
    if (!repair.ok) return repair;
    jsonNormalise = repair.text;
  }
  if (!jsonNormalise) {
    return { ok: false, status: 502, error: "Gemini n'a pas retourné un sous-lot JSON exploitable. Réessaie dans quelques instants." };
  }

  const jsonComplet = await garantirLotDeQuestions(
    apiKey,
    stableContext,
    prompt,
    jsonNormalise,
    action,
    fetcher,
    logger,
    5,
    "Sous-lot Section A",
    signal,
  );
  if (!jsonComplet.ok) return jsonComplet;

  try {
    const parsed = JSON.parse(jsonComplet.text);
    const questions = Array.isArray(parsed)
      ? normaliserIdentifiantsSousLotSectionA(normaliserQuestionsSectionA(parsed), prompt)
      : parsed;
    if (Array.isArray(questions) && questions.length === 5 && sousLotSectionAUtilisable(questions, prompt)) {
      return { ok: true, questions };
    }
    if (tentative < SECTION_A_SUBLOT_RETRY_ATTEMPTS) {
      logger.warn?.(
        resumeStructureLotSectionA(questions),
        "Sous-lot Section A non conforme; nouvelle génération ciblée",
      );
      return genererSousLotSectionA(
        apiKey,
        stableContext,
        `${prompt}\n\nCORRECTION OBLIGATOIRE : ce sous-lot doit respecter exactement sa composition annoncée. Conserve les critères internes complets des opérations, mets l'identifiant operationId exact sur chaque opération et ajoute les QCM de consolidation demandés, avec quatre choix distincts et un indexReponseCorrecte valide.${problemesSousLot(questions)}`,
        action,
        fetcher,
        logger,
        signal,
        onCompleted,
        tentative + 1,
      );
    }
    return { ok: false, status: 502, error: "Gemini n'a pas produit un sous-lot Section A structurellement exploitable. Réessaie dans quelques instants." };
  } catch {
    return { ok: false, status: 502, error: "Gemini n'a pas produit un sous-lot JSON valide. Réessaie dans quelques instants." };
  }
}

async function executerLotSectionAHybride(
  apiKey: string,
  stableContext: string,
  prompt: string,
  action: "generate" | "correct",
  fetcher: typeof fetch,
  logger: GeminiLogger,
  signal?: AbortSignal,
  onProgress?: FocusTrainingProgressReporter,
): Promise<GeminiResult> {
  onProgress?.({ stage: "generating", completedParts: 0, totalParts: 2, percent: 10 });
  const startedAt = Date.now();
  let upstream: Response;
  try {
    upstream = await appelerGeminiGenerateContent({
      apiKey,
      stableContext,
      variablePrompt: prompt,
      action,
      useGrounding: false,
      fetcher,
      logger,
      signal,
      phase: "section_a_primary",
      generationConfig: {
        maxOutputTokens: SECTION_A_PRIMARY_MAX_OUTPUT_TOKENS,
        responseMimeType: "application/json",
      },
    });
  } catch {
    journaliserErreurFournisseur(logger, "section_a_primary", "network_error", "Erreur réseau pendant la génération Section A");
    return { ok: false, status: 502, error: "La connexion au service Gemini a échoué. Réessaie dans quelques instants." };
  }
  if (!upstream.ok) {
    journaliserErreurFournisseur(logger, "section_a_primary", upstream.status, "Échec de la génération principale Section A");
    return { ok: false, status: statutPublicGemini(upstream.status), error: messageErreurGemini(upstream.status) };
  }

  const data = await upstream.json() as GeminiResponse;
  journaliserAppelGemini(logger, "section_a_primary", startedAt, data);
  const text = extraireTexteGemini(data);
  const jsonNormalise = text ? normaliserJsonComplet(text) : null;
  if (jsonNormalise) {
    try {
      const parsed = JSON.parse(jsonNormalise);
      const questionsBrutes = extraireTableauQuestions(parsed) ?? parsed;
      const questions = Array.isArray(questionsBrutes)
        ? normaliserQuestionsSectionA(questionsBrutes)
        : questionsBrutes;
      if (lotSectionAUtilisable(questions, prompt)) {
        onProgress?.({ stage: "generating", completedParts: 1, totalParts: 2, percent: 55 });
        onProgress?.({ stage: "validating", completedParts: 2, totalParts: 2, percent: 85 });
        return { ok: true, text: JSON.stringify(questions) };
      }
    } catch {
      // Le normaliseur a déjà tenté les structures JSON locales sûres.
    }
  }

  logger.warn?.(
    {
      model: GEMINI_MODEL,
      finishReason: data.candidates?.[0]?.finishReason,
      fallback: "two_parallel_batches",
    },
    "Lot Section A principal incomplet; recours aux deux sous-lots",
  );
  return executerLotSectionAEnDeuxLots(apiKey, stableContext, prompt, action, fetcher, logger, signal, onProgress);
}

async function executerLotSectionAEnDeuxLots(
  apiKey: string,
  stableContext: string,
  prompt: string,
  action: "generate" | "correct",
  fetcher: typeof fetch,
  logger: GeminiLogger,
  signal?: AbortSignal,
  onProgress?: FocusTrainingProgressReporter,
): Promise<GeminiResult> {
  try {
    onProgress?.({ stage: "generating", completedParts: 0, totalParts: 2, percent: 10 });
    let completedParts = 0;
    const [premierLot, deuxiemeLot] = await Promise.all(
      construireLotsSectionA(prompt).map((lotPrompt, index) =>
        genererSousLotSectionA(
          apiKey,
          stableContext,
          lotPrompt,
          action,
          fetcher,
          logger,
          signal,
          () => {
            completedParts += 1;
            onProgress?.({
              stage: "generating",
              completedParts,
              totalParts: 2,
              percent: 10 + Math.round((completedParts / 2) * 35),
            });
          },
        ),
      ),
    );
    const lots = [premierLot, deuxiemeLot];
    const erreur = lots.find((lot) => !lot.ok && lot.status === 429) ?? lots.find((lot) => !lot.ok);
    if (erreur && !erreur.ok) {
      return erreur;
    }
    if (!premierLot.ok || !deuxiemeLot.ok) {
      return { ok: false, status: 502, error: "Gemini n'a pas pu terminer les deux parties de la série de questions. Réessaie dans quelques instants." };
    }
    onProgress?.({ stage: "validating", completedParts: 2, totalParts: 2, percent: 85 });
    const questions = [...premierLot.questions, ...deuxiemeLot.questions];
    if (lotSectionAUtilisable(questions, prompt)) {
      return { ok: true, text: JSON.stringify(questions) };
    }
    logger.warn?.(
      resumeStructureLotSectionA(questions),
      "Lot Section A combiné rejeté par le contrat structurel",
    );
    return { ok: false, status: 502, error: "Gemini n'a pas produit un lot Section A structurellement exploitable. Réessaie dans quelques instants." };
  } catch {
    journaliserErreurFournisseur(logger, "section_a_generation", "unknown", "Erreur de génération des sous-lots Section A");
    return { ok: false, status: 502, error: "La génération des questions a échoué. Réessaie dans quelques instants." };
  }
}

export async function executerGeminiAvecReparation({
  apiKey,
  prompt,
  context,
  useGrounding = true,
  action,
  fetcher = fetch,
  logger = {},
  signal,
  onProgress,
}: {
  apiKey: string;
  prompt: string;
  context: string;
  action?: "generate" | "correct";
  useGrounding?: boolean;
  fetcher?: typeof fetch;
  logger?: GeminiLogger;
  signal?: AbortSignal;
  onProgress?: FocusTrainingProgressReporter;
}): Promise<GeminiResult> {
  const effectiveAction = action ?? (useGrounding ? "generate" : "correct");
  try {
    if (useGrounding && estLotDeDixQuestions(prompt)) {
      const result = await executerLotSectionAHybride(apiKey, context, prompt, effectiveAction, fetcher, logger, signal, onProgress);
      if (result.ok) onProgress?.({ stage: "completed", completedParts: 2, totalParts: 2, percent: 100 });
      return result;
    }

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const startedAt = Date.now();
      const upstream = await appelerGeminiGenerateContent({
        apiKey,
        stableContext: context,
        variablePrompt: prompt,
        action: effectiveAction,
        useGrounding,
        fetcher,
        logger,
        signal,
        phase: "generation",
        generationConfig: {
          maxOutputTokens: maximumOutputTokens(prompt, useGrounding),
          ...(useGrounding ? {} : { responseMimeType: "application/json" }),
        },
      });
      if (!upstream.ok) {
        journaliserErreurFournisseur(logger, "generation", upstream.status, "Gemini API error");
        return { ok: false, status: statutPublicGemini(upstream.status), error: messageErreurGemini(upstream.status) };
      }

      const data = await upstream.json() as GeminiResponse;
      journaliserAppelGemini(logger, "generation", startedAt, data);
      const text = extraireTexteGemini(data);
      if (text) {
        const jsonNormalise = normaliserJsonComplet(text);
        if (jsonNormalise) {
           const jsonFinal = estLotDeDixQuestions(prompt)
               ? await garantirLotDeDixQuestions(apiKey, context, prompt, jsonNormalise, effectiveAction, fetcher, logger, signal)
             : { ok: true as const, text: jsonNormalise };
           if (jsonFinal.ok) return jsonFinal;
           if (jsonFinal.status === 429) return jsonFinal;
        }

        logger.warn?.({ model: GEMINI_MODEL, attempt }, "Gemini returned malformed JSON; attempting repair");
        const jsonRepare = await reparerJsonGemini(apiKey, context, text, effectiveAction, fetcher, logger, signal);
        if (jsonRepare.ok) {
          const jsonFinal = estLotDeDixQuestions(prompt)
            ? await garantirLotDeDixQuestions(apiKey, context, prompt, jsonRepare.text, effectiveAction, fetcher, logger, signal)
            : jsonRepare;
          if (jsonFinal.ok) {
            logger.info?.({ model: GEMINI_MODEL, attempt }, "Gemini JSON repaired successfully");
            return jsonFinal;
          }
          if (jsonFinal.status === 429) return jsonFinal;
        } else if (jsonRepare.status === 429) {
          return jsonRepare;
        }
      }

      logger.error?.({ model: GEMINI_MODEL, attempt, finishReason: data.candidates?.[0]?.finishReason, blockReason: data.promptFeedback?.blockReason }, "Gemini response without usable text");
      if (data.promptFeedback?.blockReason || attempt === 2) {
        return { ok: false, status: 502, error: "Gemini n'a pas retourné de contenu exploitable. Réessaie dans quelques instants." };
      }
    }
  } catch {
    journaliserErreurFournisseur(logger, "generation", "network_error", "Erreur réseau Gemini");
    return { ok: false, status: 502, error: "La connexion au service Gemini a échoué. Réessaie dans quelques instants." };
  }
  return { ok: false, status: 502, error: "Gemini n'a pas retourné de contenu exploitable. Réessaie dans quelques instants." };
}