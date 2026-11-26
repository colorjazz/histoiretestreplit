import { connaissancesPFEQAutorisees, conceptsPFEQAutorises, trouverRealitePFEQ } from "./pfeqReferentiel.ts";
import { OPERATIONS } from "./operations.js";
import { estDocumentIconographique } from "./historicalVisuals.ts";

export type SchemaBranchContract = {
  id?: number | string;
  niveau?: number | string;
  parentId?: number | string | null;
};

export const SECTION_A_OPERATIONS_REQUISES = [
  "faits",
  "espace-temps",
  "mise-en-relation",
  "causes-consequences",
  "liens-causalite",
  "continuite-changement",
  "comparaisons",
];

const CATEGORIES_FAIT = [
  "acteur", "groupe", "institution", "gouvernement", "action", "mesure", "loi", "rôle",
  "territoire", "activité économique", "mouvement de pensée", "phénomène historique",
];
const ASPECTS_SOCIETE = ["politique", "économique", "social", "culturel", "territorial"];
const VERBES_CONSIGNE_PROCEDURALE = /(?:^|[.!?;:]\s*|,\s*)(?:associe|associez|compare|comparez|décris|décrivez|détermine|déterminez|écris|écrivez|établis|établissez|explique|expliquez|identifie|identifiez|indique|indiquez|inscris|inscrivez|justifie|justifiez|localise|localisez|nomme|nommez|observe|observez|place|placez|présentez|rédige|rédigez|relève|relevez|situe|situez|choisis|choisissez|précise|précisez)\b/i;

function normaliserExpression(value: unknown): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[’']/g, "'")
    .toLowerCase()
    .trim();
}

function marqueursParType(operationId: string): Array<{ typeLien: string; marqueurs: string[] }> {
  const operation = OPERATIONS.find((item) => item.id === operationId);
  return (operation?.marqueursRecommandes || []).map((groupe) => ({
    typeLien: groupe.typeLien,
    marqueurs: groupe.marqueurs.split(",").map((marqueur) => marqueur.trim()).filter(Boolean),
  }));
}

function tableauTextes(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean) : [];
}

function texteContientMarqueur(value: unknown, marqueurs: string[]): boolean {
  const texte = normaliserExpression(value);
  return marqueurs.some((marqueur) => texte.includes(normaliserExpression(marqueur)));
}

/**
 * La zone « Tâche à réaliser » présente une question historique appuyée sur
 * le dossier, et non une marche à suivre. Les listes de trois picots sont
 * retirées du contrôle : elles donnent les éléments du problème, pas une
 * procédure à exécuter.
 */
export function consigneEstQuestionDocumentaire(value: unknown): boolean {
  const texte = String(value || "").trim();
  if (!texte) return false;
  const lignesPrincipales = texte
    .split(/\r?\n/)
    .map((ligne) => ligne.trim())
    .filter((ligne) => ligne && !/^(?:[-–—•·*]|\d+[.)])\s+/.test(ligne))
    .join(" ");
  if (!lignesPrincipales.includes("?")) return false;
  if (!/\b(?:document|documents|carte|cartes|source|sources|extrait|extraits)\b/i.test(lignesPrincipales)) return false;
  return !VERBES_CONSIGNE_PROCEDURALE.test(lignesPrincipales);
}

const CHAMPS_AVEC_MARQUEURS: Record<string, string[]> = {
  "causes-consequences": ["elementAttendu"],
  "liens-causalite": ["liensAttendus"],
  comparaisons: ["positionCommuneAttendue", "positionDissidenteAttendue"],
  "continuite-changement": ["changementAttendu", "continuiteAttendue"],
};

const DEBUTS_INTERROGATIFS = /^(?:quel|quelle|quels|quelles|comment|pourquoi|en|dans|de|du|des|qu[’']|que|qui|lequel|laquelle|lesquels|lesquelles|combien|à|où|par|pour|sur)\b/i;

/**
 * Corrige les écarts de forme fréquents de Gemini avant la validation d'un dossier,
 * sans changer le sens de la tâche :
 * - une question valide qui ne nomme pas les documents reçoit « D’après les documents, »;
 * - « marqueursRelationAttendus » est ramené à une liste de marqueurs autorisés,
 *   complétée par ceux qu'emploient réellement les réponses attendues.
 */
export function harmoniserDossierOperation(question: any): void {
  if (!question || typeof question !== "object") return;

  const consigne = String(question.consigne || "");
  if (consigne.trim() && !consigneEstQuestionDocumentaire(consigne)) {
    const lignes = consigne.split(/\r?\n/);
    const index = lignes.findIndex((ligne) => ligne.trim() && !/^(?:[-–—•·*]|\d+[.)])\s+/.test(ligne.trim()));
    if (index >= 0) {
      const ligne = lignes[index].trim();
      const debut = DEBUTS_INTERROGATIFS.test(ligne) ? ligne.charAt(0).toLowerCase() + ligne.slice(1) : ligne;
      lignes[index] = `D’après les documents, ${debut}`;
      const candidate = lignes.join("\n");
      // On ne garde l'ajout que s'il suffit : une procédure reste refusée.
      if (consigneEstQuestionDocumentaire(candidate)) question.consigne = candidate;
    }
  }

  const groupes = marqueursParType(String(question.operationId || ""));
  if (groupes.length === 0) return;
  const autorises = groupes.flatMap((groupe) => groupe.marqueurs);
  const estAutorise = (marqueur: string) =>
    autorises.some((autorise) => normaliserExpression(autorise) === normaliserExpression(marqueur));
  const bruts = Array.isArray(question.marqueursRelationAttendus) ? question.marqueursRelationAttendus : [];
  // Gemini renvoie parfois des objets { typeLien, marqueurs: "a, b" } au lieu de chaînes.
  const actuels = bruts.flatMap((item: any) => typeof item === "string"
    ? [item]
    : String(item?.marqueurs || "").split(","))
    .map((item: string) => item.trim())
    .filter((item: string) => item && estAutorise(item));
  const champs = CHAMPS_AVEC_MARQUEURS[question.operationId] || [];
  const textes = champs.flatMap((champ) => Array.isArray(question[champ]) ? question[champ] : [question[champ]])
    .map(normaliserExpression)
    .filter(Boolean);
  const employes = autorises.filter((marqueur) => textes.some((texte) => texte.includes(normaliserExpression(marqueur))));
  const fusion = [...actuels];
  for (const marqueur of employes) {
    if (!fusion.some((actuel) => normaliserExpression(actuel) === normaliserExpression(marqueur))) fusion.push(marqueur);
  }
  if (fusion.length > 0) question.marqueursRelationAttendus = fusion;
}

export function validerConsigneQuestionDocumentaire(value: unknown): void {
  if (!consigneEstQuestionDocumentaire(value)) {
    throw new Error("La tâche à réaliser doit être une question liée aux documents, sans décrire une procédure.");
  }
}

function exigerMarqueurs(question: any, operationId: string, typesRequis?: string[]): void {
  const groupes = marqueursParType(operationId);
  if (groupes.length === 0) return;
  const attendus = tableauTextes(question?.marqueursRelationAttendus);
  if (attendus.length === 0) throw new Error(`Les marqueurs de relation sont absents pour l'opération ${operationId}.`);
  const autorises = groupes.flatMap((groupe) => groupe.marqueurs).map(normaliserExpression);
  if (attendus.some((marqueur) => !autorises.includes(normaliserExpression(marqueur)))) {
    throw new Error(`Un marqueur de relation n'est pas autorisé pour l'opération ${operationId}.`);
  }
  for (const typeRequis of typesRequis || groupes.map((groupe) => groupe.typeLien)) {
    const groupe = groupes.find((item) => normaliserExpression(item.typeLien) === normaliserExpression(typeRequis));
    if (groupe && !attendus.some((attendu) => groupe.marqueurs.map(normaliserExpression).includes(normaliserExpression(attendu)))) {
      throw new Error(`Un marqueur de type « ${typeRequis} » est requis pour l'opération ${operationId}.`);
    }
  }
}

export function operationIntellectuelleReconnue(operationId: unknown): boolean {
  return SECTION_A_OPERATIONS_REQUISES.includes(String(operationId));
}

export function pointsOperation(question: any = {}, operationId = question?.operationId): number {
  const operation: any = OPERATIONS.find((item) => item.id === operationId);
  const bareme: any = operation?.bareme || {};
  if (!operation) return 1;
  if (operationId === "faits") {
    const nombreFaits = Number(question?.nombreFaitsDemandes)
      || (Array.isArray(question?.faitsAttendus) ? question.faitsAttendus.length : 0)
      || 1;
    return Math.min(bareme.pointsMaximum, Math.max(bareme.pointsMinimum, nombreFaits));
  }
  if (operationId === "espace-temps") {
    return question?.type === "espace" || question?.dimension === "espace"
      ? bareme.pointsEspace
      : bareme.pointsTemps;
  }
  if (operationId === "mise-en-relation") {
    const nombreAssociations = Array.isArray(question?.documents) ? question.documents.length : 0;
    return Math.min(bareme.pointsMaximum, Math.max(bareme.pointsMinimum, nombreAssociations || bareme.pointsMaximum));
  }
  return bareme.points;
}

/**
 * Vérifie les propriétés pédagogiques qui distinguent réellement les sept
 * opérations. Ces métadonnées restent internes et servent aussi à la correction.
 */
export function validerContenuOperation(question: any, operationId = question?.operationId): void {
  const id = String(operationId || "");
  if (!operationIntellectuelleReconnue(id)) throw new Error("L'opération intellectuelle est absente ou inconnue.");
  if (question?.operationId !== id) throw new Error(`L'activité doit déclarer l'opération ${id}.`);
  if (!texteNonVide(question?.consigne ?? question?.question)) throw new Error(`La consigne est absente pour l'opération ${id}.`);
  const pointsAttendus = pointsOperation(question, id);
  if (!Number.isFinite(Number(question?.points)) || Number(question.points) !== pointsAttendus) {
    throw new Error(`Le barème de ${id} doit être de ${pointsAttendus} point${pointsAttendus > 1 ? "s" : ""}.`);
  }
  const formatAttendu = id === "espace-temps"
    ? (question?.type === "espace" || question?.dimension === "espace" ? "carte" : "classement")
    : {
      faits: "court",
      "mise-en-relation": "association-paires",
      "causes-consequences": "court",
      "liens-causalite": "causalite-3",
      "continuite-changement": "changement-continuite",
      comparaisons: "comparaison",
    }[id];
  if (question?.format !== undefined && question.format !== formatAttendu) {
    throw new Error(`La forme de réponse de ${id} doit être ${formatAttendu}.`);
  }

  if (id === "faits") {
    if (!CATEGORIES_FAIT.map(normaliserExpression).includes(normaliserExpression(question.categorieFait))) {
      throw new Error("La catégorie du fait historique est absente ou invalide.");
    }
    if (question.aspectSociete !== undefined && question.aspectSociete !== null && String(question.aspectSociete).trim() !== ""
      && !ASPECTS_SOCIETE.map(normaliserExpression).includes(normaliserExpression(question.aspectSociete))) {
      throw new Error("L'aspect de société associé au fait est invalide.");
    }
    if (!texteNonVide(question.faitAttendu)) throw new Error("Le fait historique attendu est absent.");
    return;
  }

  if (id === "espace-temps") {
    const dimension = String(question.dimension || question.type || "");
    if (!["temps", "espace"].includes(dimension)) throw new Error("La question doit cibler le temps ou l'espace, mais pas les deux.");
    if (!texteNonVide(question.repereAttendu)) throw new Error("Le repère temporel ou spatial attendu est absent.");
    exigerMarqueurs(question, id, [dimension === "temps" ? "Temps" : "Espace"]);
    return;
  }

  if (id === "causes-consequences") {
    const relation = String(question.relationDemandee || "");
    if (!["cause", "consequence", "conséquence"].includes(normaliserExpression(relation))) {
      throw new Error("La consigne doit demander explicitement une cause ou une conséquence.");
    }
    if (question.aspectSociete !== undefined && question.aspectSociete !== null && String(question.aspectSociete).trim() !== ""
      && !ASPECTS_SOCIETE.map(normaliserExpression).includes(normaliserExpression(question.aspectSociete))) {
      throw new Error("L'aspect de société de la cause ou de la conséquence est invalide.");
    }
    exigerMarqueurs(question, id, [normaliserExpression(relation) === "cause" ? "Cause" : "Conséquence"]);
    if (!texteNonVide(question.evenementCible) || !texteNonVide(question.elementAttendu)) {
      throw new Error("L'événement cible et la cause ou conséquence attendue sont obligatoires.");
    }
    if (!texteContientMarqueur(question.elementAttendu, tableauTextes(question.marqueursRelationAttendus))) {
      throw new Error("La cause ou conséquence attendue doit expliciter le lien avec un marqueur autorisé.");
    }
    return;
  }

  if (id === "mise-en-relation") {
    if (!texteNonVide(question.realiteCommune)) {
      throw new Error("La mise en relation doit cibler une même réalité historique.");
    }
    const faitsRelier = [question.faitsRelier, question.elementsRelier, question.propositions]
      .map(tableauTextes)
      .find((items) => items.length > 0)
      || [];
    if (faitsRelier.length < 2 || faitsRelier.length > 3
      || new Set(faitsRelier.map(normaliserExpression)).size !== faitsRelier.length) {
      throw new Error("La mise en relation exige deux ou trois faits distincts.");
    }
    const propositions = tableauTextes(question.propositions);
    const propositionsDifferentes = propositions.length > 0
      && (propositions.length !== faitsRelier.length
        || faitsRelier.some((fait, index) => normaliserExpression(fait) !== normaliserExpression(propositions[index])));
    if (propositionsDifferentes) {
      throw new Error("Les faits à relier doivent correspondre exactement aux propositions affichées.");
    }
    const associations = Array.isArray(question.associationsAttendues)
      ? question.associationsAttendues.map(Number)
      : [];
    if (associations.length !== faitsRelier.length
      || associations.some((index: number) => !Number.isInteger(index) || index < 0 || index >= faitsRelier.length)
      || new Set(associations).size !== faitsRelier.length) {
      throw new Error("La clé de correction des associations est absente ou invalide.");
    }
    if (Array.isArray(question.documents)
      && associations.some((index: number) => index >= question.documents.length)) {
      throw new Error("Chaque association doit pointer vers un document existant.");
    }
    if (!texteNonVide(question.constatAttendu)) {
      throw new Error("La mise en relation doit expliciter le thème commun aux faits.");
    }
    const constatNormalise = normaliserExpression(question.constatAttendu);
    if (constatNormalise && /\b(parce que|donc|entraine|provoque|cause|consequence|par consequent)\b/.test(constatNormalise)) {
      throw new Error("La mise en relation doit associer des faits sans formuler un lien de causalité.");
    }
    if (tableauTextes(question.marqueursRelationAttendus).length > 0) {
      exigerMarqueurs(question, id);
    }
    return;
  }

  if (id === "liens-causalite") {
    const etapes = tableauTextes(question.etapes);
    if (etapes.length !== 3 || new Set(etapes.map(normaliserExpression)).size !== 3) {
      throw new Error("La chaîne de causalité doit contenir exactement trois étapes distinctes.");
    }
    const champConsigne = question.consigne !== undefined ? "consigne" : "question";
    question[champConsigne] = normaliserConsigneTroisPicots(question[champConsigne], etapes);
    const picots = extrairePicots(question[champConsigne]);
    if (picots.length !== 3) {
      throw new Error("La question à trois picots doit présenter exactement trois énoncés précédés d’un picot.");
    }
    exigerMarqueurs(question, id);
    const liens = tableauTextes(question.liensAttendus);
    if (liens.length !== 2 || liens.some((lien) => !texteContientMarqueur(lien, tableauTextes(question.marqueursRelationAttendus)))) {
      throw new Error("La chaîne de causalité doit expliciter séparément les liens A vers B et B vers C.");
    }
    return;
  }

  if (id === "comparaisons") {
    const acteursComparer = tableauTextes(question.acteursComparer);
    if (acteursComparer.length !== 3 || new Set(acteursComparer.map(normaliserExpression)).size !== 3) {
      throw new Error("La comparaison exige exactement trois acteurs ou historiens distincts.");
    }
    if (!texteNonVide(question.enjeuCommun)
      || !texteNonVide(question.acteurDissident)
      || !acteursComparer.map(normaliserExpression).includes(normaliserExpression(question.acteurDissident))) {
      throw new Error("L’enjeu commun et l’acteur dissident doivent être déclarés.");
    }
    exigerMarqueurs(question, id, ["Similitude", "Différence"]);
    const groupesComparaison = marqueursParType(id);
    const similitudes = groupesComparaison.find((groupe) => groupe.typeLien === "Similitude")?.marqueurs || [];
    const differences = groupesComparaison.find((groupe) => groupe.typeLien === "Différence")?.marqueurs || [];
    if (!texteContientMarqueur(question.positionCommuneAttendue, similitudes)
      || !texteContientMarqueur(question.positionDissidenteAttendue, differences)) {
      throw new Error("Les positions commune et dissidente attendues doivent employer leurs marqueurs comparatifs respectifs.");
    }
    return;
  }

  if (!texteNonVide(question.realiteComparee)
    || tableauTextes(question.moments).length !== 2) {
    throw new Error("La continuité et le changement exigent une même réalité et deux moments précis.");
  }
  exigerMarqueurs(question, id, ["Changement", "Continuité"]);
  const groupesEvolution = marqueursParType(id);
  const changements = groupesEvolution.find((groupe) => groupe.typeLien === "Changement")?.marqueurs || [];
  const continuites = groupesEvolution.find((groupe) => groupe.typeLien === "Continuité")?.marqueurs || [];
  if (!texteContientMarqueur(question.changementAttendu, changements)
    || !texteContientMarqueur(question.continuiteAttendue, continuites)) {
    throw new Error("Le changement et la continuité attendus doivent employer leurs marqueurs respectifs.");
  }
}

export function validerFeedbackOperation(feedback: any, operationId: string): void {
  if (!feedback || typeof feedback !== "object" || !operationIntellectuelleReconnue(operationId)) {
    throw new Error("La rétroaction de l'opération est absente ou invalide.");
  }
  const diagnostic = feedback.diagnosticOperation;
  if (!diagnostic || typeof diagnostic !== "object"
    || !Array.isArray(diagnostic.criteresRespectes)
    || !Array.isArray(diagnostic.criteresARetravailler)
    || !Array.isArray(diagnostic.marqueursUtilises)
    || !texteNonVide(diagnostic.preuveDocumentaire)) {
    throw new Error("La rétroaction doit diagnostiquer les critères, les marqueurs et la preuve documentaire.");
  }
  const criteres = [...tableauTextes(diagnostic.criteresRespectes), ...tableauTextes(diagnostic.criteresARetravailler)];
  const operation = OPERATIONS.find((item) => item.id === operationId);
  const nombreCriteresApplicables = operationId === "espace-temps"
    ? 2
    : (operation?.criteresObligatoires?.length || 1);
  if (new Set(criteres.map(normaliserExpression)).size < nombreCriteresApplicables) {
    throw new Error("La rétroaction doit évaluer chacun des critères obligatoires de l'opération.");
  }
  const exemple = feedback.exempleReponse ?? feedback.explication;
  if (!texteNonVide(exemple)) {
    throw new Error("La rétroaction doit fournir une réponse modèle.");
  }
  const groupes = marqueursParType(operationId);
  if (groupes.length > 0 && !groupes.every((groupe) => texteContientMarqueur(exemple, groupe.marqueurs))) {
    if (!["espace-temps", "causes-consequences"].includes(operationId)
      || !groupes.some((groupe) => texteContientMarqueur(exemple, groupe.marqueurs))) {
      throw new Error("La réponse modèle doit employer les marqueurs requis par l'opération.");
    }
  }
}

/**
 * Le modèle doit déclarer les balises officielles qu'il a réellement ciblées.
 * Cela rend possible un audit de couverture et empêche une sortie seulement
 * conforme à la forme de masquer une activité hors programme.
 */
export function validerRattachementPFEQ(question: any, periodeId = question?.periodeId): void {
  const realite = trouverRealitePFEQ(periodeId);
  if (!realite) throw new Error("La période ne correspond à aucune réalité officielle du programme.");
  if (!Array.isArray(question?.conceptsPfeq) || question.conceptsPfeq.length === 0
    || question.conceptsPfeq.some((concept: unknown) => !conceptsPFEQAutorises(periodeId).includes(String(concept)))) {
    throw new Error(`L'activité doit cibler au moins un concept officiel de la période ${realite.id}.`);
  }
  if (!Array.isArray(question?.connaissancesPfeq) || question.connaissancesPfeq.length === 0
    || question.connaissancesPfeq.some((connaissance: unknown) => !connaissancesPFEQAutorisees(periodeId).includes(String(connaissance)))) {
    throw new Error(`L'activité doit cibler au moins une connaissance officielle de la période ${realite.id}.`);
  }
}

export function schemaHierarchieEstExacte(branches: unknown): boolean {
  if (!Array.isArray(branches)) return false;

  const normalisees = branches.map((branch: SchemaBranchContract) => ({
    id: Number(branch?.id),
    niveau: Number(branch?.niveau),
    parentId: branch?.parentId === null || branch?.parentId === undefined || branch?.parentId === ""
      ? null
      : Number(branch.parentId),
  }));
  const ids = new Set(normalisees.map((branch) => branch.id));
  const parents = normalisees.filter((branch) => branch.niveau === 1 && branch.parentId === null);
  const enfantsDe1 = normalisees.filter((branch) => branch.niveau === 2 && branch.parentId === 1);
  const enfantsDe2 = normalisees.filter((branch) => branch.niveau === 2 && branch.parentId === 2);

  return normalisees.length === 6
    && ids.size === 6
    && [1, 2, 3, 4, 5, 6].every((id) => ids.has(id))
    && parents.length === 2
    && parents.every((branch) => [1, 2].includes(branch.id))
    && enfantsDe1.length === 2
    && enfantsDe2.length === 2
    && enfantsDe1.every((branch) => [3, 4].includes(branch.id))
    && enfantsDe2.every((branch) => [5, 6].includes(branch.id));
}

export function compterMotsReponse(texte: string): number {
  return texte.trim() ? texte.trim().split(/\s+/).length : 0;
}

export function reponseCourteEstPhraseComplete(texte: string): boolean {
  return compterMotsReponse(texte) >= 3;
}

export function reponseEstUnSeulMot(texte: string): boolean {
  return compterMotsReponse(texte) === 1;
}

export function reponseCEvaluable(texte: string, maximum = 300): boolean {
  return texte.trim().length > 0 && compterMotsReponse(texte) <= maximum;
}

export function classementChronologiqueValide(elements: unknown): boolean {
  if (!Array.isArray(elements) || elements.length !== 4) return false;
  return elements.every((element) => {
    if (!element || typeof element !== "object") return false;
    const valeur = element as { label?: unknown; annee?: unknown; ordre?: unknown };
    return String(valeur.label || "").trim().length > 0
      && String(valeur.annee ?? valeur.ordre ?? "").trim().length > 0;
  });
}

/**
 * Les réponses courtes et les QCM de la Section A travaillent les connaissances
 * dans un dossier textuel. Les images, cartes, graphiques et autres supports
 * visuels restent réservés aux activités qui les demandent explicitement.
 */
export function documentEstVisuelPourReponse(document: any): boolean {
  if (!document || typeof document !== "object") return true;
  const type = String(document.typeDoc || document.type || "").toLowerCase();
  const typeVisuel = ["icon", "image", "photo", "affich", "portrait", "carte", "graph", "visuel", "stat", "tableau", "representation", "représentation"]
    .some((motif) => type.includes(motif));
  const imageDeclaree = ["imageUrl", "image", "imageSource", "imageSrc", "urlImage", "wikimediaUrl"]
    .some((champ) => typeof document[champ] === "string" && document[champ].trim().length > 0);
  return typeVisuel || imageDeclaree || estDocumentIconographique(document);
}

export function documentEstPhotoPourOperation(document: any): boolean {
  if (!document || typeof document !== "object") return true;
  const type = String(document.typeDoc || document.type || "").toLowerCase();
  const typePhoto = ["icon", "image", "photo", "affich", "portrait", "carte", "visuel", "représentation", "representation"]
    .some((motif) => type.includes(motif));
  const imageDeclaree = ["imageUrl", "image", "imageSource", "imageSrc", "urlImage", "wikimediaUrl"]
    .some((champ) => typeof document[champ] === "string" && document[champ].trim().length > 0);
  return typePhoto || imageDeclaree;
}

export function assainirRattachementPFEQSectionA(question: any): any {
  const realite = trouverRealitePFEQ(question?.periodeId);
  if (!realite || !question || typeof question !== "object") return question;
  const conceptsPfeq = Array.isArray(question.conceptsPfeq)
    ? [...new Set(question.conceptsPfeq.map(String).filter((concept: string) => realite.concepts.includes(concept)))]
    : [];
  const connaissancesPfeq = Array.isArray(question.connaissancesPfeq)
    ? [...new Set(question.connaissancesPfeq.map(String).filter((connaissance: string) => realite.connaissances.includes(connaissance)))]
    : [];
  return { ...question, conceptsPfeq, connaissancesPfeq };
}

export function validerLotSectionA(questions: any[], periodesDisponibles: any[], parcours: 'reponses' | 'operations') {
  if (!Array.isArray(questions) || questions.length !== 10) {
    throw new Error(`Le générateur a renvoyé ${Array.isArray(questions) ? questions.length : 0} questions au lieu de 10.`);
  }
  const enonces = questions.map((question) => normaliserExpression(question?.question));
  if (enonces.some((enonce) => !enonce) || new Set(enonces).size !== questions.length) {
    throw new Error("Le lot doit contenir dix énoncés distincts et non vides.");
  }
  const periodesValides = new Set(periodesDisponibles.map((periode) => Number(periode.id)));
  const periodesUtilisees = new Set(questions.map((question) => Number(question?.periodeId)));
  const periodeNonCouverte = [...periodesValides].find((periodeId) => !periodesUtilisees.has(periodeId));
  if (periodeNonCouverte !== undefined) {
    throw new Error(`Le lot doit couvrir chaque période sélectionnée; la période ${periodeNonCouverte} est absente.`);
  }
  if (parcours === 'reponses') {
    const formats = questions.map(getSectionAFormat);
    if (formats.filter((format) => format === "qcm").length !== 5 || formats.filter((format) => format === "court").length !== 5) {
      throw new Error("Le parcours de réponses doit contenir exactement 5 QCM et 5 réponses courtes.");
    }
    if (!questions.some((question) => getSectionAFormat(question) === "court" && classementChronologiqueValide(question.elementsChronologiques))) {
      throw new Error("Le lot doit contenir un classement chronologique complet dans une réponse courte.");
    }
    questions.forEach((question, index) => {
      if (!periodesValides.has(Number(question.periodeId))) throw new Error(`Période invalide à la question ${index + 1}.`);
      validerRattachementPFEQ(question);
      const format = getSectionAFormat(question);
      const estClassementChronologique = format === "court" && classementChronologiqueValide(question.elementsChronologiques);
      if (!texteNonVide(question.question)) throw new Error(`Énoncé absent à la question ${index + 1}.`);
      if (!["qcm", "court"].includes(format)) throw new Error(`Format non permis dans le module de réponses à la question ${index + 1}.`);
      const documents = Array.isArray(question.documents) ? question.documents : [];
      if (!estClassementChronologique && documents.length === 0) throw new Error(`Dossier documentaire manquant à la question ${index + 1}.`);
      if (documents.some((document: any) => !documentPedagogiqueComplet(document))) {
        throw new Error(`Document textuel incomplet à la question ${index + 1}.`);
      }
      if (documents.some(documentEstVisuelPourReponse)) {
        throw new Error(`Le dossier de la question ${index + 1} doit contenir uniquement des documents textuels, sans photo ni représentation visuelle.`);
      }
      if (format === "qcm") {
        if (!Array.isArray(question.choix) || question.choix.length !== 4
          || question.choix.some((choix: unknown) => !texteNonVide(choix))
          || new Set(question.choix.map((choix: unknown) => normaliserExpression(choix))).size !== 4
          || !Number.isInteger(question.indexReponseCorrecte)
          || question.indexReponseCorrecte < 0 || question.indexReponseCorrecte > 3) {
          throw new Error(`QCM incomplet à la question ${index + 1}.`);
        }
      } else if (!texteNonVide(question.reponseAttendue)
        || !Array.isArray(question.criteresCorrection)
        || question.criteresCorrection.length === 0) {
        throw new Error(`Réponse attendue incomplète à la question ${index + 1}.`);
      }
    });
    return;
  }
  const operations = new Set(questions.map((question) => question.operationId));
  const operationManquante = SECTION_A_OPERATIONS_REQUISES.find((operation) => !operations.has(operation));
  if (operationManquante) throw new Error(`Opération absente du lot : ${operationManquante}.`);
  if (questions.filter((question) => getSectionAFormat(question) === "qcm" && !question.operationId).length !== 3
    || questions.some((question) => getSectionAFormat(question) === "qcm" && question.operationId)
    || questions.some((question) => getSectionAFormat(question) !== "qcm" && !operationIntellectuelleReconnue(question.operationId))) {
    throw new Error("Le lot d'opérations doit contenir exactement trois QCM de consolidation sans opération et une question pour chacune des sept opérations.");
  }
  const formatsObligatoires: Record<string, string> = {
    "faits": "court",
    "espace-temps": "classement",
    "mise-en-relation": "association-paires",
    "causes-consequences": "court",
    "liens-causalite": "causalite-3",
    "continuite-changement": "changement-continuite",
    "comparaisons": "comparaison",
  };
  const formatManquant = Object.entries(formatsObligatoires).find(([operationId, format]) => !questions.some((question) => question.operationId === operationId && getSectionAFormat(question) === format));
  if (formatManquant) throw new Error(`Le format ${formatManquant[1]} manque pour l'opération ${formatManquant[0]}.`);
  questions.forEach((question, index) => {
    if (!periodesValides.has(Number(question.periodeId))) throw new Error(`Période invalide à la question ${index + 1}.`);
    if (!texteNonVide(question.question)) throw new Error(`Énoncé absent à la question ${index + 1}.`);
    validerRattachementPFEQ(question);
    if (operationIntellectuelleReconnue(question.operationId)) validerContenuOperation(question);
    if (!Array.isArray(question.documents) || question.documents.length === 0
      || question.documents.some((document: any) => !documentPedagogiqueComplet(document))) {
      throw new Error(`Dossier documentaire incomplet à la question ${index + 1}.`);
    }
    if (question.documents.some(documentEstVisuelPourReponse)) {
      throw new Error(`Le dossier de la question ${index + 1} doit contenir uniquement des documents textuels.`);
    }
    if (question.operationId === "espace-temps" && question.dimension !== "temps") {
      throw new Error("Dans la Section A, situer dans le temps doit utiliser un classement chronologique.");
    }
    const format = getSectionAFormat(question);
    if (format === "qcm" && (!Array.isArray(question.choix) || question.choix.length !== 4 || !Number.isInteger(question.indexReponseCorrecte) || question.indexReponseCorrecte < 0 || question.indexReponseCorrecte > 3)) {
      throw new Error(`QCM incomplet à la question ${index + 1}.`);
    }
    if (format === "classement" && (!Array.isArray(question.documents) || question.documents.length !== 4 || !Array.isArray(question.ordreCorrect) || question.ordreCorrect.length !== 4)) {
      throw new Error(`Classement incomplet à la question ${index + 1}.`);
    }
    if (format === "association-paires" && (!Array.isArray(question.documents)
      || question.documents.length < 2
      || question.documents.length > 3
      || !Array.isArray(question.faitsRelier)
      || question.faitsRelier.length !== question.documents.length
      || new Set(question.faitsRelier.map((fait: unknown) => normaliserExpression(fait))).size !== question.faitsRelier.length
      || !Array.isArray(question.associationsAttendues)
      || question.associationsAttendues.length !== question.documents.length
      || new Set(question.associationsAttendues.map(Number)).size !== question.documents.length
      || question.associationsAttendues.some((association: unknown) => !Number.isInteger(Number(association)) || Number(association) < 0 || Number(association) >= question.documents.length))) {
      throw new Error(`La question ${index + 1} de mise en relation doit contenir deux ou trois documents et autant de faits distincts à associer.`);
    }
    if (format === "causalite-3" && (!Array.isArray(question.etapes) || question.etapes.length !== 3)) {
      throw new Error(`Chaîne de causalité incomplète à la question ${index + 1}.`);
    }
  });
}

export function validerQuestionB(
  question: any,
  operationId: string,
  periodesDisponibles: unknown[],
  expectedDocumentCount?: number,
): void {
  if (!question || typeof question !== "object") throw new Error("Le dossier de la Section B est absent ou invalide.");
  const periodeId = Number(question.periodeId);
  if (!Number.isInteger(periodeId) || !periodesDisponibles.map(Number).includes(periodeId)) {
    throw new Error("Le dossier généré utilise une période désactivée.");
  }
  validerRattachementPFEQ(question, periodeId);
  if (!texteNonVide(question.consigne)) throw new Error("La consigne du dossier de la Section B est incomplète.");
  validerConsigneQuestionDocumentaire(question.consigne);
  validerContenuOperation(question, operationId);
  const comparaisonCartographique = operationId === "comparaisons" && question.utiliserCarteHistorique === true;
  const identificationCartographique = operationId === "espace-temps" && question.type === "espace";
  if (!Array.isArray(question.documents) || (!comparaisonCartographique && !identificationCartographique && question.documents.length === 0)
    || !question.documents.every(documentPedagogiqueComplet)) {
    throw new Error("Le dossier de la Section B contient un document incomplet.");
  }
  if (question.documents.some(documentEstPhotoPourOperation)) {
    throw new Error("Les dossiers d’opérations ne doivent pas contenir de photo : la carte est affichée séparément dans son encadré.");
  }

  if (question.type === "temps") {
    if (!["ordre", "avant-apres", "suite-chronologique"].includes(question.sousType)) throw new Error("Le sous-type de la ligne du temps est invalide.");
    if (question.documents.length !== 4) throw new Error("La ligne du temps exige exactement quatre documents.");
    if (question.sousType === "ordre") {
      if (!Array.isArray(question.ordreCorrect) || question.ordreCorrect.length !== 4
        || new Set(question.ordreCorrect).size !== 4
        || question.ordreCorrect.some((index: unknown) => !Number.isInteger(index) || Number(index) < 0 || Number(index) > 3)) {
        throw new Error("Ordre chronologique incomplet.");
      }
    } else if (question.sousType === "suite-chronologique") {
      if (!Array.isArray(question.ordrePropositions) || question.ordrePropositions.length !== 4
        || !Number.isInteger(question.indexOrdreCorrect)
        || question.indexOrdreCorrect < 0
        || question.indexOrdreCorrect >= question.ordrePropositions.length
        || !Array.isArray(question.ordreCorrect)
        || question.ordreCorrect.length !== 4
        || new Set(question.ordreCorrect).size !== 4
        || question.ordreCorrect.some((index: unknown) => !Number.isInteger(index) || Number(index) < 0 || Number(index) > 3)) {
        throw new Error("Les choix de la suite chronologique sont incomplets.");
      }
      const ordres = question.ordrePropositions.map((proposition: any) => proposition?.ordre);
      if (ordres.some((ordre: unknown) => !Array.isArray(ordre) || ordre.length !== 4
        || new Set(ordre).size !== 4
        || ordre.some((index: unknown) => !Number.isInteger(index) || Number(index) < 0 || Number(index) > 3))) {
        throw new Error("Chaque choix de la suite chronologique doit contenir quatre documents distincts.");
      }
      const ordreCorrectTexte = JSON.stringify(question.ordreCorrect);
      const choixCorrects = ordres.filter((ordre: unknown) => JSON.stringify(ordre) === ordreCorrectTexte).length;
      if (choixCorrects !== 1) throw new Error("La suite chronologique doit contenir une seule bonne réponse.");
    } else if (!texteNonVide(question.referenceEvenement)
      || !Array.isArray(question.classificationCorrecte)
      || question.classificationCorrecte.length !== 4
      || question.classificationCorrecte.some((value: unknown) => !["avant", "apres"].includes(String(value)))
      || question.classificationCorrecte.filter((value: unknown) => value === "avant").length !== 2
      || question.classificationCorrecte.filter((value: unknown) => value === "apres").length !== 2) {
      throw new Error("Classement avant/après incomplet.");
    }
    return;
  }

  if (question.type === "espace") {
    if (!["province-quebec", "1867", "1870-71", "1999"].includes(question.carteEra)
      || !texteNonVide(question.lieuCorrect)) {
      throw new Error("Carte géographique incomplète.");
    }
    const periodeCompatible = question.carteEra === "province-quebec"
      ? periodeId >= 3
      : question.carteEra === "1999"
        ? periodeId === 8
        : periodeId >= 5;
    if (!periodeCompatible) throw new Error("La carte géographique est incompatible avec la période choisie.");
    if (question.carteEra === "province-quebec"
      && (!Array.isArray(question.comparaisonAnnees) || question.comparaisonAnnees.length !== 2
        || question.comparaisonAnnees.some((annee: unknown) => !["1763", "1774", "1783"].includes(String(annee))))) {
      throw new Error("La comparaison territoriale doit contenir deux années valides.");
    }
    return;
  }

  if (question.type !== undefined && question.type !== "operation") {
    throw new Error("Le type du dossier de la Section B est contradictoire.");
  }
  if (comparaisonCartographique) {
    if (!["1763-1774", "1774-1783", "1763-1783", "1763-1774-1783", "1867-1999"].includes(question.carteHistoriqueType)
      || question.documents.length !== 0) {
      throw new Error("Le dossier de comparaison cartographique est incomplet.");
    }
    return;
  }
  if (operationId === "mise-en-relation") {
    if (question.documents.length < 2 || question.documents.length > 3) {
      throw new Error("La mise en relation doit conserver deux ou trois documents.");
    }
    return;
  }
  if (expectedDocumentCount !== undefined && question.documents.length !== expectedDocumentCount) {
    throw new Error(`Le dossier doit conserver exactement ${expectedDocumentCount} document${expectedDocumentCount > 1 ? "s" : ""}.`);
  }
  if (expectedDocumentCount === undefined && (question.documents.length < 1 || question.documents.length > 2)) {
    throw new Error("Le dossier doit conserver entre un et deux documents.");
  }
  if (operationId === "continuite-changement"
    && (!Array.isArray(question.moments) || question.moments.length !== 2 || question.moments.some((moment: unknown) => !texteNonVide(moment)))) {
    throw new Error("Les deux moments historiques sont obligatoires.");
  }
}

export function validerQuestionC(question: any, periodesDisponibles: unknown[]): void {
  if (!question || typeof question !== "object" || !["description", "explication"].includes(question.typeTache)) {
    throw new Error("La tâche de la Section C est absente ou invalide.");
  }
  if (!texteNonVide(question.consigne) || !texteNonVide(question.contexte)) {
    throw new Error("La consigne de la Section C est incomplète.");
  }
  const periodeId = Number(question.periodeId);
  if (!Number.isInteger(periodeId) || !periodesDisponibles.map(Number).includes(periodeId)) {
    throw new Error("La question élaborée utilise une période désactivée.");
  }
  validerRattachementPFEQ(question, periodeId);
  if (!Array.isArray(question.documents) || question.documents.length < 8 || question.documents.length > 10
    || !question.documents.every(documentPedagogiqueComplet)) {
    throw new Error("Le dossier de la question élaborée doit contenir de 8 à 10 documents complets.");
  }
  if (question.documents.some((document: any) => typeof document.pertinent !== "boolean"
    || !Array.isArray(document.elementsCibles)
    || !texteNonVide(document.justificationPertinence))) {
    throw new Error("Les métadonnées de pertinence de la Section C sont incomplètes.");
  }
  if (question.documents.some((document: any) => document.pertinent !== true || document.elementsCibles.length === 0)) {
    throw new Error("La question élaborée doit contenir uniquement des documents pertinents pour la consigne.");
  }
  if (!criteresCorrectionSectionCComplets(question)) {
    throw new Error("Les critères de correction de la Section C sont incomplets.");
  }
}

export function criteresCorrectionSectionCComplets(question: any): boolean {
  const nombreAttendu = question?.typeTache === "description" ? 3 : 2;
  const criteres = question?.criteresCorrectionAttendus;
  const documents = Array.isArray(question?.documents) ? question.documents : [];
  const lettresDocuments = new Set(documents.map((_: unknown, index: number) => String.fromCharCode(65 + index)));
  if (!Array.isArray(criteres) || criteres.length !== nombreAttendu) return false;
  return criteres.every((critere: any, index: number) => {
    if (Number(critere?.elementId) !== index + 1
      || !texteNonVide(critere?.element)
      || !texteNonVide(critere?.description)
      || !Array.isArray(critere?.documentsPertinents)
      || critere.documentsPertinents.length === 0) {
      return false;
    }
    return critere.documentsPertinents.every((document: unknown) => {
      const lettre = String(document || "").trim();
      return /^[A-Z]$/.test(lettre) && lettresDocuments.has(lettre);
    });
  });
}

function noteNormalisee(value: unknown, maximum: number, fallback = 0): string {
  const match = String(value || "").match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
  if (!match || Number(match[2]) !== maximum) return `${fallback}/${maximum}`;
  return `${Math.min(maximum, Math.max(0, Number(match[1])))} / ${maximum}`.replace(" / ", "/");
}

type SectionAFormat = typeof SECTION_A_FORMATS[number];

function texteNonVide(value: unknown): boolean {
  return String(value || "").trim().length > 0;
}

function extrairePicots(texte: unknown): string[] {
  return String(texte || "")
    .split(/\r?\n/)
    .map((ligne) => ligne.trim())
    .filter((ligne) => /^(?:[-–—•·*]|\d+[.)])\s+/.test(ligne))
    .map((ligne) => ligne.replace(/^(?:[-–—•·*]|\d+[.)])\s+/, "").trim())
    .filter(Boolean);
}

export function normaliserConsigneTroisPicots(consigne: unknown, etapes: unknown): string {
  const elements = Array.isArray(etapes)
    ? etapes.map((etape) => String(etape || "").trim()).filter(Boolean).slice(0, 3)
    : [];
  if (elements.length !== 3) return String(consigne || "").trim();

  const lignes = String(consigne || "")
    .split(/\r?\n/)
    .map((ligne) => ligne.trim())
    .filter(Boolean);
  const introduction = lignes
    .filter((ligne) => !/^(?:[-–—•·*]|\d+[.)])\s+/.test(ligne))
    .join(" ")
    .trim();
  const texteIntroduction = introduction || "Quels liens de causalité les documents permettent-ils d’établir entre les trois éléments suivants ?";
  return `${texteIntroduction}\n- ${elements[0]}\n- ${elements[1]}\n- ${elements[2]}`;
}

export function validerSchemaB(schema: any, periodesDisponibles: unknown[]): void {
  if (!schema || typeof schema !== "object" || !texteNonVide(schema.consigne)) {
    throw new Error("Le schéma généré est incomplet.");
  }
  const periodeId = Number(schema.periodeId);
  if (!Number.isInteger(periodeId) || !periodesDisponibles.map(Number).includes(periodeId)) {
    throw new Error("Le schéma généré utilise une période désactivée.");
  }
  validerRattachementPFEQ(schema, periodeId);
  if (!Array.isArray(schema.documents) || schema.documents.length !== 8 || !schema.documents.every(documentPedagogiqueComplet)) {
    throw new Error("Le schéma généré ne respecte pas le contrat de huit documents.");
  }
  const nbLeurres = schema.documents.filter((document: any) => document.isLeurre === true
    || (Array.isArray(document.pertinentParBranche) && document.pertinentParBranche.length === 0)).length;
  if (nbLeurres !== 3) throw new Error(`Le schéma doit contenir exactement 3 leurres, reçu : ${nbLeurres}.`);
  if (schema.documents.some((document: any) => typeof document.isLeurre !== "boolean"
    || !Array.isArray(document.pertinentParBranche))) {
    throw new Error("Les métadonnées de pertinence des documents du schéma sont incomplètes.");
  }
  if (schema.documents.some((document: any) => Boolean(document.isLeurre)
    !== (Array.isArray(document.pertinentParBranche) && document.pertinentParBranche.length === 0))) {
    throw new Error("Les métadonnées de pertinence des documents du schéma sont contradictoires.");
  }
  if (!Array.isArray(schema.branches) || schema.branches.length !== 6 || !schema.branches.every((branch: any) => texteNonVide(branch.nom) && texteNonVide(branch.consigne))) {
    throw new Error("Le schéma généré doit contenir six nœuds complets.");
  }
  if (!schemaHierarchieEstExacte(schema.branches)) {
    throw new Error("Le schéma généré doit contenir un bloc central, deux branches principales et deux feuilles sous chacune.");
  }
}

export const CRITERES_SCHEMA_PFEQ = Object.freeze([
  "Exactitude des faits et des repères historiques",
  "Mobilisation exacte d’un concept ou d’une connaissance du programme",
  "Mise en relation explicite des réalités historiques",
  "Utilisation pertinente d’une preuve documentaire",
] as const);

export const CRITERES_REPONSE_COURTE_PFEQ = Object.freeze([
  "Exactitude du fait historique",
  "Repère historique pertinent",
  "Réponse directement liée à la question",
  "Preuve documentaire pertinente lorsque le dossier en fournit une",
] as const);

type ContexteFeedbackCourte = {
  consigne?: unknown;
  reponseAttendue?: unknown;
  explicationHistorique?: unknown;
  documents?: any[];
  criteresCorrection?: unknown[];
};

function retirerPhrasesGeneriquesFeedbackCourte(value: unknown): string {
  return String(value || "")
    .replace(/Ta réponse a été reçue\.?/gi, "")
    .replace(/Relis la consigne et vérifie chaque élément attendu\.?/gi, "")
    .replace(/Appuie-toi sur un fait précis et explique le lien avec la question\.?/gi, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function astuceDocumentaireCourte(contexte: ContexteFeedbackCourte): string {
  const documents = Array.isArray(contexte.documents) ? contexte.documents : [];
  const premierDocument = documents[0];
  const titre = String(premierDocument?.titre || (documents.length ? "Document A" : "")).trim();
  const consigne = String(contexte.consigne || "").replace(/\s+/g, " ").trim();
  if (titre && consigne) {
    return `Dans « ${titre} », repère le passage qui permet de répondre à « ${consigne} ». Relève l’acteur, l’action, la date ou le lieu pertinent, puis reformule cet indice dans ta réponse.`;
  }
  if (titre) {
    return `Dans « ${titre} », relève l’acteur, l’action, la date ou le lieu qui répond directement à la consigne, puis reformule cet indice dans ta réponse.`;
  }
  return "Repère le mot-clé de la consigne, puis relève le fait historique qui y répond directement.";
}

export function normaliserFeedbackCourte(
  raw: any,
  total: number,
  fallbackCorrect = false,
  reponseEleve = "",
  typeReponse: "courte" | "qcm" = "courte",
  contexte: ContexteFeedbackCourte = {},
) {
  const maximum = Math.max(1, Number(total) || 1);
  const note = String(raw?.note || "").match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
  const pointsBruts = note && Number(note[2]) === maximum ? Number(note[1]) : Number.NaN;
  const points = Number.isFinite(pointsBruts) ? Math.min(maximum, Math.max(0, pointsBruts)) : (fallbackCorrect ? maximum : 0);
  const texteReponse = String(reponseEleve || "").trim();
  const phraseComplete = reponseCourteEstPhraseComplete(texteReponse);
  const pointsPlafonnes = typeReponse === "courte" && texteReponse && !phraseComplete
    ? Math.min(points, 1)
    : points;
  const pointFortQcm = fallbackCorrect
    ? "Tu as identifié le choix qui correspond à la question."
    : "Tu as examiné les choix proposés; vérifie maintenant l’indice historique qui distingue la bonne réponse.";
  const remplacerFormulationQcm = (value: unknown, fallback: string) => {
    const texte = String(value || "").trim();
    if (typeReponse !== "qcm") return texte;
    return texte.replace(/Tu as pris le temps de formuler une réponse\.?/gi, fallback).trim();
  };
  const reponsePartielleOuErronee = typeReponse === "courte" && pointsPlafonnes < maximum;
  const consigne = String(contexte.consigne || "").replace(/\s+/g, " ").trim();
  const explicationHistorique = String(contexte.explicationHistorique || contexte.reponseAttendue || "")
    .replace(/\s+/g, " ")
    .trim();
  const commentaire = remplacerFormulationQcm(
    retirerPhrasesGeneriquesFeedbackCourte(raw?.commentaire),
    "Ton choix a été enregistré. Relis la consigne et vérifie l’indice historique qui le justifie.",
  );
  const explicationBrute = remplacerFormulationQcm(
    retirerPhrasesGeneriquesFeedbackCourte(raw?.explication),
    "Compare les choix avec le fait historique et l’indice présenté dans le dossier.",
  );
  const explicationDeContexte = explicationHistorique
    ? `Explication historique : ${explicationHistorique}${consigne ? ` Ce fait permet de répondre à la question « ${consigne} ».` : ""}`
    : consigne
      ? `Pour corriger cette réponse, il faut identifier le fait historique qui répond précisément à « ${consigne} » et expliquer pourquoi il convient.`
      : "Pour corriger cette réponse, il faut identifier le fait historique attendu et expliquer pourquoi il répond à la consigne.";
  const explicationContientDejaLeContexte = explicationHistorique
    && normaliserExpression(explicationBrute).includes(normaliserExpression(explicationHistorique).slice(0, 40));
  const explication = typeReponse === "qcm"
    ? explicationBrute || "Compare les choix avec le fait historique et l’indice présenté dans le dossier."
    : reponsePartielleOuErronee && !explicationContientDejaLeContexte
      ? [explicationBrute, explicationDeContexte].filter(Boolean).join("\n\n")
      : explicationBrute || explicationDeContexte;
  const pointFortBrut = remplacerFormulationQcm(raw?.pointFort, pointFortQcm);
  const astuceBrute = retirerPhrasesGeneriquesFeedbackCourte(raw?.astuceDocumentaire);
  const documents = Array.isArray(contexte.documents) ? contexte.documents : [];
  const criteresCibles = typeReponse === "courte"
    ? [...new Set([
      ...CRITERES_REPONSE_COURTE_PFEQ,
      ...(Array.isArray(contexte.criteresCorrection) ? contexte.criteresCorrection : []),
    ].map((critere) => String(critere || "").trim()).filter(Boolean))]
    : [];
  const evaluationsBrutes = Array.isArray(raw?.criteresEvaluation)
    ? raw.criteresEvaluation
    : [];
  const criteresEvaluation = criteresCibles.map((critere) => {
    const evaluation = evaluationsBrutes.find((item: any) =>
      normaliserExpression(item?.critere || item?.criterion) === normaliserExpression(critere),
    );
    const statut = String(evaluation?.statut || evaluation?.status || "").toLowerCase();
    return {
      critere,
      statut: ["respecte", "respecté", "réussi", "acquis", "oui"].some((valeur) => statut.includes(valeur))
        ? "respecte"
        : "a-retravailler",
    };
  });
  const astuceMentionneDossier = documents.some((document: any, index: number) => {
    const titre = String(document?.titre || "").trim();
    return (titre && normaliserExpression(astuceBrute).includes(normaliserExpression(titre)))
      || new RegExp(`document\\s+${String.fromCharCode(65 + index)}`, "i").test(astuceBrute);
  });
  const astuce = typeReponse === "courte" && documents.length > 0 && !astuceMentionneDossier
    ? astuceDocumentaireCourte(contexte)
    : astuceBrute || astuceDocumentaireCourte(contexte);
  return {
    ...(raw && typeof raw === "object" ? raw : {}),
    correct: pointsPlafonnes === maximum,
    note: `${pointsPlafonnes}/${maximum}`,
    commentaire: commentaire || (typeReponse === "qcm"
      ? "Ton choix a été enregistré. Vérifie l’indice historique qui le justifie."
      : reponsePartielleOuErronee
        ? "La réponse doit être précisée ou corrigée à partir des faits historiques du dossier."
        : "La réponse correspond aux éléments historiques attendus."),
    explication,
    lienExtraitReponse: String(raw?.lienExtraitReponse || raw?.diagnosticOperation?.lienExtraitReponse || raw?.diagnosticOperation?.preuveDocumentaire || raw?.explication || "Relie un indice précis de l’extrait à l’idée que tu avances dans ta réponse."),
    pointFort: pointFortBrut || (typeReponse === "qcm" ? pointFortQcm : "Tu as pris le temps de formuler une réponse."),
    elementATravailler: typeReponse === "courte" && texteReponse && !phraseComplete
      ? "Ta réponse contient une bonne piste, mais formule-la dans une phrase complète pour démontrer clairement le fait et son lien avec la question."
      : String(raw?.elementATravailler || "Ajoute un fait précis et explique son lien avec la consigne."),
    astuceDocumentaire: astuce,
    progressionOperation: String(raw?.progressionOperation || "Tu t’exerces à utiliser une preuve historique."),
    ...(criteresCibles.length > 0 ? { criteresCibles, criteresEvaluation } : {}),
  };
}

/**
 * Les services de génération ajoutent parfois une phrase ou un bloc Markdown
 * autour du JSON. On n'accepte que la racine complète : une sortie tronquée
 * reste donc une erreur explicite au lieu de devenir une activité partielle.
 */
export function extraireJSON<T>(texte: string): T {
  const nettoye = String(texte || "").replace(/```(?:json)?/gi, "").trim();
  const candidats = trouverStructuresJSON(nettoye);
  let derniereErreur: unknown;
  for (const candidat of candidats) {
    try {
      return normaliserApostrophesFrançais(JSON.parse(nettoye.slice(candidat.debut, candidat.fin + 1))) as T;
    } catch (erreur) {
      derniereErreur = erreur;
    }
  }
  try {
    return normaliserApostrophesFrançais(JSON.parse(nettoye)) as T;
  } catch (erreur) {
    throw derniereErreur || erreur;
  }
}

function normaliserApostrophesFrançais<T>(value: T): T {
  if (typeof value === "string") {
    return value.replace(/([A-Za-zÀ-ÿ])'(?=[A-Za-zÀ-ÿ])/g, "$1’") as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => normaliserApostrophesFrançais(item)) as T;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, normaliserApostrophesFrançais(item)]),
    ) as T;
  }
  return value;
}

function trouverStructuresJSON(texte: string): Array<{ debut: number; fin: number }> {
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
        if (echappe) echappe = false;
        else if (caractere === "\\") echappe = true;
        else if (caractere === "\"") dansChaine = false;
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

export function normaliserFeedbackElabore(raw: any, typeTache: string) {
  const description = typeTache === "description";
  const partie1 = raw?.detailPartie1 || {};
  const partie2 = raw?.detailPartie2 || {};
  const partie3 = raw?.detailPartie3 || {};
  return {
    ...(raw && typeof raw === "object" ? raw : {}),
    noteGlobale: noteNormalisee(raw?.noteGlobale, 8),
    typeTache,
    detailPartie1: {
      titre: String(partie1.titre || (description ? "Objet de la description" : "Premier élément de réponse")),
      note: noteNormalisee(partie1.note, description ? 2 : 4),
      evaluation: String(partie1.evaluation || "Cet élément doit être précisé à partir de la consigne."),
    },
    detailPartie2: {
      titre: String(partie2.titre || (description ? "Première mise en relation" : "Deuxième élément de réponse")),
      note: noteNormalisee(partie2.note, description ? 3 : 4),
      evaluation: String(partie2.evaluation || "Explique le lien entre le fait et la question."),
    },
    ...(description ? {
      detailPartie3: {
        titre: String(partie3.titre || "Deuxième mise en relation"),
        note: noteNormalisee(partie3.note, 3),
        evaluation: String(partie3.evaluation || "Ajoute une deuxième mise en relation documentée."),
      },
    } : {}),
    commentaireGlobal: String(raw?.commentaireGlobal || "Ta réponse a été reçue.\n\nReprends la consigne et ajoute un fait précis soutenu par un document."),
    lienExtraitReponse: String(raw?.lienExtraitReponse || raw?.associationsDocuments?.[0]?.documents?.[0]?.utilisation || raw?.detailPartie1?.evaluation || "Relie un indice précis d’un document à l’idée que tu avances dans ta réponse."),
    pisteAmelioration: String(raw?.pisteAmelioration || "Ajoute un fait précis, puis explique le lien de cause, de conséquence ou de comparaison."),
    pointFort: String(raw?.pointFort || "Tu as commencé à répondre à la question."),
    elementATravailler: String(raw?.elementATravailler || "Précise le fait historique et le lien avec la consigne."),
    astuceDocumentaire: String(raw?.astuceDocumentaire || "Associe chaque idée à un document précis avant de rédiger."),
    progressionOperation: String(raw?.progressionOperation || "Tu t’exerces à construire une réponse historique structurée."),
    associationsDocuments: Array.isArray(raw?.associationsDocuments) ? raw.associationsDocuments : [],
  };
}

export function normaliserFeedbackSchema(raw: any, branches: any[]) {
  const detailsBruts = Array.isArray(raw?.details) ? raw.details : [];
  return {
    ...(raw && typeof raw === "object" ? raw : {}),
    noteGlobale: noteNormalisee(raw?.noteGlobale, 8),
    lienExtraitReponse: String(raw?.lienExtraitReponse || "Relie un extrait précis à l’idée ou au fait qu’il permet de démontrer."),
    commentaireGlobal: String(raw?.commentaireGlobal || "Ton schéma a été reçu.\n\nReprends chaque branche et relie-la à une preuve documentaire."),
    details: branches.map((branch: any) => {
      const detail = detailsBruts.find((item: any) => Number(item?.branchId) === Number(branch.id)) || {};
      return {
        branchId: Number(branch.id),
        nom: String(detail.nom || branch.nom || `Branche ${branch.id}`),
        note: noteNormalisee(detail.note, 2),
        evaluation: String(detail.evaluation || "Complète cette branche avec un fait et un lien explicatif."),
        documentsPertinents: Array.isArray(detail.documentsPertinents) ? detail.documentsPertinents : [],
        documentsHorsSujet: Array.isArray(detail.documentsHorsSujet) ? detail.documentsHorsSujet : [],
        criteresRespectes: Array.isArray(detail.criteresRespectes) ? detail.criteresRespectes.map(String) : [],
        criteresARetravailler: Array.isArray(detail.criteresARetravailler) ? detail.criteresARetravailler.map(String) : [],
        preuveDocumentaire: String(detail.preuveDocumentaire || ""),
      };
    }),
    pointFort: String(raw?.pointFort || "Tu as commencé à organiser les idées dans un schéma."),
    elementATravailler: String(raw?.elementATravailler || "Précise le lien entre chaque branche et ses preuves."),
    astuceDocumentaire: String(raw?.astuceDocumentaire || "Vérifie le titre, la date et le contenu de chaque document avant de le sélectionner."),
    progressionOperation: String(raw?.progressionOperation || "Tu t’exerces à organiser une preuve historique."),
  };
}

export function getSectionAFormat(question: any): SectionAFormat {
  const explicit = question?.formatReponse || question?.responseType || question?.format;
  const typeAlias = String(question?.type || "").trim().toLowerCase();
  const format = [explicit, typeAlias].map((value) => String(value || "").trim().toLowerCase())
    .find((value) => SECTION_A_FORMATS.includes(value as SectionAFormat));
  if (format) return format as SectionAFormat;
  switch (question?.operationId) {
    case "espace-temps": return format === "qcm" || format === "court" ? format : "classement";
    case "mise-en-relation": return "association-paires";
    case "faits":
    case "causes-consequences": return "court";
    case "liens-causalite": return "causalite-3";
    case "continuite-changement": return "changement-continuite";
    case "comparaisons": return "comparaison";
    default: return "court";
  }
}

export function normaliserQuestionSectionA(question: any): any {
  if (!question || typeof question !== "object") return question;
  const format = getSectionAFormat(question);
  const questionText = String(question.question || question.consigne || "").trim();
  const documentAlias = question.documentTextuel || question.document;
  const documents = Array.isArray(question.documents)
    ? question.documents
    : Array.isArray(documentAlias)
      ? documentAlias
      : documentAlias && typeof documentAlias === "object"
        ? [documentAlias]
        : undefined;
  const criteresCorrection = format === "court" && !question.operationId
    ? [...new Set([
      ...CRITERES_REPONSE_COURTE_PFEQ,
      ...(Array.isArray(question.criteresCorrection) ? question.criteresCorrection : []),
    ].map((critere) => String(critere || "").trim()).filter(Boolean))]
    : question.criteresCorrection;
  return {
    ...question,
    format,
    formatReponse: question.formatReponse || format,
    ...(questionText ? { question: questionText } : {}),
    ...(documents ? { documents } : {}),
    ...(criteresCorrection ? { criteresCorrection } : {}),
  };
}

function documentPedagogiqueComplet(document: any): boolean {
  if (!document || typeof document !== "object"
    || !texteNonVide(document.titre)
    || !texteNonVide(document.typeDoc)
    || !texteNonVide(document.reference)) return false;
  return texteNonVide(document.texte)
    || texteNonVide(document.description)
    || texteNonVide(document.donnees)
    || texteNonVide(document.data)
    || texteNonVide(document.imageUrl)
    || texteNonVide(document.image);
}

const SECTION_A_FORMATS = [
  "qcm",
  "court",
  "classement",
  "association-paires",
  "causalite-3",
  "changement-continuite",
  "comparaison",
] as const;
