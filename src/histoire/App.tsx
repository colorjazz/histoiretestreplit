import React, { useState, useEffect, useRef } from 'react';
import { CONSIGNES_ESPACE_TEMPS, OPERATIONS } from './operations';
import './index.css';
import { auth, chargerResultatsEleve, db } from '../firebase';
import { collection, addDoc, serverTimestamp, getDocs, query, where } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { PERIODES_HISTORIQUES } from './periodes';
import { contextePFEQ, normaliserRattachementPFEQ, trouverRealitePFEQ } from './pfeqReferentiel';
import { chargerCarteHistoriqueLibre, compterDocumentsIconographiques, documentsIconographiquesComplets, enrichirDocumentsAvecVisuels, getFallbackWikimediaImageSource, getWikimediaImageProxySource, getWikimediaImageSource, imageWikimediaAutorisee, resoudrePeriodeId } from './historicalVisuals';
import { appelerFocusTraining, FocusTrainingError } from './focusTrainingClient';
import { ajouterResultatLocal, preparerResultatPourSauvegarde } from './resultPersistence';
import { ecrireResultatSupabase } from '../supabaseResultsClient';
import { enablePushNotifications, getPushAvailability, postponePushPrompt, reportPushActivity, shouldPromptForPush } from './pushNotifications';
import {
  assainirRattachementPFEQSectionA,
  compterMotsReponse,
  CRITERES_REPONSE_COURTE_PFEQ,
  CRITERES_SCHEMA_PFEQ,
  criteresCorrectionSectionCComplets,
  documentEstVisuelPourReponse,
  extraireJSON,
  getSectionAFormat,
  classementChronologiqueValide,
  normaliserConsigneTroisPicots,
  normaliserFeedbackCourte,
  normaliserFeedbackElabore,
  normaliserFeedbackSchema,
  normaliserQuestionSectionA,
  operationIntellectuelleReconnue,
  pointsOperation,
  reponseCEvaluable,
  reponseEstUnSeulMot,
  validerFeedbackOperation,
  validerContenuOperation,
  validerLotSectionA,
  harmoniserDossierOperation,
  validerQuestionB,
  validerQuestionC,
  validerRattachementPFEQ,
  validerSchemaB,
} from './assessmentContracts';
import { AlertCircle, ArrowLeft, BarChart3, Bell, BookOpen, Check, CheckCircle2, ExternalLink, Flag, LayoutGrid, Link2, LoaderCircle, LogOut, Moon, Pause, PenLine, Play, RotateCcw, Send, Sparkles, Sun, Timer, UserRound } from 'lucide-react';

const CONSIGNE_SCHEMA_CONCEPTUEL = "Complétez les liens entre les réalités historiques à l’aide des documents pertinents.";
const CONSIGNE_REPONSE_VIDE = "Veuillez inscrire une réponse avant de lancer corrige.moi : corrige.moi ne peut corriger que ce qui est écrit.";
const CONSIGNE_ORTHOGRAPHE_NOMS = "VÉRIFICATION DES NOMS PROPRES : écris correctement tous les noms de personnes, peuples, nations, lieux, institutions, événements et titres. Vérifie l’orthographe, les accents, les apostrophes et les traits d’union; n’invente jamais une variante d’un nom historique.";

// --- Constantes PFEQ ---
const PLAN_INITIAL_C = {
  ideePrincipale: "",
  element1: "",
  faits1: "",
  documents1: "",
  element2: "",
  faits2: "",
  documents2: "",
  effetIndustriel: "",
  causeEffetIndustriel: "",
  actionGouvernementale: "",
  causeActionGouvernementale: "",
  notes: "",
  angleDescription: "",
  these: "",
  nuance: ""
};

const SECTION_A_GENERATION_STORAGE_KEY = "corrige-histoire-section-a-generation";

type DossierOperationB = {
  operation: any;
  question: any | null;
  error?: string;
};

function contratOperationPourPrompt(operation: any): string {
  const base = `operationId="${operation.id}"; modèles de questions=${JSON.stringify(operation.formesQuestions || [])}; formes de réponses=${JSON.stringify(operation.formesReponses || [])}; consigne élève obligatoire=${JSON.stringify(operation.consigneType || "")}; forme de réponse attendue=${JSON.stringify(operation.formatAttendu || "")}; grille d’évaluation=${JSON.stringify(operation.grilleEvaluation || [])}; barème obligatoire=${JSON.stringify(operation.bareme || {})}; critères=${JSON.stringify(operation.criteresObligatoires || [])}; marqueurs autorisés=${JSON.stringify(operation.marqueursRecommandes || [])}`;
  switch (operation.id) {
    case "faits":
      return `${base}. Champs internes obligatoires: "categorieFait" parmi acteur, groupe, institution, gouvernement, action, mesure, loi, rôle, territoire, activité économique, mouvement de pensée, phénomène historique; "nombreFaitsDemandes" vaut 1 ou 2; "aspectSociete" est facultatif et, s'il est présent, vaut politique, économique, social, culturel ou territorial; "faitAttendu" contient le fait précis soutenu par le document si un seul fait est demandé; "faitsAttendus" contient exactement deux faits distincts si deux faits sont demandés.`;
    case "espace-temps":
      return `${base}. Champs obligatoires: "dimension" égale à "temps" ou "espace"; "repereAttendu" contient le repère précis à établir sans être révélé dans la consigne. "marqueursRelationAttendus" doit contenir au moins un marqueur autorisé correspondant à cette dimension.`;
    case "causes-consequences":
      return `${base}. Champs obligatoires: "relationDemandee" égale à "cause" ou "conséquence"; "aspectSociete" est facultatif et, s'il est présent, vaut politique, économique, social, culturel ou territorial; "evenementCible" nomme le point de départ; "elementAttendu" formule la cause ou conséquence avec un marqueur autorisé; "marqueursRelationAttendus" contient au moins un marqueur du type demandé.`;
    case "mise-en-relation":
      return `${base}. Définition RÉCIT obligatoire: associer, dans une même réalité historique, des faits généraux à des manifestations ou à des descriptions concrètes qui leur sont apparentées. Format obligatoire: "association-paires". "realiteCommune" nomme le thème historique unique travaillé. Génère deux ou trois documents textuels distincts et le même nombre de faits dans "faitsRelier". Tous les faits doivent éclairer "realiteCommune"; n'assemble jamais des événements indépendants. Formule chaque fait au niveau général. Chaque document doit fournir une manifestation concrète et distinctive de ce fait au moyen d'un acteur, d'une action, d'une mesure, d'un lieu, d'une date ou d'un résultat observable. Un document ne doit pas paraphraser le fait ni en reprendre les mots distinctifs. Mélange l’ordre des faits indépendamment de celui des documents. "associationsAttendues" contient une permutation des indices de documents où chaque position indique le document apparenté au fait de même position. "constatAttendu" explique le thème commun sans causalité. "propositions" recopie uniquement les chaînes de "faitsRelier"; les documents restent uniquement dans "documents". N’emploie aucun marqueur causal comme « parce que », « donc », « entraîne » ou « par conséquent ».`;
    case "liens-causalite":
      return `${base}. Champs obligatoires: "etapes" contient exactement trois expressions distinctes A, B et C; "liensAttendus" contient exactement deux phrases internes, une pour A vers B et une pour B vers C, chacune avec un marqueur autorisé; "marqueursRelationAttendus" avec au moins un marqueur autorisé.`;
    case "comparaisons":
      return `${base}. Champs obligatoires: "acteursComparer" contient exactement trois acteurs ou historiens distincts; "enjeuCommun" nomme l’enjeu partagé; "acteurDissident" reprend exactement l’un des trois acteurs; "positionDissidenteAttendue" explique sa position avec un marqueur de différence; "positionCommuneAttendue" explique la position des deux autres avec un marqueur de similitude; "marqueursRelationAttendus" contient au moins un marqueur de chaque type.`;
    case "continuite-changement":
      return `${base}. Champs obligatoires: "realiteComparee" non vide; "moments" contient exactement deux moments; "changementAttendu" contient un marqueur de changement; "continuiteAttendue" contient un marqueur de continuité; "marqueursRelationAttendus" contient au moins un marqueur de chaque type.`;
    default:
      return base;
  }
}

function normaliserAssociationPairesSectionA(question: any): any {
  if (!question || typeof question !== "object"
    || (question.operationId !== "mise-en-relation" && getSectionAFormat(question) !== "association-paires")) {
    return question;
  }
  const documentsDeclares = Array.isArray(question.documents) ? question.documents : [];
  const documentsDansPropositions = Array.isArray(question.propositions)
    && question.propositions.length > 0
    && question.propositions.every((item: any) => item && typeof item === "object" && !Array.isArray(item))
    ? question.propositions
    : [];
  const documents = documentsDeclares.length > 0 ? documentsDeclares : documentsDansPropositions;
  const candidats = [question.faitsRelier, question.elementsRelier, question.propositions, question.relations]
    .filter((items) => Array.isArray(items)
      && items.every((item: any) => typeof item === "string" || typeof item === "number"))
    .map((items: any[]) => items.map(String).map((item) => item.trim()).filter(Boolean));
  const propositions = candidats.find((items: string[]) => items.length === documents.length)
    || candidats.find((items: string[]) => items.length > 0)
    || [];
  const associationsBrutes = [
    question.associationsAttendues,
    question.associationsCorrectes,
    question.correspondances,
  ].find((associations) => Array.isArray(associations) && associations.length > 0) || [];
  return {
    ...question,
    documents,
    propositions,
    faitsRelier: propositions,
    associationsAttendues: Array.isArray(associationsBrutes)
      ? associationsBrutes.map(Number)
      : [],
  };
}

function documentSectionAComplet(document: any): boolean {
  return Boolean(document && typeof document === "object"
    && String(document.titre || "").trim()
    && String(document.typeDoc || "").trim()
    && String(document.reference || "").trim()
    && (String(document.texte || "").trim()
      || String(document.description || "").trim()
      || String(document.donnees || "").trim()
      || String(document.data || "").trim()
      || String(document.imageUrl || "").trim()
      || String(document.image || "").trim()));
}

function contratsOperationsPourPrompt(): string {
  return OPERATIONS.map((operation) => `- ${contratOperationPourPrompt(operation)}`).join("\n");
}

async function mapAvecConcurrenceLimitee<T, U>(
  elements: T[],
  traiter: (element: T, index: number) => Promise<U>,
  concurrence = 2,
): Promise<U[]> {
  const resultats = new Array<U>(elements.length);
  let prochainIndex = 0;

  async function travailleur() {
    while (true) {
      const index = prochainIndex;
      prochainIndex += 1;
      if (index >= elements.length) return;
      resultats[index] = await traiter(elements[index], index);
    }
  }

  const nombreTravailleurs = Math.min(Math.max(1, concurrence), elements.length);
  await Promise.all(Array.from({ length: nombreTravailleurs }, () => travailleur()));
  return resultats;
}

function formatDocumentLabel(index: number) {
  let cursor = index + 1;
  let letters = "";
  while (cursor > 0) {
    cursor -= 1;
    letters = String.fromCharCode(65 + (cursor % 26)) + letters;
    cursor = Math.floor(cursor / 26);
  }
  return `Document ${letters}`;
}

function melangerDocuments<T>(documents: T[]): T[] {
  const resultat = [...documents];
  for (let index = resultat.length - 1; index > 0; index -= 1) {
    const position = Math.floor(Math.random() * (index + 1));
    [resultat[index], resultat[position]] = [resultat[position], resultat[index]];
  }
  return resultat;
}

function normaliserBranchesSchema(branches: any): any {
  if (!Array.isArray(branches) || branches.length !== 6) return branches;
  const principales = branches.filter((branch) => Number(branch?.niveau) === 1 || branch?.parentId === null || branch?.parentId === undefined || branch?.parentId === "");
  const secondaires = branches.filter((branch) => !principales.includes(branch));
  if (principales.length !== 2 || secondaires.length !== 4) return branches;

  const groupes = principales.map((principal, principalIndex) => {
    const enfantsExplicites = secondaires.filter((branch) => Number(branch?.parentId) === Number(principal?.id));
    return enfantsExplicites.length === 2
      ? enfantsExplicites
      : secondaires.slice(principalIndex * 2, principalIndex * 2 + 2);
  });
  if (groupes.some((groupe) => groupe.length !== 2) || new Set(groupes.flat()).size !== 4) return branches;

  return [
    { ...principales[0], id: 1, niveau: 1, parentId: null },
    { ...principales[1], id: 2, niveau: 1, parentId: null },
    ...groupes[0].map((branch, index) => ({ ...branch, id: index + 3, niveau: 2, parentId: 1 })),
    ...groupes[1].map((branch, index) => ({ ...branch, id: index + 5, niveau: 2, parentId: 2 })),
  ];
}

function nettoyerNomNoeudSchema(value: unknown, fallback: string): string {
  const nettoye = String(value || "")
    .replace(/\bvolet\s*[12]\b\s*[:\-–—]?\s*/gi, "")
    .replace(/\b(?:moyens?\s*1A|objectif\s*1B|moyen\s*2A|objectif\s*2B)\b\s*[:\-–—]?\s*/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return nettoye || fallback;
}

function nettoyerBranchesSchema(branches: any): any {
  if (!Array.isArray(branches)) return branches;
  return branches.map((branch: any, index: number) => {
    const niveau = Number(branch?.niveau) === 2 ? 2 : 1;
    const id = Number(branch?.id || index + 1);
    return {
      ...branch,
      nom: nettoyerNomNoeudSchema(branch?.nom || branch?.element, niveau === 1 ? `Branche principale ${id}` : `Sous-boîte ${id}`),
    };
  });
}

function getDocumentDescription(document: any) {
  const description = [
    document.description,
    document.descriptionImage,
    document.imageDescription,
    document.legende,
    document.texte,
    document.imageAlt,
  ].find((value) => typeof value === "string" && value.trim());
  if (description) return description.trim();
  const titre = String(document.titre || "ce document").trim();
  return `Représentation historique : ${titre}.`;
}

function normaliserTitrePortrait(value: unknown): string {
  const titre = String(value || "Document sans titre");
  return titre.replace(/^Portrait\s+(?:individuel\s+)?de\b/i, "Portrait officiel de");
}

function formatReferenceUniversitaire(document: any): string {
  const auteur = String(document.auteur || "Anonyme").replace(/\s+/g, " ").trim();
  const date = String(document.annee || "s. d.").replace(/\s+/g, " ").trim();
  const titre = normaliserTitrePortrait(document.titre);
  const type = String(document.typeDoc || document.type || "Document").replace(/\s+/g, " ").trim();
  const source = String(document.reference || "").replace(/^(?:Auteur|Date|Année|Source)\s*:\s*/i, "").trim();
  const url = String(document.url || document.imageUrl || "").trim();
  const citation = `${auteur}. (${date}). ${titre} [${type}].`;
  const avecSource = source && !citation.includes(source) ? `${citation} ${source}.` : citation;
  return url && !avecSource.includes(url) ? `${avecSource} ${url}` : avecSource;
}

function normaliserNomPFEQ(value: unknown): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
    .replace(/['’]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function alignerBranchesSchemaPFEQ(branches: any, realite: any): any {
  if (!Array.isArray(branches) || !realite) return nettoyerBranchesSchema(branches);
  const concepts = Array.isArray(realite.concepts) ? realite.concepts : [];
  const rubriques = Array.isArray(realite.rubriques) ? realite.rubriques : [];
  const connaissances = Array.isArray(realite.connaissances) ? realite.connaissances : [];
  const tousLesLibelles = [...concepts, ...rubriques, ...connaissances];
  return branches.map((branch: any, index: number) => {
    const niveau = Number(branch?.niveau) === 2 ? 2 : 1;
    const source = String(branch?.nom || branch?.element || "").trim();
    const normalise = normaliserNomPFEQ(source);
    const exact = tousLesLibelles.find((libelle) => normaliserNomPFEQ(libelle) === normalise);
    const inclus = tousLesLibelles.find((libelle) => normalise.length > 4
      && (normalise.includes(normaliserNomPFEQ(libelle)) || normaliserNomPFEQ(libelle).includes(normalise)));
    const pool = niveau === 1 ? concepts : [...rubriques, ...connaissances];
    const nom = exact || inclus || pool[index % Math.max(pool.length, 1)] || source || `Élément ${index + 1}`;
    return { ...branch, nom };
  });
}

function getStatRows(document: any): Record<string, string>[] {
  const direct = document.donnees || document.data || document.valeurs;
  if (Array.isArray(direct)) return direct.filter((row) => row && typeof row === "object");
  if (typeof direct === "object" && direct) {
    return Object.entries(direct).map(([categorie, valeur]) => ({ categorie, valeur: String(valeur) }));
  }
  if (typeof document.texte === "string") {
    try {
      const parsed = JSON.parse(document.texte);
      if (Array.isArray(parsed)) return parsed.filter((row) => row && typeof row === "object");
    } catch {
      // Le texte reste affiché comme une source lorsque ce n'est pas du JSON.
    }
    const lignes = document.texte.split(/\r?\n/).map((line: string) => line.split(/\s*[;|]\s*/).map((cell: string) => cell.trim()).filter(Boolean)).filter((cells: string[]) => cells.length >= 2);
    if (lignes.length >= 2) {
      const headers = lignes[0];
      return lignes.slice(1).map((cells: string[]) => headers.reduce((row: Record<string, string>, header: string, index: number) => ({ ...row, [header || `Colonne ${index + 1}`]: cells[index] || "" }), {}));
    }
    const lignesEtiquetees = document.texte
      .split(/\r?\n/)
      .map((line: string) => line.trim())
      .map((line: string) => line.match(/^[-•]\s*(.+?)\s*:\s*(.+?)\s*$/))
      .filter((match: RegExpMatchArray | null): match is RegExpMatchArray => Boolean(match && /\d/.test(match[2])));
    if (lignesEtiquetees.length >= 2) {
      return lignesEtiquetees.map((match: RegExpMatchArray) => ({ Variable: match[1].trim(), Valeur: match[2].trim() }));
    }
  }
  return [];
}

function DocumentImage({ source, fallbackSource, alt, description }: { source?: string; fallbackSource?: string; alt: string; description: string }) {
  const proxySource = source ? getWikimediaImageProxySource(source) : undefined;
  const fallbackProxySource = fallbackSource ? getWikimediaImageProxySource(fallbackSource) : undefined;
  const sources = [proxySource, source, fallbackProxySource, fallbackSource].filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index);
  const [sourceIndex, setSourceIndex] = useState(0);
  useEffect(() => {
    setSourceIndex(0);
  }, [source, fallbackSource]);

  const sourceCourante = sources[sourceIndex];
  if (!sourceCourante) {
    return <div className="document-visual-fallback" role="img" aria-label={alt}><span>Représentation historique</span><strong>{alt}</strong><p>{description}</p></div>;
  }
  return <img src={sourceCourante} alt={alt} onError={() => {
    if (sourceIndex + 1 < sources.length) {
      setSourceIndex((index) => index + 1);
      return;
    }
    console.error("Erreur chargement image documentaire", { source, alt });
    setSourceIndex(sources.length);
  }} />;
}

function DocumentNotesEditor({ document, index, value, onChange }: { document: any; index: number; value: string; onChange: (value: string) => void }) {
  return (
    <div className="document-note-editor">
      <label htmlFor={`document-note-${index}`}>
        <strong>Notes sur {formatDocumentLabel(index)}</strong>
        <span>Repère un fait, une preuve, un lien ou une idée de plan.</span>
      </label>
      <textarea
        id={`document-note-${index}`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={`Tes notes sur « ${document.titre || formatDocumentLabel(index)} »…`}
        aria-label={`Notes sur ${formatDocumentLabel(index)} — ${document.titre || "sans titre"}`}
      />
    </div>
  );
}

function NotesDocumentsPanel({ documents, notes, setNotes, accent = "var(--accent)", collapsible = false }: { documents: any[]; notes: Record<number, string>; setNotes: (updater: any) => void; accent?: string; collapsible?: boolean }) {
  const [ouvert, setOuvert] = useState(!collapsible);
  const [notesOuvertes, setNotesOuvertes] = useState<Record<number, boolean>>({});
  return (
    <section className={`document-notes-panel ${collapsible ? "document-notes-panel--collapsible" : ""}`} aria-label="Notes prises sur les documents">
      <div className="document-notes-heading">
        <div>
          <strong style={{ color: accent }}>Notes de documents</strong>
          <span>Ces notes servent à préparer ton plan et ta réponse.</span>
        </div>
        {collapsible && (
          <button type="button" className="document-notes-toggle" onClick={() => setOuvert((value) => !value)} aria-expanded={ouvert}>
            {ouvert ? "Réduire les notes" : "Ouvrir les notes"}
          </button>
        )}
      </div>
      {ouvert && (
        <>
          <div className="document-notes-row document-notes-row--header" aria-hidden="true">
            <span>Document</span>
            <span>Notes de lecture</span>
          </div>
          {documents.map((document, index) => (
            <div className={`document-notes-row ${(notesOuvertes[index] ?? true) ? "" : "is-collapsed"}`} key={index}>
              <span>
                <span className="document-note-title">
                  <strong>{formatDocumentLabel(index)}</strong>
                  <button
                    type="button"
                    className="document-note-toggle"
                    onClick={() => setNotesOuvertes((previous) => ({ ...previous, [index]: !(previous[index] ?? true) }))}
                    aria-expanded={notesOuvertes[index] ?? true}
                  >
                    {(notesOuvertes[index] ?? true) ? "Réduire" : "Afficher"}
                  </button>
                </span>
                {(notesOuvertes[index] ?? true) && <small>{document.titre || "Document sans titre"}</small>}
              </span>
              {(notesOuvertes[index] ?? true) && (
                <textarea
                  value={notes[index] || ""}
                  onChange={(event) => setNotes((previous: Record<number, string>) => ({ ...previous, [index]: event.target.value }))}
                  placeholder="Les notes saisies sous ce document apparaîtront ici."
                  aria-label={`Notes du tableau pour ${formatDocumentLabel(index)} — ${document.titre || "sans titre"}`}
                />
              )}
            </div>
          ))}
        </>
      )}
    </section>
  );
}

function DocumentCard({ document, index, accent = "var(--accent)", note, onNoteChange, referenceUniversitaire = false }: { document: any; index: number; accent?: string; note?: string; onNoteChange?: (value: string) => void; referenceUniversitaire?: boolean }) {
  const imageSource = getWikimediaImageSource(document);
  const fallbackImageSource = getFallbackWikimediaImageSource(Number(document.periodeId) || 1);
  const type = document.typeDoc || document.type || "Document";
  const typeLower = type.toLowerCase();
  const isStatistique = typeLower.includes("stat");
   const isIconographique = ["icon", "image", "photo", "affich", "portrait", "carte", "graph", "visuel"]
     .some((motif) => typeLower.includes(motif)) || Boolean(imageSource);
  const statRows = isStatistique ? getStatRows(document) : [];
  const description = getDocumentDescription(document);

  return (
    <article className="piece document-card" style={{ borderLeftColor: accent }}>
      <div className="document-card-heading">
        <span className="tag" style={{ color: accent }}>{formatDocumentLabel(index)}</span>
        <strong>{typographieFrancaise(normaliserTitrePortrait(document.titre))}</strong>
      </div>
      {isStatistique && statRows.length > 0 ? (
        <div className="document-statistics" aria-label={`Données statistiques de ${document.titre || formatDocumentLabel(index)}`}>
          <table>
            <thead><tr>{Object.keys(statRows[0]).map((key) => <th key={key}>{key}</th>)}</tr></thead>
            <tbody>{statRows.map((row, rowIndex) => <tr key={rowIndex}>{Object.keys(statRows[0]).map((key) => <td key={key}>{String(row[key] ?? "")}</td>)}</tr>)}</tbody>
          </table>
          <div className="stat-bars" aria-label="Représentation visuelle des valeurs">
            {statRows.slice(0, 8).map((row, rowIndex) => {
              const values = Object.values(row).map((value) => Number(String(value).replace(",", "."))).filter((value) => Number.isFinite(value));
              const value = values.at(-1) || 0;
              const max = Math.max(...statRows.map((item) => {
                const itemValue = Object.values(item).map((itemField) => Number(String(itemField).replace(",", "."))).filter((itemField) => Number.isFinite(itemField)).at(-1);
                return itemValue || 0;
              }), 1);
              return <div className="stat-bar-row" key={rowIndex}><span>{String(Object.values(row)[0] || `Valeur ${rowIndex + 1}`)}</span><div><i style={{ width: `${Math.max(4, (value / max) * 100)}%`, backgroundColor: accent }} /></div><b>{values.at(-1) ?? "—"}</b></div>;
            })}
          </div>
        </div>
      ) : isIconographique ? (
        <figure className="document-figure">
          <DocumentImage source={imageSource} fallbackSource={fallbackImageSource} alt={document.imageAlt || document.legende || document.titre || "Document iconographique"} description={description} />
          <figcaption>{typographieFrancaise(description)}</figcaption>
        </figure>
      ) : (
        <p>{typographieFrancaise(document.texte || description)}</p>
      )}
      {referenceUniversitaire ? (
        <div className="document-reference document-metadata--after">
          <b>Source :</b> {formatReferenceUniversitaire(document)}
           {document.imageLicense && <span className="document-reference-license"> {typographieFrancaise(document.imageLicense)}.</span>}
        </div>
      ) : (document.auteur || document.annee || document.reference || document.imageLicense) && (
        <div className="document-metadata document-metadata--after">
           {document.auteur && <span><b>Auteur :</b> {typographieFrancaise(document.auteur)}</span>}
          {document.annee && <span><b>Année :</b> {document.annee}</span>}
           {document.reference && <span><b>Source :</b> {typographieFrancaise(document.reference)}</span>}
           {document.imageLicense && <span><b>Licence :</b> {typographieFrancaise(document.imageLicense)}</span>}
        </div>
      )}
      <BoutonLecture texte={document.texte || description} />
      {onNoteChange && (
        <DocumentNotesEditor
          document={document}
          index={index}
          value={note || ""}
          onChange={onNoteChange}
        />
      )}
    </article>
  );
}

function getSchemaSubnodes(branch: any, allBranches: any[] = []) {
  const declaredChildren = [
    ...(Array.isArray(branch.sousBranches) ? branch.sousBranches : []),
    ...(Array.isArray(branch.sousNoeuds) ? branch.sousNoeuds : []),
    ...(Array.isArray(branch.subBranches) ? branch.subBranches : [])
  ];
  const linkedChildren = allBranches
    .filter((candidate) => Number(candidate.parentId) === Number(branch.id))
    .sort((a, b) => Number(a.id || 0) - Number(b.id || 0));
  if (linkedChildren.length > 0) return linkedChildren.slice(0, 2);
  if (declaredChildren.length > 0) return declaredChildren.slice(0, 2);

  const name = `${branch.nom || ""} ${branch.element || ""}`.toLowerCase();
  if (name.includes("économ") || name.includes("econom")) {
    return [
      { id: "ideologie", nom: "Idéologie économique", placeholder: "Nomme l’orientation économique du gouvernement…" },
      { id: "secteur", nom: "Secteur de développement", placeholder: "Indique le secteur privilégié…" }
    ];
  }
  if (name.includes("politi")) {
    return [
      { id: "principe", nom: "Principe défendu", placeholder: "Nomme le principe politique défendu…" },
      { id: "mesure-fiscale", nom: "Mesure fiscale", placeholder: "Indique la mesure fiscale adoptée ou revendiquée…" }
    ];
  }
  return [];
}

function contientRepereTemporel(value: string) {
  return /\b(?:1[0-9]{3}|20[0-9]{2}|années?\s+\d{2,4}|siècle|décennie|avant|après)\b/i.test(value);
}

function melangerIndicesChronologiques(elements: any[]): number[] {
  const indices = elements.map((_, index) => index);
  let graine = elements.reduce((total, element, index) => {
    const texte = typeof element === "string"
      ? element
      : element?.label || element?.texte || element?.titre || element?.annee || element?.ordre || "";
    return (total + String(texte).split("").reduce((somme, caractere) => somme + caractere.charCodeAt(0), 0) * (index + 1)) >>> 0;
  }, 2166136261);

  for (let index = indices.length - 1; index > 0; index -= 1) {
    graine = (graine * 1664525 + 1013904223) >>> 0;
    const cible = graine % (index + 1);
    [indices[index], indices[cible]] = [indices[cible], indices[index]];
  }

  if (indices.every((value, index) => value === index) && indices.length > 1) {
    [indices[0], indices[1]] = [indices[1], indices[0]];
  }
  return indices;
}

// ------------------------------------------
// COMPOSANTS D'AIDE ET D'AFFICHAGE
// ------------------------------------------

function SituerDansLeTemps({
  questionB, placementOrdre, setPlacementOrdre, placementAvantApres,
  setPlacementAvantApres, selectedDocIndex, setSelectedDocIndex
}: any) {
  const documents: any[] = questionB.documents || [];
  const slotRefs = useRef<Array<HTMLDivElement | null>>([]);
  const focusSlotAfterUpdateRef = useRef<number | null>(null);
  const [selectedOriginSlotIndex, setSelectedOriginSlotIndex] = useState<number | null>(null);

  const toggleSelect = (i: number) => {
    setSelectedOriginSlotIndex(null);
    setSelectedDocIndex((prev: number | null) => (prev === i ? null : i));
  };

  const pickUpFromSlot = (slotIndex: number) => {
    const occupant = placementOrdre[slotIndex];
    if (occupant === null || occupant === undefined) return;
    focusSlotAfterUpdateRef.current = slotIndex;
    setPlacementOrdre((prev: (number | null)[]) => {
      const next = [...prev]; next[slotIndex] = null; return next;
    });
    setSelectedOriginSlotIndex(slotIndex);
    setSelectedDocIndex(occupant);
  };

  const placeInSlot = (slotIndex: number) => {
    if (selectedDocIndex === null) return;
    focusSlotAfterUpdateRef.current = slotIndex;
    setPlacementOrdre((prev: (number | null)[]) => {
      const next = [...prev];
      const displaced = next[slotIndex];
      for (let i = 0; i < next.length; i++) {
        if (next[i] === selectedDocIndex) next[i] = null;
      }
      next[slotIndex] = selectedDocIndex;
      if (
        displaced !== null
        && displaced !== undefined
        && displaced !== selectedDocIndex
        && selectedOriginSlotIndex !== null
        && selectedOriginSlotIndex !== slotIndex
      ) {
        next[selectedOriginSlotIndex] = displaced;
      }
      return next;
    });
    setSelectedOriginSlotIndex(null);
    setSelectedDocIndex(null);
  };

  useEffect(() => {
    const slotIndex = focusSlotAfterUpdateRef.current;
    if (slotIndex === null) return;
    focusSlotAfterUpdateRef.current = null;
    slotRefs.current[slotIndex]?.focus();
  }, [placementOrdre, selectedDocIndex]);

  const pickFromZone = (i: number) => {
    setPlacementAvantApres((prev: Record<number, 'avant' | 'apres'>) => {
      const next = { ...prev }; delete next[i]; return next;
    });
    setSelectedDocIndex(i);
  };

  const placeInZone = (zone: 'avant' | 'apres') => {
    if (selectedDocIndex === null) return;
    setPlacementAvantApres((prev: Record<number, 'avant' | 'apres'>) => ({ ...prev, [selectedDocIndex]: zone }));
    setSelectedDocIndex(null);
  };

  const selectedDocumentLabel = selectedDocIndex === null
    ? "le document sélectionné"
    : `le ${formatDocumentLabel(selectedDocIndex)} sélectionné`;

  const Chip = ({ i, onPick }: { i: number; onPick?: () => void }) => (
    <button type="button" className={`doc-chip ${selectedDocIndex === i ? 'selected' : ''}`}
      onClick={(e) => { if (onPick) { e.stopPropagation(); onPick(); } else { toggleSelect(i); } }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          event.stopPropagation();
          if (onPick) onPick();
          else toggleSelect(i);
        }
      }}
      title={documents[i]?.titre}
      aria-label={`${selectedDocIndex === i ? "Désélectionner" : "Sélectionner"} le ${formatDocumentLabel(i)}${documents[i]?.titre ? ` — ${documents[i].titre}` : ""}`}
      aria-pressed={selectedDocIndex === i}
    >
      {formatDocumentLabel(i).replace("Document ", "")}
    </button>
  );

  return (
    <div className="situer-temps-wrap">
      {selectedDocIndex !== null && (
        <div className="selection-hint" role="status" aria-live="polite" aria-atomic="true">
          {formatDocumentLabel(selectedDocIndex)} sélectionné – touche une case ci-dessous pour le déposer.
        </div>
      )}

      {questionB.sousType === 'ordre' ? (
        <>
          <div className="doc-pool">
            {documents.map((_, i) => !placementOrdre.includes(i) && <Chip key={i} i={i} />)}
            {documents.every((_, i) => placementOrdre.includes(i)) && <span className="doc-pool-empty">Tous les documents sont placés.</span>}
          </div>
          <div className="frise-slot-row">
            {placementOrdre.map((docIdx: number | null, slotIndex: number) => (
              <div
                key={slotIndex}
                ref={(element) => { slotRefs.current[slotIndex] = element; }}
                className={`frise-slot ${selectedDocIndex !== null && docIdx === null ? 'droppable' : ''}`}
                role="button"
                tabIndex={0}
                aria-label={`Position chronologique ${slotIndex + 1} — ${docIdx !== null ? `${formatDocumentLabel(docIdx)} placé` : selectedDocIndex !== null ? `Déposer ${selectedDocumentLabel} ici` : 'vide'}`}
                onClick={() => placeInSlot(slotIndex)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    placeInSlot(slotIndex);
                  }
                }}
              >
                <span className="frise-slot-rank">Position {slotIndex + 1}</span>
                {docIdx !== null ? <Chip i={docIdx} onPick={() => pickUpFromSlot(slotIndex)} /> : <span className="frise-slot-empty">{selectedDocIndex !== null ? 'Déposer ici' : ' '}</span>}
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="reference-evenement"><span className="tag">Événement de référence</span><p>{questionB.referenceEvenement}</p></div>
          <div className="avant-apres-zones">
            <div
              className={`zone ${selectedDocIndex !== null ? 'droppable' : ''}`}
              role="button"
              tabIndex={0}
              aria-label={`Déposer ${selectedDocumentLabel} avant l’événement de référence`}
              onClick={() => placeInZone('avant')}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  placeInZone('avant');
                }
              }}
            >
              <div className="zone-label">Avant</div>
              <div className="zone-chips">{documents.map((_, i) => placementAvantApres[i] === 'avant' && <Chip key={i} i={i} onPick={() => pickFromZone(i)} />)}</div>
            </div>
            <div
              className={`zone ${selectedDocIndex !== null ? 'droppable' : ''}`}
              role="button"
              tabIndex={0}
              aria-label={`Déposer ${selectedDocumentLabel} après l’événement de référence`}
              onClick={() => placeInZone('apres')}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  placeInZone('apres');
                }
              }}
            >
              <div className="zone-label">Après</div>
              <div className="zone-chips">{documents.map((_, i) => placementAvantApres[i] === 'apres' && <Chip key={i} i={i} onPick={() => pickFromZone(i)} />)}</div>
            </div>
          </div>
          <div className="doc-pool">
            {documents.map((_, i) => placementAvantApres[i] === undefined && <Chip key={i} i={i} />)}
            {documents.every((_, i) => placementAvantApres[i] !== undefined) && <span className="doc-pool-empty">Tous les documents sont placés.</span>}
          </div>
        </>
      )}

       <div className="temps-docs-list">
         {documents.map((d, i) => <DocumentCard key={i} document={d} index={i} accent="var(--card-teal)" />)}
      </div>
    </div>
  );
}

function ClassementChronologiqueInteractif({
  elements, ordre, setOrdre
}: {
  elements: any[];
  ordre: number[];
  setOrdre: (updater: any) => void;
}) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [annonce, setAnnonce] = useState("");
  const deplacer = (from: number, to: number) => {
    if (to < 0 || to >= ordre.length || from === to) return;
    const elementIndex = ordre[from];
    const element = elements[elementIndex];
    const texte = typeof element === "string"
      ? element
      : element?.texte || element?.label || element?.titre || element?.annee || element?.ordre || `Élément ${elementIndex + 1}`;
    setOrdre((precedent: number[]) => {
      const prochain = [...precedent];
      const [element] = prochain.splice(from, 1);
      prochain.splice(to, 0, element);
      return prochain;
    });
    setAnnonce(`${texte} déplacé à la position ${to + 1} sur ${ordre.length}.`);
  };

  return (
    <section className="chronology-sorter" aria-label="Classement chronologique réorganisable">
      <div className="chronology-sorter-heading">
        <strong>Replace les éléments dans le temps</strong>
        <span>Appuie sur les flèches pour placer les éléments dans le temps.</span>
      </div>
      <ol className="chronology-sorter-list">
        {ordre.map((elementIndex, position) => {
          const element = elements[elementIndex];
          const texte = typeof element === "string"
            ? element
            : element?.texte || element?.label || element?.titre || element?.annee || element?.ordre || `Élément ${elementIndex + 1}`;
          return (
            <li
              key={`${elementIndex}-${position}`}
              className="chronology-sorter-item"
             aria-label={`Élément actif ${texte} — position ${position + 1} sur ${ordre.length}`}
              draggable
              onDragStart={() => setDraggedIndex(position)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (draggedIndex !== null) deplacer(draggedIndex, position);
                setDraggedIndex(null);
              }}
              onDragEnd={() => setDraggedIndex(null)}
            >
              <span className="chronology-sorter-rank">{position + 1}</span>
              <span className="chronology-sorter-text">{texte}</span>
              <button type="button" onClick={() => deplacer(position, position - 1)} disabled={position === 0} aria-label={`Monter ${texte} — position ${position + 1} sur ${ordre.length}`}>↑</button>
              <button type="button" onClick={() => deplacer(position, position + 1)} disabled={position === ordre.length - 1} aria-label={`Descendre ${texte} — position ${position + 1} sur ${ordre.length}`}>↓</button>
            </li>
          );
        })}
      </ol>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{annonce}</div>
    </section>
  );
}

function ContinuiteChangementInteractif({ question, value, onChange }: { question: any; value: string; onChange: (value: string) => void }) {
  let reponse: Record<string, string> = {};
  try { reponse = value ? JSON.parse(value) : {}; } catch { reponse = {}; }
  const update = (champ: string, contenu: string) => onChange(JSON.stringify({ ...reponse, [champ]: contenu }));
  const moments = Array.isArray(question?.moments) ? question.moments : [];
  const moment1 = moments[0] || question?.moment1 || "Premier moment historique";
  const moment2 = moments[1] || question?.moment2 || "Deuxième moment historique";

  return (
    <section className="evolution-board" aria-label="Organigramme de continuité et de changement">
      <div className="evolution-moments">
        <label className="evolution-card">
          <span className="evolution-step">01</span>
          <strong>{moment1}</strong>
          <textarea value={reponse.moment1 || ""} onChange={(event) => update("moment1", event.target.value)} placeholder="Décris la situation à ce moment…" />
        </label>
        <div className="evolution-arrow" aria-hidden="true">→</div>
        <label className="evolution-card">
          <span className="evolution-step">02</span>
          <strong>{moment2}</strong>
          <textarea value={reponse.moment2 || ""} onChange={(event) => update("moment2", event.target.value)} placeholder="Décris la situation au second moment…" />
        </label>
      </div>
      <div className="evolution-outcomes">
        <label className="evolution-outcome evolution-outcome--change"><strong>Ce qui change</strong><textarea value={reponse.changement || ""} onChange={(event) => update("changement", event.target.value)} placeholder="Un élément de changement est…" /></label>
        <label className="evolution-outcome evolution-outcome--continuity"><strong>Ce qui demeure</strong><textarea value={reponse.continuite || ""} onChange={(event) => update("continuite", event.target.value)} placeholder="Un élément de continuité est…" /></label>
      </div>
      <label className="evolution-proof"><strong>Preuves tirées des documents</strong><textarea value={reponse.preuves || ""} onChange={(event) => update("preuves", event.target.value)} placeholder="Nomme les documents et explique les indices utilisés…" /></label>
    </section>
  );
}

function SchemaConceptuel({
  question, selections, setSelections, reponses, setReponses, centralResponse, setCentralResponse,
  sousReponses, setSousReponses, notes, setNotes
}: any) {
  const documents: any[] = question.documents || [];
  const allBranches: any[] = question.branches || [];
  const candidatesPrincipales = allBranches.filter((branch) => branch.parentId === null || branch.parentId === undefined || Number(branch.niveau) === 1);
  const branches: any[] = (candidatesPrincipales.length > 0 ? candidatesPrincipales : allBranches)
    .slice()
    .sort((a, b) => Number(a.id || 0) - Number(b.id || 0))
    .slice(0, 2);
  const [expandedNode, setExpandedNode] = useState<string | null>(null);

  const toggleDocument = (nodeId: string | number, documentIndex: number) => {
    setSelections((prev: Record<string, number[]>) => {
      const key = String(nodeId);
      const actuels = prev[key] || [];
      const next = actuels.includes(documentIndex)
        ? actuels.filter((index) => index !== documentIndex)
        : [...actuels, documentIndex].sort((a, b) => a - b);
      return { ...prev, [key]: next };
    });
  };

  const renderDocumentButtons = (nodeId: string | number, selected: number[]) => (
    <div className="schema-documents">
      <span className="schema-documents-label">Documents associés</span>
      <div className="schema-document-buttons">
        {documents.map((doc: any, documentIndex: number) => (
          <button
            type="button"
            key={documentIndex}
            className={`schema-doc-button ${selected.includes(documentIndex) ? "selected" : ""}`}
            onClick={() => toggleDocument(nodeId, documentIndex)}
            aria-pressed={selected.includes(documentIndex)}
          >
            Doc {String.fromCharCode(65 + documentIndex)}
          </button>
        ))}
      </div>
    </div>
  );

  const handleDiagramClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!(event.target as HTMLElement).closest(".schema-editable-box")) {
      setExpandedNode(null);
    }
  };

  return (
    <div className="schema-conceptuel" onClick={handleDiagramClick}>
      <div className="schema-document-list">
        <span className="schema-documents-label">Dossier documentaire</span>
        {documents.map((document: any, index: number) => (
          <DocumentCard
            key={index}
            document={document}
            index={index}
            accent="var(--card-teal)"
            note={notes[index] || ""}
            onNoteChange={(value) => setNotes((previous: Record<number, string>) => ({ ...previous, [index]: value }))}
            referenceUniversitaire
          />
        ))}
      </div>
      <NotesDocumentsPanel documents={documents} notes={notes} setNotes={setNotes} accent="var(--card-teal)" />
      <div className="schema-diagram" aria-label="Schéma conceptuel à compléter">
        <div className="schema-central-zone">
          <div
            className={`schema-centre schema-node schema-editable-box ${expandedNode === "central" ? "is-expanded" : ""}`}
            onClick={() => setExpandedNode("central")}
            onFocus={() => setExpandedNode("central")}
            tabIndex={0}
            aria-expanded={expandedNode === "central"}
          >
            <strong>{question.conceptCentral || question.consigne}</strong>
            {expandedNode === "central" && (
              <input
                data-schema-input
                aria-label="Réponse pour le nœud central"
                placeholder="Écris ta réponse ici…"
                value={centralResponse}
                onChange={(event) => setCentralResponse(event.target.value)}
              />
            )}
          </div>
        </div>
        <div className="schema-branch-panels">
          {branches.map((branch: any, branchIndex: number) => {
            const branchId = Number(branch.id || branchIndex + 1);
            const selected = selections[branchId] || [];
            const subnodes = getSchemaSubnodes(branch, allBranches);
            const branchName = nettoyerNomNoeudSchema(branch.nom || branch.element, `Branche principale ${branchId}`);
            return (
              <section className="schema-branch-panel" key={`branch-group-${branchId}`} aria-label="Branche principale">
                <div
                  className={`schema-branch schema-node schema-editable-box ${expandedNode === `branch-${branchId}` ? "is-expanded" : ""}`}
                  onClick={() => setExpandedNode(`branch-${branchId}`)}
                  onFocus={() => setExpandedNode(`branch-${branchId}`)}
                  tabIndex={0}
                  aria-expanded={expandedNode === `branch-${branchId}`}
                >
                  <div className="schema-branch-heading">
                    <strong>{branchName}</strong>
                  </div>
                  <textarea
                    data-schema-input
                    aria-label={`Réponse pour ${branchName}`}
                    placeholder={branch.placeholder || 'Écris ici le fait ou le lien à établir…'}
                    value={reponses[branchId] || ''}
                    onChange={(event) => setReponses((prev: Record<number, string>) => ({ ...prev, [branchId]: event.target.value }))}
                  />
                   {renderDocumentButtons(branchId, selected)}
                </div>

                <div className="schema-leaves" aria-label="Sous-boîtes de la branche">
                {subnodes.slice(0, 2).map((subNode: any, subIndex: number) => {
                  const key = `${branchId}-${subNode.id}`;
                  const subNodeKey = `sub-${key}`;
                  const subNodeName = nettoyerNomNoeudSchema(subNode.nom, `Feuille finale ${branchId}.${subIndex + 1}`);
                  return (
                    <div
                      className={`schema-subbranch schema-node schema-editable-box ${expandedNode === subNodeKey ? "is-expanded" : ""}`}
                      key={subNodeKey}
                      onClick={() => setExpandedNode(subNodeKey)}
                      onFocus={() => setExpandedNode(subNodeKey)}
                      tabIndex={0}
                      aria-expanded={expandedNode === subNodeKey}
                    >
                      <div className="schema-branch-heading">
                        <strong>{subNodeName}</strong>
                      </div>
                      <textarea
                        data-schema-input
                        aria-label={`Réponse pour ${subNodeName}`}
                        placeholder={subNode.placeholder || 'Écris ici ton idée ou tes notes…'}
                        value={sousReponses[key] || ""}
                        onChange={(event) => setSousReponses((prev: Record<string, string>) => ({ ...prev, [key]: event.target.value }))}
                      />
                      {renderDocumentButtons(subNodeKey, selections[subNodeKey] || [])}
                    </div>
                  );
                })}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const ERAS_HISTORIQUES: Record<string, { label: string; image: string; regions: { nom: string; x: number; y: number }[] }> = {
  "1867": { label: "Canada le 1er juillet 1867 (Confédération)", image: "/maps/carte-canada.svg", regions: [{ nom: "Ontario", x: 68, y: 86 }, { nom: "Québec", x: 78, y: 62 }, { nom: "Nouveau-Brunswick", x: 83.1, y: 74.8 }, { nom: "Nouvelle-Écosse", x: 87.0, y: 76.2 }] },
  "1870-71": { label: "Canada en 1870-1871", image: "/maps/carte-canada.svg", regions: [{ nom: "Colombie-Britannique", x: 29, y: 56 }, { nom: "Manitoba", x: 51.3, y: 80.7 }, { nom: "Ontario", x: 65, y: 88.5 }, { nom: "Québec", x: 76, y: 62 }, { nom: "Nouveau-Brunswick", x: 83.2, y: 77.7 }, { nom: "Nouvelle-Écosse", x: 86.9, y: 78.7 }] },
  "1999": { label: "Canada aujourd'hui", image: "/maps/carte-canada.svg", regions: [{ nom: "Yukon", x: 20, y: 24 }, { nom: "Territoires du Nord-Ouest", x: 33, y: 32 }, { nom: "Nunavut", x: 53, y: 24 }, { nom: "Colombie-Britannique", x: 19, y: 57 }, { nom: "Alberta", x: 29, y: 61 }, { nom: "Saskatchewan", x: 38, y: 65 }, { nom: "Manitoba", x: 45.5, y: 68 }, { nom: "Ontario", x: 58, y: 79 }, { nom: "Québec", x: 73.5, y: 63 }, { nom: "Terre-Neuve", x: 85.5, y: 55 }, { nom: "Nouveau-Brunswick", x: 82.3, y: 78.7 }, { nom: "Île-du-Prince-Édouard", x: 85.5, y: 68.5 }, { nom: "Nouvelle-Écosse", x: 86.8, y: 80.0 }] }
};

function CarteHistorique({ era, lieuSelectionne, setLieuSelectionne }: any) {
  const carte = ERAS_HISTORIQUES[era] || ERAS_HISTORIQUES["1999"];
  return (
    <div className="carte-wrap">
      <div className="carte-era-label">{carte.label}</div>
      <div className="carte-image-container">
        <CarteImageLibre era={era} alt={carte.label} />
      </div>
    </div>
  );
}

function CarteImageLibre({ era, alt }: { era: string; alt: string }) {
  const [visual, setVisual] = useState<any>(null);
  const [sourceEnErreur, setSourceEnErreur] = useState(false);
  const carteLocale = era.startsWith("province-quebec")
    ? "/maps/carte-quebec.png"
    : "/maps/carte-canada.png";

  useEffect(() => {
    let active = true;
    setVisual(null);
    setSourceEnErreur(false);
    void chargerCarteHistoriqueLibre(era).then((carte) => {
      if (active) setVisual(carte);
    });
    return () => { active = false; };
  }, [era]);

  const descriptionCarte = `${visual?.titre || ""} ${visual?.imageAlt || ""}`;
  const carteDistanteFrancaise = Boolean(
    visual
      && /\b(?:carte|québec|province|territoire|canada français)\b/i.test(descriptionCarte),
  );
  const afficherCarteDistante = carteDistanteFrancaise && !sourceEnErreur;

  return (
    <figure className="carte-figure">
      {afficherCarteDistante ? (
        <>
          <img
            src={getWikimediaImageProxySource(visual.imageUrl)}
            alt={visual.imageAlt || alt}
            className="carte-image"
            onError={() => setSourceEnErreur(true)}
          />
          <figcaption className="carte-source-note">
            Carte libre de droits — {visual.reference || "Wikimedia Commons"} · {visual.imageLicense}.
          </figcaption>
        </>
      ) : (
        <>
          <img src={carteLocale} alt={alt} className="carte-image" />
          <figcaption className="carte-source-note">Carte schématique en français — support de localisation.</figcaption>
        </>
      )}
    </figure>
  );
}

const CARTES_PROVINCE_QUEBEC: Record<string, { label: string; image: string }> = {
  "1763": { label: "1763 (Proclamation royale)", image: "/maps/carte-quebec.svg" },
  "1774": { label: "1774 (Acte de Québec)", image: "/maps/carte-quebec.svg" },
  "1783": { label: "1783 (Traité de Paris)", image: "/maps/carte-quebec.svg" }
};

function CarteComparaisonProvinceQuebec({ mode, annees, lieuCorrect, lieuSelectionne, setLieuSelectionne }: any) {
  const anneesValides: string[] = (annees || []).filter((a: string) => CARTES_PROVINCE_QUEBEC[a]);
  if (anneesValides.length < 2) return null;

  if (mode === 'identifier') {
    const carte = CARTES_PROVINCE_QUEBEC[lieuCorrect] || CARTES_PROVINCE_QUEBEC[anneesValides[0]];
    return (
      <div className="carte-wrap">
        <div className="carte-era-label">Territoire de la Province de Québec</div>
        <div className="carte-image-container"><CarteImageLibre era={`province-quebec-${lieuCorrect || anneesValides[0]}`} alt="Territoire de la Province de Québec" /></div>
      </div>
    );
  }

  return (
    <div className="carte-wrap">
      <div className="carte-era-label">Quel territoire correspond au fait décrit ?</div>
      <div className="carte-comparaison-grid">
        {anneesValides.map((annee) => (
          <button key={annee} type="button" className={`carte-comparaison-item ${lieuSelectionne === annee ? 'selected' : ''}`} onClick={() => setLieuSelectionne(annee)} aria-label={`Territoire ${annee}`}>
            <CarteImageLibre era={`province-quebec-${annee}`} alt={`Territoire de la Province de Québec en ${annee}`} />
          </button>
        ))}
      </div>
    </div>
  );
}

function choisirMeilleureVoixFrancaise(voixDisponibles: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const candidates = voixDisponibles
    .filter((candidate) => /^fr(?:[-_]|$)/i.test(candidate.lang))
    .map((candidate) => {
      const langue = candidate.lang.toLowerCase().replace("_", "-");
      const nom = `${candidate.name} ${candidate.voiceURI}`.toLowerCase();
      let score = 0;
      if (langue === "fr-ca") score += 180;
      else if (langue === "fr-fr") score += 155;
      else score += 125;
      if (/canada|québec|quebec/.test(nom)) score += 24;
       if (/natural|neural|premium|enhanced|google|microsoft|siri|amelie|thomas|audrey|fiona|felix/.test(nom)) score += 78;
       if (/compact|default|espeak|robot/.test(nom)) score -= 24;
       if (candidate.localService) score += 5;
      if (/français|french|france/.test(nom)) score += 8;
      return { candidate, score };
    })
    .sort((a, b) => b.score - a.score);
  return candidates[0]?.candidate || null;
}

function preparerTextePourLecture(contenu: string): string {
  return contenu
    .replace(/<[^>]*>/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/[`*_~]/g, "")
    .replace(/https?:\/\/\S+/gi, "lien web")
    .replace(/\bM\.\s/gi, "Monsieur ")
    .replace(/\bMme\.\s/gi, "Madame ")
    .replace(/\bDr\.\s/gi, "Docteur ")
    .replace(/\bMlle\.\s/gi, "Mademoiselle ")
    .replace(/\bQCM\b/gi, "question à choix multiple")
     .replace(/\bPFEQ\b/gi, "programme de formation de l’école québécoise")
    .replace(/(\d+)\s*\/\s*(\d+)/g, "$1 sur $2")
    .replace(/(\d+(?:[.,]\d+)?)\s*%/g, "$1 pour cent")
    .replace(/\s*&\s*/g, " et ")
    .replace(/\s*\/\s*/g, " ou ")
     .replace(/\(([^()]+)\)/g, ", $1, ")
     .replace(/"([^"\n]+)"/g, "« $1 »")
     .replace(/'/g, "’")
    .replace(/\s*([:;])\s*/g, "$1 ")
    .replace(/\s*[–—]\s*/g, " — ")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;!?…])/g, "$1")
    .trim();
}

function typographieFrancaise(value: unknown): string {
  return String(value || "")
    .replace(/"([^"\n]+)"/g, "« $1 »")
    .replace(/'/g, "’");
}

type EtatVoixLecture = "recherche" | "francaise" | "systeme" | "indisponible";

// speechSynthesis est un service global du navigateur : deux boutons doivent
// partager la même session pour éviter que deux longs textes se chevauchent.
let proprietaireLectureActive: object | null = null;
let arreterLectureActive: (() => void) | null = null;

function BoutonLecture({ texte }: { texte: string }) {
  const [enCours, setEnCours] = useState(false);
  const [etatVoix, setEtatVoix] = useState<EtatVoixLecture>("recherche");
  const voixRef = useRef<SpeechSynthesisVoice | null>(null);
  const segmentsRef = useRef<string[]>([]);
  const segmentIndexRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const voixFallbackTimerRef = useRef<number | null>(null);
  const lectureIdRef = useRef(0);
  const proprietaireRef = useRef<object>({});

  useEffect(() => {
    if (!('speechSynthesis' in window)) {
      setEtatVoix("indisponible");
      return;
    }
    const choisirVoix = () => {
      const voixDisponibles = window.speechSynthesis.getVoices();
      voixRef.current = choisirMeilleureVoixFrancaise(voixDisponibles);
      if (voixFallbackTimerRef.current !== null) {
        window.clearTimeout(voixFallbackTimerRef.current);
        voixFallbackTimerRef.current = null;
      }
      setEtatVoix(
        voixRef.current
          ? "francaise"
          : voixDisponibles.length > 0
            ? "systeme"
            : "recherche",
      );
      // Chrome, Safari et Edge peuvent exposer une liste vide avant
      // voiceschanged. Si elle reste vide, la langue fr-CA de l'utterance
      // devient le repli système documenté plutôt qu'une attente infinie.
      if (!voixRef.current && voixDisponibles.length === 0) {
        voixFallbackTimerRef.current = window.setTimeout(() => {
          setEtatVoix("systeme");
          voixFallbackTimerRef.current = null;
        }, 1500);
      }
    };
    choisirVoix();
    window.speechSynthesis.addEventListener('voiceschanged', choisirVoix);
    return () => {
      lectureIdRef.current += 1;
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      if (voixFallbackTimerRef.current !== null) window.clearTimeout(voixFallbackTimerRef.current);
      if (proprietaireLectureActive === proprietaireRef.current) {
        proprietaireLectureActive = null;
        arreterLectureActive = null;
        window.speechSynthesis.cancel();
      }
      window.speechSynthesis.removeEventListener('voiceschanged', choisirVoix);
      voixRef.current = null;
      segmentsRef.current = [];
      segmentIndexRef.current = 0;
    };
  }, []);

  const decouperPourLecture = (contenu: string) => {
    const propre = preparerTextePourLecture(contenu);
    if (!propre) return [];
    const Segmenter = (Intl as typeof Intl & {
      Segmenter?: new (locales?: string | string[], options?: { granularity: "sentence" }) => { segment: (value: string) => Iterable<{ segment: string }> };
    }).Segmenter;
    const phrases = Segmenter
      ? Array.from(new Segmenter("fr", { granularity: "sentence" }).segment(propre), ({ segment }) => segment)
      : (propre.match(/[^.!?…]+[.!?…]+|[^.!?…]+$/g) || [propre]);
    const segments: string[] = [];
    let segment = "";
    phrases.forEach((phrase) => {
      const mot = phrase.trim();
      if (!mot) return;
      if (segment && segment.length + mot.length + 1 > 700) {
        segments.push(segment);
        segment = "";
      }
      if (mot.length > 700) {
        mot.split(" ").forEach((petitMot) => {
          if (segment && segment.length + petitMot.length + 1 > 700) {
            segments.push(segment);
            segment = "";
          }
          segment = `${segment} ${petitMot}`.trim();
        });
      } else {
        segment = `${segment} ${mot}`.trim();
      }
    });
    if (segment) segments.push(segment);
    return segments;
  };

  const terminerLecture = () => {
    if (proprietaireLectureActive === proprietaireRef.current) {
      proprietaireLectureActive = null;
      arreterLectureActive = null;
    }
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    segmentsRef.current = [];
    segmentIndexRef.current = 0;
    setEnCours(false);
  };

  const arreterLecture = () => {
    lectureIdRef.current += 1;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    if (proprietaireLectureActive === proprietaireRef.current) {
      proprietaireLectureActive = null;
      arreterLectureActive = null;
    }
    segmentsRef.current = [];
    segmentIndexRef.current = 0;
    setEnCours(false);
  };

  const toggleLecture = () => {
    if (!('speechSynthesis' in window)) return;
    if (enCours) {
      arreterLecture();
      return;
    }
    arreterLectureActive?.();
    const lectureId = lectureIdRef.current + 1;
    lectureIdRef.current = lectureId;
    window.speechSynthesis.cancel();
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    const voixDisponibles = window.speechSynthesis.getVoices();
    const voix = voixRef.current || choisirMeilleureVoixFrancaise(voixDisponibles);
    voixRef.current = voix;
    if (voix) setEtatVoix("francaise");
    else setEtatVoix("systeme");
    segmentsRef.current = decouperPourLecture(texte);
    segmentIndexRef.current = 0;
    if (segmentsRef.current.length === 0) {
      setEnCours(false);
      return;
    }
    proprietaireLectureActive = proprietaireRef.current;
    arreterLectureActive = arreterLecture;
    const segments = segmentsRef.current.slice();
    const lireSegmentSuivant = (index: number) => {
      if (lectureIdRef.current !== lectureId) return;
      const segment = segments[index];
      if (!segment) {
        terminerLecture();
        return;
      }
      const utterance = new SpeechSynthesisUtterance(segment);
      utterance.lang = voix?.lang || 'fr-CA';
      if (voix) utterance.voice = voix;
       utterance.rate = 0.88;
       if (segment.length > 420) utterance.rate = 0.82;
       utterance.pitch = /[!?]$/.test(segment) ? 1.05 : 1.02;
      utterance.volume = 1;
      utterance.onend = () => {
        if (lectureIdRef.current !== lectureId) return;
        segmentIndexRef.current = index + 1;
        if (index === segments.length - 1) {
          terminerLecture();
          return;
        }
         const pause = /[.!?…]$/.test(segment) ? 260 : /[;:]$/.test(segment) ? 170 : 110;
        timerRef.current = window.setTimeout(() => {
          timerRef.current = null;
          lireSegmentSuivant(index + 1);
        }, pause);
      };
      utterance.onerror = (event) => {
        if (lectureIdRef.current !== lectureId || event.error === "canceled" || event.error === "interrupted") return;
        arreterLecture();
      };
      window.speechSynthesis.speak(utterance);
    };
    setEnCours(true);
    lireSegmentSuivant(0);
  };

  return (
    <>
      <button type="button" className={`bouton-lecture ${enCours ? 'active' : ''}`} onClick={toggleLecture} disabled={etatVoix === "indisponible"} aria-label={enCours ? 'Arrêter la lecture' : 'Écouter ce texte'} title={enCours ? 'Arrêter la lecture' : 'Écouter ce texte'}>
        {enCours ? 'Arrêter' : 'Écouter'}
      </button>
      {etatVoix === "systeme" && (
        <small className="lecture-status" role="status">
          Aucune voix française dédiée n’est disponible; la voix système est réglée en français.
        </small>
      )}
      {etatVoix === "indisponible" && (
        <small className="lecture-status" role="status">
          La lecture audio n’est pas disponible sur cet appareil; le texte reste accessible ci-dessus.
        </small>
      )}
    </>
  );
}

function pourcentageNote(note: unknown) {
  const valeur = String(note || "").match(/(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)/);
  if (!valeur) return null;
  const obtenu = Number(valeur[1].replace(",", "."));
  const total = Number(valeur[2].replace(",", "."));
  return total > 0 ? Math.round((obtenu / total) * 100) : null;
}

function normaliserPeriode(periode: unknown, periodeId?: unknown) {
  const id = Number(periodeId);
  const parId = PERIODES_HISTORIQUES.find((item) => item.id === id);
  if (parId) return parId.titre.split(" : ")[0];
  const valeur = String(periode || "").toLowerCase();
  const numeroDansLibelle = valeur.match(/p[ée]riode\s*(\d+)/i);
  const parNumero = numeroDansLibelle ? PERIODES_HISTORIQUES.find((item) => item.id === Number(numeroDansLibelle[1])) : undefined;
  if (parNumero) return parNumero.titre.split(" : ")[0];
  const parTitre = PERIODES_HISTORIQUES.find((item) => valeur.includes(item.titre.toLowerCase()) || valeur.includes(item.titre.split(" : ")[0].toLowerCase()));
  return parTitre?.titre.split(" : ")[0] || String(periode || "Toutes les périodes");
}

function afficherDatesPeriode(periode: unknown, periodeId?: unknown) {
  const id = Number(periodeId);
  const parId = PERIODES_HISTORIQUES.find((item) => item.id === id);
  if (parId) return parId.titre.split(" : ")[0];
  const valeur = String(periode || "").toLowerCase();
  const numeroDansLibelle = valeur.match(/p[ée]riode\s*(\d+)/i);
  const parNumero = numeroDansLibelle ? PERIODES_HISTORIQUES.find((item) => item.id === Number(numeroDansLibelle[1])) : undefined;
  if (parNumero) return parNumero.titre.split(" : ")[0];
  const parTitre = PERIODES_HISTORIQUES.find((item) =>
    valeur.includes(item.titre.toLowerCase()) ||
    valeur.includes(item.titre.split(" : ")[0].toLowerCase()) ||
    valeur.includes(item.titre.split(" : ")[1]?.toLowerCase() || "")
  );
  return parTitre?.titre.split(" : ")[0] || String(periode || "Dates non précisées");
}

function regrouperResultats(resultats: any[]) {
  const groupes = new Map<string, { label: string; section: string; operation: string; periode: string; scores: number[]; total: number }>();
  resultats.forEach((resultat) => {
    const score = pourcentageNote(resultat.note || resultat.resultat);
    if (score === null) return;
    const section = resultat.section || "Exercices";
    const operation = resultat.operation || "Compétence générale";
    const periode = normaliserPeriode(resultat.periode, resultat.periodeId);
    const label = operation.startsWith("Section C") ? "Question élaborée" : operation;
    const key = `${section}|${operation}|${periode}`;
    const actuel = groupes.get(key) || { label, section, operation, periode, scores: [] as number[], total: 0 };
    actuel.scores.push(score);
    actuel.total += 1;
    groupes.set(key, actuel);
  });
  return Array.from(groupes.values())
    .map((groupe) => ({ ...groupe, score: Math.round(groupe.scores.reduce((total, score) => total + score, 0) / groupe.scores.length) }))
    .sort((a, b) => a.score - b.score);
}

function nettoyerTexteFeedback(value: unknown) {
  return String(value || "")
    .split(/\r?\n/)
    .filter((ligne) => !/^\s*(?:points?\s+forts?|ce que tu réussis|à travailler|élément(?:s)? à travailler|défi(?:s)?(?: à relever)?|astuce documentaire|conseil(?: de l’archiviste)?|piste d’amélioration)\s*[:\-–—]/i.test(ligne))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function decouperPremierePhrase(value: unknown) {
  const texte = nettoyerTexteFeedback(value);
  if (!texte) return [];
  const phrase = texte.match(/^(.+?[.!?])(?:\s+)([\s\S]+)$/);
  return phrase ? [phrase[1].trim(), phrase[2].trim()] : [texte];
}

function decouperExplicationAuEt(value: unknown): string[] {
  const texte = typographieFrancaise(nettoyerTexteFeedback(value));
  if (!texte) return [];
  const match = texte.match(/^([\s\S]*?)\s+et\s+([\s\S]+)$/i);
  return match ? [match[1].trim(), `et ${match[2].trim()}`] : [texte];
}

function FeedbackNarratif({ commentaire, explication, encouragement, splitExplicationAtEt = false }: { commentaire?: unknown; explication?: unknown; encouragement?: unknown; splitExplicationAtEt?: boolean }) {
  const explicationBranches = splitExplicationAtEt
    ? decouperExplicationAuEt(explication)
    : [typographieFrancaise(nettoyerTexteFeedback(explication))].filter(Boolean);
  const paragraphes = [
     typographieFrancaise(nettoyerTexteFeedback(encouragement)),
    ...decouperPremierePhrase(commentaire),
  ].filter(Boolean);
  if (paragraphes.length === 0 && explicationBranches.length === 0) return null;
  return (
    <div className="feedback-commentary">
      {paragraphes.map((paragraphe, index) => <p key={`${index}-${paragraphe}`}>{typographieFrancaise(paragraphe)}</p>)}
      {splitExplicationAtEt && explicationBranches.length > 1 ? (
        <div className="feedback-branches" aria-label="Explication en deux parties">
          {explicationBranches.map((branche, index) => (
            <div className="feedback-branch" key={`${index}-${branche}`}>
              <p>{branche}</p>
            </div>
          ))}
        </div>
      ) : explicationBranches.map((branche, index) => (
        <p key={`explication-${index}-${branche}`}>{branche}</p>
      ))}
    </div>
  );
}

function FeedbackBlocs({ feedback, reponse = "", hasDocuments = true, hideChallengeWhenCorrect = false, encouragerPhraseComplete = false }: { feedback: any; reponse?: string; hasDocuments?: boolean; hideChallengeWhenCorrect?: boolean; encouragerPhraseComplete?: boolean }) {
  const pointFortBrut = String(feedback?.pointFort || "");
  const pointFort = /aucun|rien|non décel/i.test(pointFortBrut)
    ? "Tu as commencé la tâche : reprends maintenant la consigne et ajoute un fait historique précis."
    : nettoyerTexteFeedback(pointFortBrut) || "Tu as commencé la tâche et tu peux maintenant préciser ton raisonnement.";
  const phraseCompleteDemandee = encouragerPhraseComplete && reponseEstUnSeulMot(reponse);
  const defi = phraseCompleteDemandee
    ? "Tu as repéré un élément important. Pour mieux démontrer ta compréhension, transforme ce mot en une phrase complète qui explique le fait et son lien avec la question."
    : nettoyerTexteFeedback(
    feedback?.elementATravailler ||
    feedback?.aTravailler ||
    feedback?.pisteAmelioration ||
    "Rendre le lien entre la preuve et l’idée encore plus clair."
  );
  const sourcesUtiles = Array.isArray(feedback?.sourcesUtiles)
    ? feedback.sourcesUtiles.filter(Boolean).join(" ")
    : "";
  const astuce = nettoyerTexteFeedback(
    feedback?.astuceDocumentaire ||
    sourcesUtiles ||
    (hasDocuments
      ? "Repère d’abord les mots-clés de la consigne, puis choisis le document qui apporte une preuve précise."
      : "Repère les mots-clés de la consigne et note le fait historique qui répond directement à la question.")
  );
  return (
    <div className="feedback-blocks">
      <div className="feedback-columns">
        <div className="feedback-column feedback-strength">
          <span className="feedback-column-label">Points forts</span>
          <strong>{pointFort}</strong>
        </div>
        {(!hideChallengeWhenCorrect || phraseCompleteDemandee) && (
          <div className="feedback-column feedback-challenge">
            <span className="feedback-column-label">Points à travailler</span>
            <strong>{defi}</strong>
          </div>
        )}
      </div>
      {(!hideChallengeWhenCorrect || phraseCompleteDemandee) && (
        <div className="feedback-document-tip">
          <span className="feedback-column-label">Astuce documentaire</span>
          <strong>{astuce}</strong>
        </div>
      )}
      {feedback?.progressionOperation && (
        <p className="feedback-progression"><b>Progression dans l’opération :</b> {feedback.progressionOperation}</p>
      )}
    </div>
  );
}

function FeedbackInteractif({ feedback, reponse, accent, hasDocuments = true, hideChallengeWhenCorrect = false, encouragerPhraseComplete = false }: { feedback: any; reponse: string; accent: string; hasDocuments?: boolean; hideChallengeWhenCorrect?: boolean; encouragerPhraseComplete?: boolean }) {
  const [detailsOuverts, setDetailsOuverts] = useState(false);
  if (!feedback) return null;
  return (
    <div className="feedback-interactif" style={{ borderTopColor: accent }}>
      <FeedbackBlocs feedback={feedback} reponse={reponse} hasDocuments={hasDocuments} hideChallengeWhenCorrect={hideChallengeWhenCorrect && feedback?.correct === true} encouragerPhraseComplete={encouragerPhraseComplete} />
      <div className="feedback-audio">
        <span className="label">Écouter ma réponse</span>
        <BoutonLecture texte={reponse || "Réponse structurée enregistrée."} />
      </div>
      <button type="button" className="feedback-toggle" onClick={() => setDetailsOuverts((ouvert) => !ouvert)} aria-expanded={detailsOuverts}>
        {detailsOuverts ? "Masquer le décorticage" : "Lire et décortiquer ma réponse"}
      </button>
      {detailsOuverts && (
        <div className="feedback-breakdown">
          <div>
            <span className="label">Ta réponse</span>
            <p>{reponse || "Réponse structurée enregistrée."}</p>
          </div>
          <div><span className="label">Ce que la correction observe</span><p>{feedback.commentaire || feedback.commentaireGlobal || feedback.explication || "La correction a comparé ta réponse aux critères et aux documents."}</p></div>
          <div>
            <span className="label">Lien entre l’extrait et ta réponse</span>
            <p>{feedback.lienExtraitReponse || feedback.lienDocumentReponse || feedback.diagnosticOperation?.preuveDocumentaire || feedback.explication || feedback.commentaire || "Relie un indice précis de l’extrait à l’idée que tu avances dans ta réponse."}</p>
          </div>
          {feedback.diagnosticOperation && (
            <>
              <div><span className="label">Critères respectés</span><p>{(feedback.diagnosticOperation.criteresRespectes || []).join(" • ") || "Aucun critère complet n’a encore été démontré."}</p></div>
              <div><span className="label">Critères à retravailler</span><p>{(feedback.diagnosticOperation.criteresARetravailler || []).join(" • ") || "Tous les critères ciblés sont respectés."}</p></div>
              {(feedback.diagnosticOperation.marqueursUtilises || []).length > 0 && (
                <div><span className="label">Marqueurs observés</span><p>{feedback.diagnosticOperation.marqueursUtilises.join(", ")}</p></div>
              )}
              <div><span className="label">Preuve documentaire</span><p>{feedback.diagnosticOperation.preuveDocumentaire}</p></div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function BarreNavigationEleve({ active, onChange }: { active: string; onChange: (tab: 'accueil' | 'progres' | 'focus' | 'profil' | 'notifications') => void }) {
  const items = [
    { id: 'accueil' as const, label: "Accueil", hint: "Modules", icon: LayoutGrid },
    { id: 'progres' as const, label: "Ma progression", hint: "Forces et défis", icon: BarChart3 },
    { id: 'focus' as const, label: "Mode focus", hint: "Une séance", icon: Timer },
    { id: 'profil' as const, label: "Paramètres", hint: "Profil et règles", icon: Flag }
  ];
  return (
    <nav className="student-bottom-nav" aria-label="Navigation de l’espace élève">
      {items.map((item) => { const Icon = item.icon; return <button key={item.id} type="button" className={active === item.id ? "active" : ""} onClick={() => onChange(item.id)}><Icon aria-hidden="true" /><strong>{item.label}</strong><small>{item.hint}</small></button>; })}
    </nav>
  );
}

function NotificationsEleve({
  studentName,
  niveauScolaire,
  resultats,
  periodesPermises,
  onRetourAuxModules,
}: {
  studentName: string;
  niveauScolaire: 3 | 4 | null;
  resultats: any[];
  periodesPermises: number[];
  onRetourAuxModules: () => void;
}) {
  const nom = studentName.trim() || "Élève";
  const notifications = [
    {
      id: "bienvenue",
      titre: `Bienvenue dans ton espace, ${nom}`,
      message: niveauScolaire
        ? `Ton parcours de secondaire ${niveauScolaire} est prêt. Choisis une activité pour continuer ton entraînement.`
        : "Choisis ton parcours scolaire pour commencer ton entraînement.",
      meta: "Notification personnalisée",
      icon: Sparkles,
      couleur: "blue",
    },
    {
      id: "progression",
      titre: resultats.length > 0 ? "Ta progression est à jour" : "Ton tableau de progression t’attend",
      message: resultats.length > 0
        ? `${resultats.length} résultat${resultats.length > 1 ? "s" : ""} enregistré${resultats.length > 1 ? "s" : ""}. Retourne à Ma progression pour voir tes forces et tes défis.`
        : "Après ta première correction, tes résultats apparaîtront automatiquement dans Ma progression.",
      meta: resultats.length > 0 ? "Selon tes résultats enregistrés" : "Pour ta prochaine séance",
      icon: BarChart3,
      couleur: "green",
    },
    {
      id: "periodes",
      titre: periodesPermises.length > 0 ? "De nouvelles périodes sont disponibles" : "Ton parcours historique se prépare",
      message: periodesPermises.length > 0
        ? `${periodesPermises.length} période${periodesPermises.length > 1 ? "s" : ""} débloquée${periodesPermises.length > 1 ? "s" : ""} par ton enseignant.`
        : "Les périodes accessibles apparaîtront dès que ton groupe sera configuré.",
      meta: "Selon les accès de ton groupe",
      icon: Flag,
      couleur: "gold",
    },
  ];

  return (
    <section className="notifications-page" aria-labelledby="notifications-title">
      <div className="notifications-heading">
        <div>
          <span className="eyebrow">Ton espace</span>
          <h1 id="notifications-title">Notifications</h1>
          <p>Des rappels adaptés à ton parcours, tes résultats et tes accès.</p>
        </div>
        <span className="notifications-count" aria-label={`${notifications.length} notifications personnalisées`}>{notifications.length}</span>
      </div>
      <div className="notifications-list">
        {notifications.map((notification) => {
          const Icon = notification.icon;
          return (
            <article className={`notification-card notification-card--${notification.couleur}`} key={notification.id}>
              <span className="notification-icon" aria-hidden="true"><Icon /></span>
              <div className="notification-content">
                <div className="notification-card-heading">
                  <h2>{notification.titre}</h2>
                  <span>{notification.meta}</span>
                </div>
                <p>{notification.message}</p>
              </div>
            </article>
          );
        })}
      </div>
      <button type="button" className="student-back-action" onClick={onRetourAuxModules}><ArrowLeft aria-hidden="true" /> <span>Retourner aux modules</span></button>
    </section>
  );
}

function TableauProgression({ resultats, niveauScolaire, onRetourAuxModules }: { resultats: any[]; niveauScolaire: 3 | 4 | null; onRetourAuxModules: () => void }) {
  const resultatsDuNiveau = niveauScolaire
    ? resultats.filter((resultat) => {
      const realite = trouverRealitePFEQ(resultat.periodeId);
      return realite?.niveau === niveauScolaire;
    })
    : resultats;
  const groupes = regrouperResultats(resultatsDuNiveau);
  const moyenne = groupes.length ? Math.round(groupes.reduce((total, groupe) => total + groupe.score, 0) / groupes.length) : 0;
  const moyennePourcent = Math.min(100, Math.max(0, moyenne));
  const priorites = groupes.filter((groupe) => groupe.score < 75).slice(0, 3);
  return (
    <section className="student-dashboard">
      <div className="student-dashboard-heading"><div><span className="eyebrow">Ton tableau de bord</span><h1>Ta progression, sans deviner.</h1><p>Chaque compétence est suivie séparément pour savoir exactement quoi pratiquer ensuite.</p></div><div className="progress-ring" style={{ "--progress-value": moyennePourcent } as React.CSSProperties} aria-label={`${moyennePourcent}% moyenne suivie`}><strong>{moyennePourcent}%</strong><span>moyenne suivie</span></div></div>
      <div className="progress-summary-grid" aria-label="Résumé de la progression">
        <article className="progress-summary-card progress-summary-card--blue"><span className="progress-summary-icon"><CheckCircle2 aria-hidden="true" /></span><div><strong>{resultatsDuNiveau.length}</strong><span>Exercices corrigés</span></div></article>
        <article className="progress-summary-card progress-summary-card--green"><span className="progress-summary-icon"><BarChart3 aria-hidden="true" /></span><div><strong>{groupes.length}</strong><span>Compétences suivies</span></div></article>
        <article className="progress-summary-card progress-summary-card--gold"><span className="progress-summary-icon"><Flag aria-hidden="true" /></span><div><strong>{priorites.length}</strong><span>Priorités de pratique</span></div></article>
      </div>
      <div className="student-dashboard-grid">
        <div className="dashboard-panel"><div className="panel-heading"><div><span className="eyebrow">À renforcer</span><h2>Ton prochain meilleur effort</h2></div><span className="panel-mark">01</span></div>{priorites.length === 0 ? <p className="empty-dashboard">Continue comme ça : aucune notion ne demande une reprise urgente.</p> : priorites.map((groupe) => <div className="skill-row" key={`${groupe.section}-${groupe.operation}-${groupe.periode}`}><div><strong>{groupe.label}</strong><span>{groupe.periode} · {groupe.total} exercice{groupe.total > 1 ? "s" : ""}</span></div><div className="skill-meter"><i style={{ width: `${groupe.score}%` }} /></div><b>{groupe.score}%</b></div>)}</div>
        <div className="dashboard-panel"><div className="panel-heading"><div><span className="eyebrow">Vue détaillée</span><h2>Compétences et périodes</h2></div><span className="panel-mark">02</span></div>{groupes.length === 0 ? <p className="empty-dashboard">Tes résultats apparaîtront ici après ta première correction.</p> : groupes.slice(0, 8).map((groupe) => <div className="skill-row compact" key={`detail-${groupe.section}-${groupe.operation}-${groupe.periode}`}><div><strong>{groupe.label}</strong><span>{groupe.periode}</span></div><b className={groupe.score >= 75 ? "score-good" : "score-low"}>{groupe.score}%</b></div>)}</div>
      </div>
      <button type="button" className="student-back-action" onClick={onRetourAuxModules}><ArrowLeft aria-hidden="true" /> <span>Retourner aux modules</span></button>
    </section>
  );
}

type FocusIntention = "Récupération active" | "Expliquer une preuve" | "Faire des liens" | "Relire et corriger";

const FOCUS_INTENTIONS: Array<{ id: FocusIntention; description: string; icon: typeof BookOpen }> = [
  { id: "Récupération active", description: "Rappelle les notions qui demandent encore un peu d’entraînement.", icon: BookOpen },
  { id: "Expliquer une preuve", description: "Travaille le lien entre une source, un fait et ton explication.", icon: PenLine },
  { id: "Faire des liens", description: "Compare deux périodes ou concepts pour faire émerger une relation.", icon: Link2 },
  { id: "Relire et corriger", description: "Reprends une réponse précédente avec une cible d’amélioration claire.", icon: RotateCcw },
];

const FOCUS_SOURCE_HOSTS = new Set(["www.bac-lac.gc.ca", "www.mcq.org", "bilan.usherbrooke.ca", "www.quebec.ca"]);

function normaliserActiviteFocus(reponse: any, intention: FocusIntention, catalogueSources: any[] = []) {
  const activite = reponse?.activite || reponse?.activity || reponse;
  if (!activite || typeof activite !== "object" || !String(activite.consigne || activite.question || "").trim()) {
    throw new Error("L’activité reçue n’est pas assez structurée. Réessaie pour obtenir un nouvel exercice.");
  }
  const sourcesBrutes = Array.isArray(activite.sources) && activite.sources.length
    ? activite.sources
    : catalogueSources;
  const sources = sourcesBrutes
    .map((source: any) => {
      try {
        const url = new URL(String(source.url || ""));
        return FOCUS_SOURCE_HOSTS.has(url.hostname) && /^https:$/.test(url.protocol)
          ? { ...source, url: url.toString() }
          : null;
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  const champsParIntention: Record<FocusIntention, Array<{ id: string; label: string; placeholder: string }>> = {
    "Récupération active": [{ id: "rappel", label: "Ce dont je me souviens", placeholder: "Écris d’abord ce que tu sais, sans consulter tes notes…" }],
    "Expliquer une preuve": [
      { id: "affirmation", label: "Mon affirmation historique", placeholder: "Quelle idée ou quel fait veux-tu démontrer ?" },
      { id: "preuve", label: "La preuve dans le document", placeholder: "Nomme le document et l’indice précis qui l’appuie…" },
      { id: "lien", label: "Le lien expliqué", placeholder: "Explique pourquoi cette preuve soutient ton affirmation…" },
    ],
    "Faire des liens": [
      { id: "premiere-realite", label: "Première période ou concept", placeholder: "Décris le premier élément avec un repère historique…" },
      { id: "deuxieme-realite", label: "Deuxième période ou concept", placeholder: "Décris le deuxième élément avec un repère historique…" },
      { id: "relation", label: "Le lien que je fais", placeholder: "Compare et explique la relation entre les deux éléments…" },
    ],
    "Relire et corriger": [{ id: "revision", label: "Ma réponse améliorée", placeholder: "Réécris ta réponse en corrigeant la cible indiquée…" }],
  };
  const champs = Array.isArray(activite.champs) && activite.champs.length
    ? activite.champs.slice(0, 4).map((champ: any, index: number) => ({
      id: String(champ.id || `champ-${index + 1}`),
      label: String(champ.label || `Étape ${index + 1}`),
      placeholder: String(champ.placeholder || "Rédige ta réponse ici…"),
    }))
    : champsParIntention[intention];
  return {
    ...activite,
    intention,
    titre: String(activite.titre || `Entraînement — ${intention}`),
    objectif: String(activite.objectif || "Construire une réponse historique précise."),
    consigne: String(activite.consigne || activite.question),
    notionCible: String(activite.notionCible || "Notion à consolider"),
    operationCible: String(activite.operationCible || "Compétence historique"),
    documents: Array.isArray(activite.documents) ? activite.documents.slice(0, 4) : [],
    sources,
    champs,
    etapes: Array.isArray(activite.etapes) ? activite.etapes.slice(0, 5) : [],
    limiteSource: String(activite.limiteSource || ""),
  };
}

async function executerGenerationAvecTentatives<T>(
  operation: () => Promise<T>,
  nombreTentatives = 2,
): Promise<T> {
  let derniereErreur: unknown;
  for (let tentative = 1; tentative <= nombreTentatives; tentative += 1) {
    try {
      return await operation();
    } catch (erreur) {
      derniereErreur = erreur;
      if (tentative === nombreTentatives) break;
      console.warn(`Échec de génération, nouvelle tentative ${tentative + 1}/${nombreTentatives}`, erreur);
    }
  }
  throw derniereErreur instanceof Error ? derniereErreur : new Error("La génération n’a pas produit une activité exploitable.");
}

const FOCUS_STATUTS = [
  { id: "reussi", label: "Réussi", description: "Les résultats montrent une maîtrise solide.", classe: "is-success" },
  { id: "partiel", label: "Partiellement acquis", description: "La compétence est présente, mais encore irrégulière.", classe: "is-partial" },
  { id: "travail", label: "À travailler", description: "Cette cible revient en priorité dans la prochaine activité.", classe: "is-work" },
  { id: "non-evalue", label: "Pas encore évalué", description: "Aucun résultat enregistré pour cette cible.", classe: "is-unassessed" },
] as const;

function statutFocus(score: number | null) {
  if (score === null) return FOCUS_STATUTS[3];
  if (score >= 75) return FOCUS_STATUTS[0];
  if (score >= 50) return FOCUS_STATUTS[1];
  return FOCUS_STATUTS[2];
}

function valeursPFEQ(resultat: any, champ: "conceptsPfeq" | "connaissancesPfeq") {
  const valeur = resultat?.[champ];
  if (Array.isArray(valeur)) return valeur.map((item) => String(item || "").trim()).filter(Boolean);
  return String(valeur || "").split(/[;,|]/).map((item) => item.trim()).filter(Boolean);
}

function textesCriteres(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item: any) =>
    String(item?.critere || item?.criterion || item || "").trim(),
  ).filter(Boolean))];
}

function criteresCiblesResultat(resultat: any): string[] {
  const detail = resultat?.detailCorrection || {};
  const operation = OPERATIONS.find((item) => item.id === String(resultat?.operationId || ""));
  const criteresResultat = textesCriteres(resultat?.criteresCibles);
  const criteresDetail = textesCriteres(detail.criteresCibles);
  const criteresCorrection = textesCriteres(resultat?.criteresCorrection);
  const criteresCorrectionDetail = textesCriteres(detail.criteresCorrection);
  const explicites = textesCriteres(
    criteresResultat.length > 0
      ? criteresResultat
      : criteresDetail.length > 0
        ? criteresDetail
        : criteresCorrection.length > 0
          ? criteresCorrection
          : criteresCorrectionDetail,
  );
  if (explicites.length > 0) return explicites;
  if (operation?.criteresObligatoires?.length) return [...operation.criteresObligatoires];
  if (String(resultat?.format || "").toLowerCase() === "court" && !resultat?.operationId) {
    return [...CRITERES_REPONSE_COURTE_PFEQ];
  }
  return [];
}

function criteresEvaluesResultat(resultat: any): string[] {
  const detail = resultat?.detailCorrection || {};
  const criteresResultat = textesCriteres(resultat?.criteresEvaluation);
  const criteresDetail = textesCriteres(detail.criteresEvaluation);
  const criteresEvaluation = criteresResultat.length > 0 ? criteresResultat : criteresDetail;
  if (criteresEvaluation.length > 0) return criteresEvaluation;
  const diagnostic = detail.diagnosticOperation || resultat?.diagnosticOperation;
  return [
    ...textesCriteres(diagnostic?.criteresRespectes),
    ...textesCriteres(diagnostic?.criteresARetravailler),
  ];
}

function couvertureCriteres(resultats: any[], criteresParDefaut: string[] = []) {
  const cibles = resultats.flatMap((resultat) => {
    const criteres = criteresCiblesResultat(resultat);
    return criteres.length > 0 ? criteres : criteresParDefaut;
  });
  const evalues = resultats.flatMap(criteresEvaluesResultat);
  return {
    criteresTotal: cibles.length,
    criteresEvalues: Math.min(cibles.length, evalues.length),
  };
}

function scoreMoyen(scores: number[]) {
  return scores.length ? Math.round(scores.reduce((total, score) => total + score, 0) / scores.length) : null;
}

function construireIndicateursFocus(resultats: any[], extraire: (resultat: any) => string[]) {
  const index = new Map<string, { label: string; scores: number[]; total: number; criteresTotal: number; criteresEvalues: number }>();
  resultats.forEach((resultat) => {
    const score = pourcentageNote(resultat.note || resultat.resultat);
    if (score === null) return;
    extraire(resultat).forEach((valeur) => {
      const actuel = index.get(valeur) || { label: valeur, scores: [], total: 0, criteresTotal: 0, criteresEvalues: 0 };
      actuel.scores.push(score);
      actuel.total += 1;
      const couverture = couvertureCriteres([resultat]);
      actuel.criteresTotal += couverture.criteresTotal;
      actuel.criteresEvalues += couverture.criteresEvalues;
      index.set(valeur, actuel);
    });
  });
  return Array.from(index.values())
    .map((item) => {
      const score = scoreMoyen(item.scores);
      return { ...item, score, statut: statutFocus(score) };
    })
    .sort((a, b) => (a.score ?? -1) - (b.score ?? -1) || a.label.localeCompare(b.label, "fr"));
}

function construireAnalyseFocus(resultats: any[], niveauScolaire: 3 | 4 | null, periodesSelectionnees: number[]) {
  const resultatsDuNiveau = resultats.filter((resultat) => {
    if (!niveauScolaire || !resultat?.niveau) return true;
    return String(resultat.niveau).includes(String(niveauScolaire));
  });
  const groupes = regrouperResultats(resultatsDuNiveau);
  const priorites = groupes.filter((groupe) => groupe.score < 75).slice(0, 4);
  const forces = groupes.filter((groupe) => groupe.score >= 75).slice(-3).reverse();
  const resultatsReponsesCourtes = resultatsDuNiveau.filter((resultat) => {
    const format = String(resultat?.format || "").toLowerCase();
    const module = String(resultat?.module || "").toLowerCase();
    return String(resultat?.section || "").toLowerCase() === "section a"
      && (format === "court" || module.includes("réponse courte"))
      && !resultat?.operationId;
  });
  const progression = {
    connaissances: construireIndicateursFocus(resultatsReponsesCourtes, (resultat) => valeursPFEQ(resultat, "connaissancesPfeq")),
    concepts: construireIndicateursFocus(resultatsDuNiveau, (resultat) => valeursPFEQ(resultat, "conceptsPfeq")),
  };
  const operations = OPERATIONS.map((operation) => {
    const resultatsOperation = resultatsDuNiveau.filter((resultat) =>
      String(resultat.operationId || "") === operation.id
      || String(resultat.operation || "").toLowerCase().includes(operation.nom.toLowerCase()),
    );
    const score = scoreMoyen(resultatsOperation.map((resultat) => pourcentageNote(resultat.note || resultat.resultat)).filter((score): score is number => score !== null));
    const couverture = couvertureCriteres(resultatsOperation, [...(operation.criteresObligatoires || [])]);
    return {
      label: operation.nom,
      operationId: operation.id,
      score,
      total: resultatsOperation.length,
      statut: statutFocus(score),
      criteresTotal: couverture.criteresTotal || operation.criteresObligatoires?.length || 0,
      criteresEvalues: couverture.criteresEvalues,
    };
  });
  const formats = [
    {
      label: "Question longue",
      formatId: "question-longue",
      resultats: resultatsDuNiveau.filter((resultat) => String(resultat.section || "").toLowerCase() === "section c" || String(resultat.operation || "").toLowerCase().includes("section c")),
    },
    {
      label: "Schéma conceptuel",
      formatId: "schema-conceptuel",
      resultats: resultatsDuNiveau.filter((resultat) => String(resultat.operation || "").toLowerCase().includes("schéma conceptuel") || String(resultat.operation || "").toLowerCase().includes("schema conceptuel")),
    },
  ].map((format) => {
    const score = scoreMoyen(format.resultats.map((resultat) => pourcentageNote(resultat.note || resultat.resultat)).filter((score): score is number => score !== null));
    return { label: format.label, formatId: format.formatId, score, total: format.resultats.length, statut: statutFocus(score) };
  });
  const periodeScope = periodesSelectionnees
    .map((periodeId) => {
      const periode = PERIODES_HISTORIQUES.find((item) => item.id === periodeId);
      const realite = trouverRealitePFEQ(periodeId);
      return periode && realite
        ? { id: periode.id, titre: periode.titre, concepts: [...realite.concepts], connaissances: [...realite.connaissances] }
        : null;
    })
    .filter(Boolean);
  const ciblesPrioritaires = [
    ...progression.connaissances.filter((item) => item.statut.id === "travail" || item.statut.id === "partiel"),
    ...progression.concepts.filter((item) => item.statut.id === "travail" || item.statut.id === "partiel"),
    ...operations.filter((item) => item.statut.id === "travail" || item.statut.id === "partiel"),
    ...formats.filter((item) => item.statut.id === "travail" || item.statut.id === "partiel"),
  ].slice(0, 12);
  const tentatives = resultatsDuNiveau
    .filter((resultat) => String(resultat.reponse || "").trim() || String(resultat.resultat || "").trim())
    .slice(0, 5)
    .map((resultat) => ({
      operation: resultat.operation || "Compétence générale",
      periode: normaliserPeriode(resultat.periode, resultat.periodeId),
      reponse: String(resultat.reponse || "").slice(0, 600),
      correction: String(resultat.commentaire || resultat.detailCorrection?.commentaireGlobal || resultat.resultat || "").slice(0, 500),
      score: pourcentageNote(resultat.note || resultat.resultat),
    }));
  return { groupes, priorites, forces, tentatives, progression, operations, formats, periodeScope, ciblesPrioritaires };
}

function FocusStatusBoard({ title, description, items }: { title: string; description: string; items: Array<{ label: string; score: number | null; total?: number; statut: typeof FOCUS_STATUTS[number]; criteresTotal?: number; criteresEvalues?: number }> }) {
  return (
    <section className="focus-status-board" aria-labelledby={`focus-status-${title.replace(/\W+/g, "-").toLowerCase()}`}>
      <div className="focus-status-heading">
        <div><h4 id={`focus-status-${title.replace(/\W+/g, "-").toLowerCase()}`}>{title}</h4><p>{description}</p></div>
        <span>{items.length} cible{items.length > 1 ? "s" : ""}</span>
      </div>
      <div className="focus-status-columns">
        {FOCUS_STATUTS.map((statut) => {
          const cibles = items.filter((item) => item.statut.id === statut.id);
          return (
            <div className={`focus-status-column ${statut.classe}`} key={statut.id}>
              <div className="focus-status-column-heading"><strong>{statut.label}</strong><b>{cibles.length}</b></div>
              <p>{statut.description}</p>
              {cibles.length > 0 ? (
                <ul>
                   {cibles.map((item) => <li key={item.label}><span>{item.label}</span><small>{item.score === null ? "—" : `${item.score}%`}{item.total ? ` · ${item.total} résultat${item.total > 1 ? "s" : ""}` : ""}{item.criteresTotal ? ` · Critères évalués : ${item.criteresEvalues || 0}/${item.criteresTotal}` : ""}</small></li>)}
                </ul>
              ) : <span className="focus-status-empty">Aucune cible dans cette catégorie.</span>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ModeFocus({
  resultats,
  niveauScolaire,
  periodesSelectionnees,
  difficulteGroupe,
  studentName,
  onGenerate,
  onSave,
}: {
  resultats: any[];
  niveauScolaire: 3 | 4 | null;
  periodesSelectionnees: number[];
  difficulteGroupe: number;
  studentName: string;
  onGenerate: (prompt: string, action: "generate" | "correct") => Promise<any>;
  onSave: (donnees: any) => Promise<void>;
}) {
  const dureeInitiale = 25 * 60;
  const [secondes, setSecondes] = useState(dureeInitiale);
  const [enCours, setEnCours] = useState(false);
  const [objectif, setObjectif] = useState<FocusIntention>("Récupération active");
  const [activite, setActivite] = useState<any>(null);
  const [reponses, setReponses] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<any>(null);
  const [chargement, setChargement] = useState<"generation" | "correction" | "sauvegarde" | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const analyse = construireAnalyseFocus(resultats, niveauScolaire, periodesSelectionnees);
  const prioritePrincipale = analyse.priorites[0];

  useEffect(() => {
    if (!enCours) return;
    const interval = window.setInterval(() => setSecondes((valeur) => {
      if (valeur <= 1) { setEnCours(false); return 0; }
      return valeur - 1;
    }), 1000);
    return () => window.clearInterval(interval);
  }, [enCours]);

  const minutes = Math.floor(secondes / 60).toString().padStart(2, "0");
  const reste = (secondes % 60).toString().padStart(2, "0");
  const periodesFocus = PERIODES_HISTORIQUES
    .filter((periode) => periodesSelectionnees.includes(periode.id) && (!niveauScolaire || periode.niveau === niveauScolaire));
  const periodeContexte = periodesFocus
    .map((periode) => `${periode.id} — ${periode.titre}`)
    .join(" | ");
  const balisesFocus = contextePFEQ(periodesFocus.map((periode) => periode.id));

  const construirePromptGeneration = () => {
    const resume = {
      eleve: studentName || "Élève",
      niveau: niveauScolaire ? `Secondaire ${niveauScolaire}` : "Secondaire",
      difficultéDeLecture: difficulteGroupe,
      periodesAutorisees: periodeContexte,
      etendueMatiere: analyse.periodeScope.map((periode: any) => ({ id: periode.id, titre: periode.titre })),
      prioritesParOperation: analyse.priorites.map((groupe) => ({
        operation: groupe.operation,
        periode: groupe.periode,
        score: groupe.score,
        tentatives: groupe.total,
      })),
      forces: analyse.forces.map((groupe) => ({ operation: groupe.operation, score: groupe.score })),
      progressionApprentissages: {
        connaissances: analyse.progression.connaissances.map((item) => ({ element: item.label, statut: item.statut.label, score: item.score, resultats: item.total })),
        concepts: analyse.progression.concepts.map((item) => ({ element: item.label, statut: item.statut.label, score: item.score, resultats: item.total })),
      },
      septOperationsIntellectuelles: analyse.operations.map((item) => ({ operation: item.label, operationId: item.operationId, statut: item.statut.label, score: item.score, resultats: item.total })),
      productionsComplexes: analyse.formats.map((item) => ({ format: item.label, statut: item.statut.label, score: item.score, resultats: item.total })),
      ciblesPrioritaires: analyse.ciblesPrioritaires.map((item) => ({ cible: item.label, statut: item.statut.label, score: item.score, resultats: item.total })),
      dernieresTentatives: analyse.tentatives,
      reponseFaibleCible: analyse.tentatives.find((tentative) => tentative.score !== null && Number(tentative.score) < 75) || null,
    };
    const consignesIntention: Record<FocusIntention, string> = {
      "Récupération active": "Construis un rappel guidé : une question courte, des indices progressifs et une vérification finale. Commence par une tentative de mémoire avant toute explication.",
      "Expliquer une preuve": "Construis un exercice d'argumentation documentaire : l'élève doit formuler une affirmation, identifier une preuve précise et expliquer le lien entre les deux. Les documents ne doivent pas donner la réponse.",
      "Faire des liens": "Construis une activité de comparaison entre deux périodes ou concepts autorisés : l'élève doit décrire chacun, puis expliquer une relation historique soutenue par deux repères.",
      "Relire et corriger": "Reprends la dernière réponse faible de l'élève. Donne un diagnostic ciblé sans réécrire la réponse à sa place, puis demande une version améliorée qui corrige exactement cette difficulté.",
    };
    return `Tu es un tuteur d'Histoire du Québec et du Canada. Génère une seule activité personnalisée pour le Mode focus, en français québécois, à partir du profil de réussites et d'erreurs ci-dessous.
INTENTION : ${objectif}
${consignesIntention[objectif]}
PROFIL STRUCTURÉ : ${JSON.stringify(resume)}
     Règles : respecte strictement les périodes autorisées; revois l’ensemble des périodes, des concepts et des connaissances officielles listés dans les balises, sans te limiter aux dernières erreurs. Mets toutefois l’accent sur les connaissances et les sept opérations intellectuelles dont le statut est « Partiellement acquis » ou « À travailler », puis sur la question longue ou le schéma conceptuel moins bien réussi. Ne fabrique aucun résultat et ne révèle jamais les métadonnées de correction dans la consigne; adapte la difficulté de lecture au niveau indiqué; varie le sujet par rapport aux tentatives récentes.
     Priorisation pédagogique : si une production complexe est « À travailler » ou « Partiellement acquis », propose de préférence une activité qui prépare une question longue ou un schéma conceptuel; sinon, construis une question qui mobilise une connaissance et une opération intellectuelle faibles. Même lorsqu’une cible est prioritaire, couvre le contexte historique complet de la période et relie explicitement la question à un élément officiel de la progression des apprentissages.
     BALISES OFFICIELLES DU PROGRAMME : ${balisesFocus}
     Déclare obligatoirement "periodeId", "conceptsPfeq" et "connaissancesPfeq". Choisis exactement au moins un concept et une connaissance dans les listes de la période choisie; ne crée aucune balise externe au programme. Le sujet doit répondre à la question directrice de la réalité officielle choisie et mobiliser une rubrique officielle, pas seulement reprendre une balise isolée.
Recherche documentaire contrôlée : utilise uniquement des sources institutionnelles du catalogue fourni par le service. Chaque information factuelle importante doit être soutenue par un document visible ou une source affichée. Pour chaque document de type Iconographique, ajoute une image réelle de Wikimedia Commons avec une URL directe dans "imageUrl", une "imageAlt" et une "imageLicense" égale à "Domaine public" ou "CC BY-SA"; ne fabrique jamais d’URL. Si aucune source du catalogue ne convient, retourne une limite explicite.
Réponds UNIQUEMENT avec un objet JSON valide, sans Markdown :
     {"intention":"${objectif}","titre":"...","objectif":"...","notionCible":"...","operationCible":"...","periodeId":1,"conceptsPfeq":["Concept officiel"],"connaissancesPfeq":["Connaissance officielle"],"consigne":"...","etapes":["..."],"indices":["..."],"champs":[{"id":"...","label":"...","placeholder":"..."}],"documents":[{"titre":"...","typeDoc":"Texte|Iconographique|Carte|Tableau","texte":"Contenu visible par l'élève","reference":"Référence visible","imageUrl":"URL directe Wikimedia si iconographique","imageAlt":"Description accessible si iconographique","imageLicense":"Domaine public ou CC BY-SA si iconographique"}],"sources":[{"institution":"...","titre":"...","url":"https://...","usage":"Ce que la source permet de vérifier"}],"limiteSource":"...","reponseAttendue":"...","criteresCorrection":["..."]}`;
  };

  const genererEntrainement = async () => {
    setChargement("generation"); setErreur(null); setFeedback(null); setActivite(null); setReponses({});
    try {
      await executerGenerationAvecTentatives(async () => {
        const resultat = await onGenerate(construirePromptGeneration(), "generate");
        const activiteNormalisee = normaliserActiviteFocus(extraireJSON(resultat.text), objectif, resultat.sourceCatalog);
        const periodeIdFocus = resoudrePeriodeId(activiteNormalisee.periode, activiteNormalisee.periodeId, periodesSelectionnees[0]);
        if (!Number.isInteger(periodeIdFocus) || !periodesSelectionnees.includes(periodeIdFocus)) {
          throw new Error("L'entraînement généré utilise une période désactivée.");
        }
        activiteNormalisee.periodeId = periodeIdFocus;
        const activiteAvecRattachement = normaliserRattachementPFEQ({
          ...activiteNormalisee,
          periodeId: periodeIdFocus,
        }, periodeIdFocus);
        validerRattachementPFEQ(activiteAvecRattachement, periodeIdFocus);
        activiteAvecRattachement.documents = await enrichirDocumentsAvecVisuels(activiteAvecRattachement.documents, periodeIdFocus, 1);
        if (!documentsIconographiquesComplets(activiteAvecRattachement.documents)) {
          throw new Error("Chaque document iconographique doit avoir une image Wikimedia libre de droits.");
        }
        setActivite(activiteAvecRattachement);
        setEnCours(true);
      });
    } catch (error) {
      setErreur(error instanceof Error ? error.message : "Impossible de créer cet entraînement pour le moment.");
    } finally {
      setChargement(null);
    }
  };

  const reponseComplete = activite?.champs?.every((champ: any) => String(reponses[champ.id] || "").trim().length > 0);

  const corrigerEntrainement = async () => {
    if (!activite || !reponseComplete) {
      setErreur(CONSIGNE_REPONSE_VIDE);
      return;
    }
    setChargement("correction"); setErreur(null);
    const reponseEleve = activite.champs.map((champ: any) => `${champ.label}: ${reponses[champ.id]}`).join("\n");
    const prompt = `Tu es un correcteur pédagogique d'Histoire du Québec et du Canada. Évalue l'activité et la réponse de l'élève ci-dessous sans inventer de faits. Vérifie séparément chaque critère, l'utilisation des documents et les repères historiques. Réponds UNIQUEMENT avec un objet JSON valide, sans Markdown.
ACTIVITÉ : ${JSON.stringify(activite)}
RÉPONSE DE L'ÉLÈVE : ${JSON.stringify(reponseEleve)}
      Retour attendu : {"score":0,"scoreMax":4,"niveau":"À reprendre|En progrès|Solide","commentaire":"Première phrase de diagnostic.\n\nExplication pour aider à formuler la réponse.","pointFort":"...","aTravailler":"...","prochaineEtape":"...","correctionModele":"...","astuceDocumentaire":"Conseil pour exploiter une preuve","sourcesUtiles":["..."]}. Le score doit refléter uniquement les critères de cette activité.`;
    try {
      const resultat = await onGenerate(prompt, "correct");
      const corrige = extraireJSON<any>(resultat.text);
      const score = Math.max(0, Math.min(Number(corrige.score) || 0, Number(corrige.scoreMax) || 4));
      const scoreMax = Math.max(1, Number(corrige.scoreMax) || 4);
      const feedbackNormalise = {
        ...corrige,
        score,
        scoreMax,
        niveau: String(corrige.niveau || (score / scoreMax >= 0.75 ? "Solide" : "En progrès")),
        commentaire: String(corrige.commentaire || "Ta réponse a été relue selon les critères de l’activité."),
        pointFort: String(corrige.pointFort || "Tu as pris le temps de construire une réponse."),
        aTravailler: String(corrige.aTravailler || "Ajoute un repère historique et explique le lien avec la preuve."),
        astuceDocumentaire: String(corrige.astuceDocumentaire || "Repère le mot-clé de la consigne, puis choisis la preuve qui répond directement à la question."),
        prochaineEtape: String(corrige.prochaineEtape || "Relis la consigne et reprends la cible indiquée."),
      };
      setFeedback(feedbackNormalise);
      void onSave({
        module: "Mode focus",
        focusIntention: objectif,
        operation: activite.operationCible,
        notion: activite.notionCible,
         periodeId: activite.periodeId,
         conceptsPfeq: activite.conceptsPfeq,
         connaissancesPfeq: activite.connaissancesPfeq,
        ...(activite.periode ? { periode: activite.periode } : {}),
        consigne: activite.consigne,
        reponse: reponseEleve,
        resultat: feedbackNormalise.commentaire,
        note: `${score}/${scoreMax}`,
        commentaire: feedbackNormalise.aTravailler,
        detailCorrection: feedbackNormalise,
        sources: activite.sources,
      }).catch((error) => {
        console.error(error);
        setErreur("La rétroaction est prête, mais son enregistrement a échoué. Elle reste visible à l’écran.");
      });
      setEnCours(false);
    } catch (error) {
      setErreur(error instanceof Error ? error.message : "La correction ou l’enregistrement a échoué. Ta réponse n’est pas perdue à l’écran : réessaie.");
    } finally {
      setChargement(null);
    }
  };

  return (
    <section className="focus-page">
      <div className="focus-hero">
        <div className="focus-heading">
          <span className="focus-hero-icon"><Timer aria-hidden="true" /></span>
          <div><span className="eyebrow">Une séance à la fois</span><h1>Mode focus</h1><p>Une aide personnalisée à partir de tes réussites et de tes défis. Choisis une intention, puis travaille sur un exercice conçu pour toi.</p></div>
        </div>
        <div className="focus-session">
          <div className="focus-clock-label">Temps de séance</div>
          <div className="focus-clock" aria-live="polite"><Timer aria-hidden="true" /> {minutes}:{reste}</div>
          <div className="focus-actions">
            <button type="button" className="student-primary-action" onClick={() => setEnCours((valeur) => !valeur)}>{enCours ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}<span>{enCours ? "Mettre en pause" : "Commencer la séance"}</span></button>
            <button type="button" className="student-secondary-action" onClick={() => { setEnCours(false); setSecondes(dureeInitiale); }}><RotateCcw aria-hidden="true" /><span>Réinitialiser</span></button>
          </div>
        </div>
      </div>

      <div className="focus-intelligence-grid">
        <div className="focus-intention-panel">
          <div className="focus-panel-heading"><div><span className="eyebrow">Intention</span><h2>Qu’est-ce que tu veux entraîner?</h2></div><Sparkles aria-hidden="true" /></div>
          <div className="focus-intention-options" role="list">
            {FOCUS_INTENTIONS.map((choix) => {
              const Icon = choix.icon;
              return <button type="button" role="listitem" key={choix.id} className={`focus-intention-card ${objectif === choix.id ? "selected" : ""}`} onClick={() => { setObjectif(choix.id); setActivite(null); setFeedback(null); setErreur(null); }}>
                <span className="focus-intention-icon"><Icon aria-hidden="true" /></span><span><strong>{choix.id}</strong><small>{choix.description}</small></span><span className="focus-radio" aria-hidden="true" />
              </button>;
            })}
          </div>
          <div className="focus-target-summary">
            <span className="focus-target-kicker">Cible proposée</span>
            <strong>{prioritePrincipale ? prioritePrincipale.label : "Un premier portrait de tes compétences"}</strong>
            <span>{prioritePrincipale ? `${prioritePrincipale.score}% · ${prioritePrincipale.total} exercice${prioritePrincipale.total > 1 ? "s" : ""}` : "Aucun résultat antérieur : l’activité servira de point de départ."}</span>
          </div>
          <button type="button" className="focus-generate-button" onClick={genererEntrainement} disabled={chargement !== null}>
            {chargement === "generation" ? <><LoaderCircle className="spin" aria-hidden="true" /> Création de ton activité…</> : <><Sparkles aria-hidden="true" /> Créer mon entraînement personnalisé</>}
          </button>
        </div>

         <div className="focus-analysis-panel">
           <div className="focus-panel-heading"><div><span className="eyebrow">Analyse de ta progression</span><h2>Ce que tu maîtrises et ce que tu reprends</h2></div><BarChart3 aria-hidden="true" /></div>
            <p className="focus-analysis-note">Les statuts reposent uniquement sur les résultats enregistrés : 75 % et plus = réussi, 50 à 74 % = partiellement acquis, moins de 50 % = à travailler. Chaque cible affiche aussi le nombre de critères évalués; une cible sans résultat reste « pas encore évaluée ».</p>
           <div className="focus-analysis-domain">
              <div className="focus-analysis-domain-heading"><span className="eyebrow">Progression des apprentissages</span><h3>Connaissances et concepts</h3><p>Les connaissances évaluées dans les réponses courtes sont reliées à leurs critères d’exactitude, de repère, de réponse et de preuve.</p></div>
             {analyse.progression.connaissances.length === 0 && analyse.progression.concepts.length === 0
               ? <div className="focus-empty-analysis"><CheckCircle2 aria-hidden="true" /><p>Aucun élément de la progression n’a encore été évalué. Les prochaines activités établiront ce portrait.</p></div>
               : <>
                 <FocusStatusBoard title="Connaissances" description="Les faits, acteurs, institutions et réalités historiques ciblés." items={analyse.progression.connaissances} />
                 <FocusStatusBoard title="Concepts" description="Les concepts officiels utilisés pour organiser la matière." items={analyse.progression.concepts} />
               </>}
           </div>
           <div className="focus-analysis-domain">
              <div className="focus-analysis-domain-heading"><span className="eyebrow">Les 7 opérations intellectuelles</span><h3>Habiletés de raisonnement historique</h3><p>Chaque opération est affichée séparément et chaque résultat vérifie ses critères obligatoires, y compris lorsqu’elle n’a pas encore été évaluée.</p></div>
              <FocusStatusBoard title="Opérations intellectuelles" description="Établir des faits, situer, mettre en relation, comparer, expliquer des causes, établir une causalité et déterminer les continuités ou changements." items={analyse.operations} />
           </div>
           <div className="focus-analysis-domain">
             <div className="focus-analysis-domain-heading"><span className="eyebrow">Productions complexes</span><h3>Question longue et schéma conceptuel</h3><p>Ces formats sont suivis à part pour proposer ensuite une activité du même type lorsqu’ils sont moins bien réussis.</p></div>
             <FocusStatusBoard title="Formats de production" description="Rédiger une question élaborée ou organiser une preuve dans un schéma conceptuel." items={analyse.formats} />
           </div>
         </div>
      </div>

      {erreur && <div className="focus-alert focus-alert--error" role="alert"><AlertCircle aria-hidden="true" /><span>{erreur}</span></div>}

      {activite && <article className="focus-activity-card">
        <div className="focus-activity-header"><div><span className="eyebrow">Ton entraînement</span><h2>{activite.titre}</h2><p>{activite.objectif}</p></div><div className="focus-activity-tags"><span>{activite.notionCible}</span><span>{activite.operationCible}</span></div></div>
        {activite.intention === "Relire et corriger" && activite.reponsePrecedente && <div className="focus-previous-answer"><span>Réponse précédente à reprendre</span><p>{activite.reponsePrecedente}</p></div>}
        <div className="focus-instruction"><strong>Consigne</strong><p>{activite.consigne}</p></div>
        {activite.etapes.length > 0 && <ol className="focus-steps">{activite.etapes.map((etape: string, index: number) => <li key={`${etape}-${index}`}>{etape}</li>)}</ol>}
        {activite.documents.length > 0 && <div className="focus-documents"><div className="focus-subheading"><BookOpen aria-hidden="true" /><strong>Dossier documentaire</strong></div><div className="focus-document-grid">{activite.documents.map((document: any, index: number) => <DocumentCard document={document} index={index} key={`${document.titre || "document"}-${index}`} accent="var(--accent)" />)}</div></div>}
        {activite.indices?.length > 0 && <details className="focus-hints"><summary>Afficher les indices progressifs</summary><ol>{activite.indices.slice(0, 4).map((indice: string, index: number) => <li key={`${indice}-${index}`}>{indice}</li>)}</ol></details>}
        <div className="focus-answer-fields">{activite.champs.map((champ: any) => <label className="focus-answer-field" key={champ.id}><span>{champ.label}</span><textarea value={reponses[champ.id] || ""} onChange={(event) => setReponses((avant) => ({ ...avant, [champ.id]: event.target.value }))} placeholder={champ.placeholder} rows={champ.id === "revision" || activite.champs.length === 1 ? 6 : 4} /></label>)}</div>
        <div className="focus-submit-row"><span>{reponseComplete ? "Toutes les parties sont prêtes." : "Complète les parties demandées pour recevoir un retour ciblé."}</span><button type="button" className="student-primary-action" onClick={corrigerEntrainement} disabled={chargement !== null}>corrige.moi</button></div>
        {activite.sources.length > 0 && <div className="focus-sources"><div className="focus-subheading"><ExternalLink aria-hidden="true" /><strong>Sources consultées et affichées</strong></div><div className="focus-source-list">{activite.sources.map((source: any, index: number) => <a href={source.url} target="_blank" rel="noreferrer" key={`${source.url}-${index}`}><span><strong>{source.institution || "Source institutionnelle"}</strong><small>{source.titre || source.url}</small>{source.usage && <small>{source.usage}</small>}</span><ExternalLink aria-hidden="true" /></a>)}</div></div>}
        {activite.limiteSource && <p className="focus-source-limit"><strong>Limite documentaire :</strong> {activite.limiteSource}</p>}
      </article>}

      {feedback && <section className="focus-feedback" aria-live="polite">
        <div className="focus-feedback-score"><span>Retour sur ta réponse</span><strong>{feedback.score}/{feedback.scoreMax}</strong><small>{feedback.niveau}</small></div>
        <div className="focus-feedback-body">
          <FeedbackNarratif commentaire={feedback.commentaire} encouragement={feedback.pointFort} />
           <FeedbackBlocs
             feedback={feedback}
             reponse={Object.values(reponses).join(" ")}
             hasDocuments={(activite?.documents || []).length > 0}
             encouragerPhraseComplete
           />
          <div className="focus-next-step"><strong>Prochaine étape</strong><p>{feedback.prochaineEtape}</p></div>
          {feedback.correctionModele && <details><summary>Voir un exemple de formulation</summary><p>{feedback.correctionModele}</p></details>}
        </div>
      </section>}
    </section>
  );
}

function ReglesEtConfidentialite() {
  const sources = [
    {
      label: "Commission d’accès à l’information du Québec — Loi modernisant les dispositions en matière de protection des renseignements personnels",
      url: "https://www.cai.gouv.qc.ca/entreprises/loi-modernisant-dispositions-protection-renseignements-personnels",
    },
    {
      label: "CAI Québec — Consentement des personnes concernées",
      url: "https://www.cai.gouv.qc.ca/protection-renseignements-personnels/information-entreprises-privees/consentement-personnes-entreprises",
    },
    {
      label: "CAI Québec — Conservation et destruction des renseignements personnels",
      url: "https://www.cai.gouv.qc.ca/protection-renseignements-personnels/information-entreprises-privees/conservation-destruction-renseignements-personnels",
    },
    {
      label: "CAI Québec — Incidents de confidentialité et mesures de sécurité",
      url: "https://www.cai.gouv.qc.ca/protection-renseignements-personnels/information-entreprises-privees/incidents-confidentialite-mesures-securite-entreprises",
    },
    {
      label: "Commissariat à la protection de la vie privée du Canada — LPRPDE/PIPEDA",
      url: "https://www.priv.gc.ca/en/privacy-topics/privacy-laws-in-canada/the-personal-information-protection-and-electronic-documents-act-pipeda/",
    },
  ];

  return (
    <section className="rules-setting" aria-labelledby="rules-setting-title">
      <div className="rules-setting-heading">
        <div>
          <span className="eyebrow">Transparence et protection</span>
          <h2 id="rules-setting-title">Conditions, données et sécurité</h2>
        </div>
        <p>Une fiche claire pour savoir ce que l’application fait de tes informations.</p>
      </div>

      <div className="rules-notice">
        <strong>Version du 2 septembre 2026</strong>
        <span>Cette fiche résume les pratiques de l’application. Elle ne remplace pas une politique juridique validée par l’organisation responsable.</span>
      </div>

      <div className="rules-accordion">
        <details open>
          <summary><span className="rules-summary-index">01</span><span><strong>Conditions d’utilisation</strong><small>Utiliser l’application dans un cadre scolaire et respectueux</small></span></summary>
          <div className="rules-content">
            <ul>
              <li>Histoire Québec est un outil d’entraînement pédagogique. Les activités et les rétroactions générées peuvent contenir des erreurs : vérifie toujours les faits avec ton enseignant ou une source fiable.</li>
              <li>Utilise uniquement le code d’accès qui t’a été remis. Ne le publie pas et ne l’utilise pas pour consulter les résultats d’une autre personne.</li>
              <li>N’inscris pas de renseignements sensibles ou inutiles dans une réponse : adresse, téléphone, santé, situation familiale, numéro d’assurance sociale, photos ou informations sur une autre personne.</li>
              <li>Respecte les droits d’auteur, les personnes et les règles de ton établissement. Les images historiques affichées sont sélectionnées dans Wikimedia Commons avec une licence autorisée indiquée dans le dossier.</li>
              <li>L’accès peut être interrompu pour maintenance, sécurité ou mise à jour. L’application ne remplace pas le jugement professionnel de l’enseignant ni un relevé officiel.</li>
            </ul>
          </div>
        </details>

        <details>
          <summary><span className="rules-summary-index">02</span><span><strong>Renseignements personnels et données</strong><small>Ce qui est recueilli, pourquoi et avec qui</small></span></summary>
          <div className="rules-content">
            <p><strong>Données pouvant être enregistrées :</strong> nom ou identifiant affiché, code d’accès, niveau, périodes choisies, réponses, notes de lecture, résultats, rétroactions, date de l’activité et préférence clair/sombre du navigateur.</p>
            <p><strong>Utilités :</strong> ouvrir le bon parcours, générer une activité adaptée, sauvegarder les résultats et permettre leur consultation par le groupe ou l’enseignant autorisé.</p>
            <p><strong>Ce qui n’est pas fait :</strong> les données ne sont pas vendues et aucun affichage publicitaire n’est configuré dans cette interface. La recherche Wikimedia reçoit seulement les paramètres nécessaires à la recherche de visuels historiques, pas le nom ni la réponse de l’élève.</p>
            <p><strong>Services utilisés :</strong> les résultats sont enregistrés dans Firebase/Firestore et les demandes de génération sont transmises au service configuré par l’application. Ces fournisseurs peuvent traiter des données hors Québec : l’organisation responsable doit effectuer les évaluations et ententes exigées avant tout transfert.</p>
            <p><strong>Élèves mineurs :</strong> utilise seulement l’identifiant prévu par l’école et demande à ton parent, tuteur ou établissement toute autorisation requise. L’utilisation ne doit pas servir à recueillir plus d’informations que nécessaire.</p>
            <p><strong>Accès, correction et suppression :</strong> pour demander une copie, une correction, le retrait d’une donnée ou poser une question, contacte l’établissement ou l’administrateur qui t’a remis le code d’accès. Le nom légal de l’organisation, le responsable de la protection des renseignements personnels et ses coordonnées doivent être affichés ici avant la mise en production.</p>
          </div>
        </details>

        <details>
          <summary><span className="rules-summary-index">03</span><span><strong>Sécurité et incidents</strong><small>Réduire les risques et savoir quoi faire</small></span></summary>
          <div className="rules-content">
            <ul>
              <li>Les communications avec l’application doivent utiliser une connexion HTTPS. Les accès aux données doivent être limités aux personnes et services qui en ont besoin.</li>
              <li>Protège ton code d’accès, ferme ta session sur un appareil partagé et signale immédiatement une activité inhabituelle à ton enseignant ou à l’administrateur du groupe.</li>
              <li>En cas d’incident de confidentialité, l’organisation responsable doit documenter l’incident, réduire le risque, évaluer le préjudice sérieux et aviser les personnes concernées et la Commission lorsque la loi l’exige.</li>
              <li>Les données doivent être conservées seulement pendant la durée nécessaire, puis détruites ou anonymisées de façon sécuritaire selon la politique de l’organisation responsable.</li>
            </ul>
            <div className="rules-contact-placeholder">
              <strong>Responsable de la protection des renseignements personnels</strong>
              <span>À compléter par l’organisation responsable : nom légal, courriel et moyen de contact.</span>
            </div>
          </div>
        </details>

        <details>
          <summary><span className="rules-summary-index">04</span><span><strong>Références officielles</strong><small>Consulter les règles du Québec et du Canada</small></span></summary>
          <div className="rules-content rules-source-list">
            {sources.map((source) => (
              <a href={source.url} target="_blank" rel="noopener noreferrer" key={source.url}>
                <span>{source.label}</span>
                <ExternalLink aria-hidden="true" />
              </a>
            ))}
          </div>
        </details>
      </div>
    </section>
  );
}


export default function App({ niveauInitial }: { niveauInitial?: 3 | 4 }) {
  const [showSplash, setShowSplash] = useState(true);
  const [isFading, setIsFading] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      return window.localStorage.getItem('corrige-histoire-theme-mode') === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      window.localStorage.setItem('corrige-histoire-theme-mode', theme);
    } catch {
      // Le thème reste actif pour la session même si le stockage est indisponible.
    }
  }, [theme]);

  useEffect(() => {
    const timerFade = setTimeout(() => setIsFading(true), 2000);
    const timerRemove = setTimeout(() => setShowSplash(false), 3000);
    return () => { clearTimeout(timerFade); clearTimeout(timerRemove); };
  }, []);

  const [currentView, setCurrentView] = useState("menu"); 
  const [accueilEtape, setAccueilEtape] = useState<"periodes" | "entrainements">("periodes");
  const [niveauScolaire, setNiveauScolaire] = useState<3 | 4 | null>(() => {
    if (niveauInitial === 3 || niveauInitial === 4) return niveauInitial;
    const niveauUrl = Number(new URLSearchParams(window.location.search).get("niveau"));
    return niveauUrl === 3 || niveauUrl === 4 ? niveauUrl : null;
  });
  const [studentTab, setStudentTab] = useState<'accueil' | 'progres' | 'focus' | 'profil' | 'notifications'>('accueil');
  const [studentName, setStudentName] = useState("");
  const [codeUtilise, setCodeUtilise] = useState(""); 
  const [accesRefuse, setAccesRefuse] = useState(false);
  const [historiqueResultats, setHistoriqueResultats] = useState<any[]>([]);
  const generationVariationRef = useRef(0);
  const espaceTempsGenerationRef = useRef(0);
  const questionsDejaGenereesRef = useRef<string[]>([]);
  const [pushPromptVisible, setPushPromptVisible] = useState(false);
  const [pushActivationEnCours, setPushActivationEnCours] = useState(false);
  const [pushMessage, setPushMessage] = useState("");

  const [periodesPermises, setPeriodesPermises] = useState<number[]>([]);
  const [periodesSelectionnees, setPeriodesSelectionnees] = useState<number[]>([]);
  const [operationsSelectionnees, setOperationsSelectionnees] = useState<string[]>([]);
  const [difficulteGroupe, setDifficulteGroupe] = useState<number>(3); // NIVEAU DE DIFFICULTÉ

  // GESTION DES ERREURS
  const [erreurGlobal, setErreurGlobal] = useState<string | null>(null);

  const deconnecterEleve = () => {
    void signOut(auth).catch((error) => {
      console.error("Erreur de déconnexion élève", error);
    });
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nom = params.get('nom'); const code = params.get('code');
    const sessionEleveDemo = import.meta.env.DEV
      && ["section-a", "section-b"].includes(params.get("demo") || "")
      && code?.trim().toUpperCase() === "HB_-423-01";
    if (nom && code) {
      setStudentName(nom); setCodeUtilise(code);
      const fetchGroupeInfo = async () => {
        try {
          if (sessionEleveDemo) {
            setPeriodesPermises(PERIODES_HISTORIQUES.map((periode) => Number(periode.id)));
            setDifficulteGroupe(3);
            if (params.get("demo") === "section-a") {
              setPeriodesSelectionnees([1]);
              setParcoursA("operations");
              setCurrentView("sectionA");
            }
            return;
          }
          const codeNettoye = code.trim().toUpperCase();
          const q = query(collection(db, 'groupes'), where('codes', 'array-contains', codeNettoye));
          const snap = await getDocs(q);
          if (!snap.empty) {
            const data = snap.docs[0].data();
            const liste = Array.isArray(data.periodesDebloquees) ? data.periodesDebloquees : [];
            setPeriodesPermises(liste);
            setDifficulteGroupe(data.difficulte || 3); // LECTURE DE LA DIFFICULTÉ DU PROF
          }
        } catch (e) { console.error("Erreur récupération groupe", e); }
      };
      fetchGroupeInfo();
    } else {
      setAccesRefuse(true);
    }
  }, []);

  useEffect(() => {
    if (!codeUtilise) return;
    const chargerHistorique = async () => {
      try {
        setHistoriqueResultats(await chargerResultatsEleve(codeUtilise));
      } catch (error) {
        console.error("Erreur récupération progression", error);
      }
    };
    chargerHistorique();
  }, [codeUtilise]);

  useEffect(() => {
    if (!codeUtilise || !studentName || showSplash) return;
    let actif = true;
    const timer = window.setTimeout(() => {
      void getPushAvailability().then(async (availability) => {
        if (!actif || !availability.supported || !availability.configured) return;
        if (availability.permission === "granted") {
          try {
            await enablePushNotifications({ studentCode: codeUtilise, studentName, level: niveauScolaire });
            await reportPushActivity({
              studentCode: codeUtilise,
              studentName,
              level: niveauScolaire,
              event: "app-opened",
            });
          } catch {
            // La notification ne doit jamais interrompre l’accès à l’espace élève.
          }
          return;
        }
        if (shouldPromptForPush()) setPushPromptVisible(true);
      });
    }, 4_000);
    return () => {
      actif = false;
      window.clearTimeout(timer);
    };
  }, [codeUtilise, niveauScolaire, showSplash, studentName]);

  const activerPush = async () => {
    setPushActivationEnCours(true);
    setPushMessage("");
    try {
      await enablePushNotifications({ studentCode: codeUtilise, studentName, level: niveauScolaire });
      setPushPromptVisible(false);
      setPushMessage("Les notifications sont activées sur cet appareil.");
    } catch (error) {
      setPushMessage(error instanceof Error ? error.message : "Impossible d’activer les notifications.");
    } finally {
      setPushActivationEnCours(false);
    }
  };

  const reporterPush = () => {
    postponePushPrompt();
    setPushPromptVisible(false);
    setPushMessage("");
  };

  useEffect(() => {
    if (!niveauScolaire || periodesPermises.length === 0) return;
    const idsNiveau: number[] = PERIODES_HISTORIQUES.filter((periode) => periode.niveau === niveauScolaire && periodesPermises.includes(periode.id)).map((periode) => Number(periode.id));
    setPeriodesSelectionnees((selectionActuelle) => {
      return selectionActuelle.filter((id) => idsNiveau.includes(id));
    });
  }, [niveauScolaire, periodesPermises]);

  const naviguerEspaceEleve = (tab: 'accueil' | 'progres' | 'focus' | 'profil' | 'notifications') => {
    setStudentTab(tab);
    if (tab === 'accueil') {
      setAccueilEtape(periodesSelectionnees.length > 0 ? "entrainements" : "periodes");
      setCurrentView('menu');
    }
    else setCurrentView('dashboard');
  };

  const selectionnerNiveau = (niveau: 3 | 4) => {
    setNiveauScolaire(niveau);
    setAccueilEtape("periodes");
    setPeriodesSelectionnees([]);
    setCurrentView("menu");
    setStudentTab("accueil");
    setBanqueQuestionsA([]);
    setQuestionB(null);
    setQuestionSchemaB(null);
    setCurrentOp(null);
    setOperationsSelectionnees([]);
    setNotesDocumentsSchemaB({});
    setQuestionC(null);
    setNotesDocumentsC({});
    setErreurGlobal(null);
    const params = new URLSearchParams(window.location.search);
    params.set("niveau", String(niveau));
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
  };

  const ouvrirEntrainements = () => {
    if (periodesSelectionnees.length === 0) {
      setErreurGlobal("Sélectionne au moins une période historique pour voir les entraînements.");
      return;
    }
    setErreurGlobal(null);
    setAccueilEtape("entrainements");
  };

  const nomPeriodesSelectionnees = PERIODES_HISTORIQUES
    .filter((periode) => periodesSelectionnees.includes(periode.id))
    .map((periode) => periode.titre)
    .join(" · ");
  const libellePeriodesSelectionnees = periodesSelectionnees.length === 1
    ? "Période choisie"
    : "Périodes choisies";

  const togglePeriodeEleve = (id: number) => {
    setPeriodesSelectionnees(prev => {
      const newState = prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id];
      return newState.sort((a, b) => a - b);
    });
    setErreurGlobal(null);
    setQuestionsB([]);
    setCurrentOp(null);
    if (currentView === 'sectionA') setBanqueQuestionsA([]);
    if (currentView === 'sectionB') {
      setQuestionB(null); setFeedbackB(null); setReponseB("");
      setQuestionSchemaB(null); setFeedbackSchemaB(null); setSelectionsSchemaB({}); setReponsesSchemaB({});
      setReponseCentraleSchemaB(""); setSousReponsesSchemaB({}); setNotesDocumentsSchemaB({});
    }
    if (currentView === 'sectionC' || questionC) {
      setQuestionC(null); setFeedbackC(null); setReponseC(""); setPlanReponseC("");
      setPlanStructureC(PLAN_INITIAL_C); setNotesDocumentsC({});
    }
  };

  const toggleOperation = (operationId: string) => {
    setOperationsSelectionnees((selectionActuelle) => {
      const nouvelleSelection = selectionActuelle.includes(operationId)
        ? selectionActuelle.filter((id) => id !== operationId)
        : [...selectionActuelle, operationId];
      return OPERATIONS.filter((operation) => nouvelleSelection.includes(operation.id)).map((operation) => operation.id);
    });
    setCurrentOp(null);
    setQuestionB(null);
    setQuestionsB([]);
    setErreurGlobal(null);
  };

  // --- TRADUCTION DE LA DIFFICULTÉ EN PROMPT IA ---
  function genererConsigneDifficulte() {
    switch(difficulteGroupe) {
      case 1: return "\nNIVEAU DE LECTURE (1/5) : Utilise un vocabulaire très simple, des phrases courtes et des concepts très explicites. Adapté pour des élèves en difficulté d'apprentissage.";
      case 2: return "\nNIVEAU DE LECTURE (2/5) : Utilise un vocabulaire accessible et des structures de phrases simples.";
      case 3: return "\nNIVEAU DE LECTURE (3/5) : Utilise un vocabulaire standard adapté à des élèves réguliers de 4e secondaire.";
      case 4: return "\nNIVEAU DE LECTURE (4/5) : Utilise un vocabulaire riche, soutenu et des textes plus denses.";
      case 5: return "\nNIVEAU DE LECTURE (5/5) : Utilise un vocabulaire académique complexe, des textes denses avec des concepts implicites. Exige une analyse approfondie.";
      default: return "\nNIVEAU DE LECTURE : Utilise un vocabulaire standard.";
    }
  }

  function genererContexteTemporel() {
    if (periodesSelectionnees.length === 0) return "";
    const periodesChoisies = PERIODES_HISTORIQUES.filter(p => periodesSelectionnees.includes(p.id));
    let consigne = `\nCONTRAINTE DE TEMPS ABSOLUE : le sujet doit appartenir à une seule période sélectionnée et respecter strictement ses dates. Périodes autorisées : ${periodesChoisies.map(p => `[Période ${p.id}: ${p.titre}]`).join(', ')}.`;
    consigne += ` N'utilise aucun fait, concept, acteur ou événement extérieur aux dates de la période choisie. Si plusieurs périodes sont sélectionnées, compare uniquement des réalités appartenant aux périodes sélectionnées, sans ajouter de période antérieure ou postérieure.`;
    consigne += `\nBALISES OFFICIELLES DU PROGRAMME À RESPECTER :\n${contextePFEQ(periodesSelectionnees)}\nPour chaque activité, déclare "conceptsPfeq" et "connaissancesPfeq" en reprenant exactement au moins un concept et une connaissance de la période choisie. N'invente aucune balise et n'élargis pas le programme.`;
    consigne += `\nALIGNEMENT SUR LA RÉALITÉ : le sujet et la consigne de chaque activité doivent répondre à la question directrice de la réalité officielle choisie et mobiliser au moins une de ses rubriques. Ne te contente pas d'ajouter une balise PFEQ à une question hors sujet.`;
    consigne += `\nRÈGLE DE COPIE DES BALISES : pour chaque objet généré, "periodeId" doit correspondre à une période sélectionnée, puis "conceptsPfeq" et "connaissancesPfeq" doivent reprendre caractère pour caractère une valeur de la même réalité officielle. Ne choisis jamais une balise d'une autre période.`;
    consigne += `\nBALISES COURTES PAR PÉRIODE SÉLECTIONNÉE : ${periodesChoisies.map((periode) => {
      const realite = trouverRealitePFEQ(periode.id);
      return realite
        ? `Période ${realite.id} — concepts autorisés : ${realite.concepts.join(" | ")} — connaissances autorisées : ${realite.connaissances.join(" | ")}`
        : `Période ${periode.id} — référentiel indisponible`;
    }).join("\n")}`;
    consigne += `\n${CONSIGNE_ORTHOGRAPHE_NOMS}`;
    return consigne;
  }

  function genererConsigneDiversite(cycle: number, focus = "l’activité") {
    const periodes = PERIODES_HISTORIQUES
      .filter((periode) => periodesSelectionnees.includes(periode.id))
      .map((periode) => {
        const realite = trouverRealitePFEQ(periode.id);
        return `Période ${periode.id} — ${periode.titre}; rubriques à alterner : ${realite?.rubriques.join(" | ") || "référentiel indisponible"}; connaissances à couvrir : ${realite?.connaissances.join(" | ") || "référentiel indisponible"}`;
      })
      .join("\n");
    const dejaVues = [
      ...historiqueResultats.slice(-12).map((resultat) => `${resultat.periode || "période inconnue"} — ${resultat.operation || resultat.section || "activité"} — ${resultat.consigne || ""}`),
      ...questionsDejaGenereesRef.current.slice(-12),
    ].filter(Boolean);
    return `
DIVERSITÉ OBLIGATOIRE POUR ${focus.toUpperCase()} :
- Alterne les rubriques, connaissances officielles, acteurs, événements, repères et aspects de société; ne recommence pas le même angle tant que les autres angles de la période n’ont pas été utilisés.
- Répartis les activités entre toutes les périodes sélectionnées; chaque période doit apparaître au moins une fois dans un lot.
- Le cycle de variation actuel est ${cycle}. Change réellement le fait historique, la source, l’angle, le format de réponse et la méthode demandée; ne fais pas une simple paraphrase.
- Respecte uniquement les dates de chaque période et les critères propres à l’opération; ne révèle jamais la réponse dans la consigne.
PÉRIODES, RUBRIQUES ET CONNAISSANCES À COUVRIR :
${periodes}
QUESTIONS OU CONSIGNES DÉJÀ VUES À ÉVITER :
${dejaVues.length ? dejaVues.map((item) => `- ${item}`).join("\n") : "- aucune activité précédente connue"}
`;
  }

  function memoriserQuestionsGenerees(questions: any[], operation?: string) {
    const nouvelles = questions
      .map((question) => {
        const consigne = String(question?.consigne || question?.question || "").trim();
        const periode = String(question?.periode || question?.periodeId || "").trim();
        const operationId = String(question?.operationId || operation || "").trim();
        return consigne ? `${periode} — ${operationId} — ${consigne}` : "";
      })
      .filter(Boolean);
    questionsDejaGenereesRef.current = [...questionsDejaGenereesRef.current, ...nouvelles].slice(-30);
  }

  const [currentOp, setCurrentOp] = useState<any>(null);
  const [questionsB, setQuestionsB] = useState<DossierOperationB[]>([]);
  const [modeSectionB, setModeSectionB] = useState<'operations' | 'schema'>('schema');
  const [questionB, setQuestionB] = useState<any>(null);
  const [loadingQuestionB, setLoadingQuestionB] = useState(false);
  const [reponseB, setReponseB] = useState("");
  const [loadingCorrectionB, setLoadingCorrectionB] = useState(false);
  const [feedbackB, setFeedbackB] = useState<any>(null);
  const [questionSchemaB, setQuestionSchemaB] = useState<any>(null);
  const [loadingSchemaB, setLoadingSchemaB] = useState(false);
  const [selectionsSchemaB, setSelectionsSchemaB] = useState<Record<string, number[]>>({});
  const [reponsesSchemaB, setReponsesSchemaB] = useState<Record<number, string>>({});
  const [reponseCentraleSchemaB, setReponseCentraleSchemaB] = useState("");
  const [sousReponsesSchemaB, setSousReponsesSchemaB] = useState<Record<string, string>>({});
  const [notesDocumentsSchemaB, setNotesDocumentsSchemaB] = useState<Record<number, string>>({});
  const [feedbackSchemaB, setFeedbackSchemaB] = useState<any>(null);
  const schemaFeedbackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!feedbackSchemaB) return;
    const frame = requestAnimationFrame(() => {
      schemaFeedbackRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      schemaFeedbackRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [feedbackSchemaB]);

  const [placementOrdre, setPlacementOrdre] = useState<(number | null)[]>([]);
  const [placementAvantApres, setPlacementAvantApres] = useState<Record<number, 'avant' | 'apres'>>({});
  const [selectedDocIndex, setSelectedDocIndex] = useState<number | null>(null);
  const [selectedChronologyOption, setSelectedChronologyOption] = useState<number | null>(null);
  const [resultatSituerTemps, setResultatSituerTemps] = useState<any>(null);
  const [lieuSelectionne, setLieuSelectionne] = useState<string | null>(null);
  const [resultatSituerEspace, setResultatSituerEspace] = useState<any>(null);
  const [modeCarteComparaison, setModeCarteComparaison] = useState<'identifier' | 'comparer'>('identifier');

  const [banqueQuestionsA, setBanqueQuestionsA] = useState<any[]>([]); 
  const [currentIndexA, setCurrentIndexA] = useState(0); 
  const [loadingQuestionA, setLoadingQuestionA] = useState(false);
  const [generationProgressA, setGenerationProgressA] = useState<{ stage: string; percent: number }>({ stage: "queued", percent: 0 });
  const sectionAGenerationIdRef = useRef<string | null>(null);
  const sectionAGenerationInFlightRef = useRef(false);
  const sectionAResumeRestoredRef = useRef(false);
  const [generationAConfigGemini, setGenerationAConfigGemini] = useState(false);
  const [generationAJobExpire, setGenerationAJobExpire] = useState(false);
  const [loadingCorrectionA, setLoadingCorrectionA] = useState(false);
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);
  const [reponseCourteA, setReponseCourteA] = useState("");
  const [reponsesStructureA, setReponsesStructureA] = useState<Record<string, string>>({});
  const [annonceReponseStructureA, setAnnonceReponseStructureA] = useState("");
  const [ordreChronologiqueA, setOrdreChronologiqueA] = useState<number[]>([]);
  const [erreurFormatA, setErreurFormatA] = useState<string | null>(null);
  const [feedbackA, setFeedbackA] = useState<any>(null);
  const [isAnswerValidated, setIsAnswerValidated] = useState(false);
  const [savingQcmA, setSavingQcmA] = useState(false);
  const [scoreA, setScoreA] = useState({ correct: 0, total: 0 });
  const [parcoursA, setParcoursA] = useState<'reponses' | 'operations'>('reponses');

  const [questionC, setQuestionC] = useState<any>(null);
  const [loadingQuestionC, setLoadingQuestionC] = useState(false);
  const [reponseC, setReponseC] = useState("");
  const [planReponseC, setPlanReponseC] = useState("");
  const [planStructureC, setPlanStructureC] = useState(PLAN_INITIAL_C);
  const [loadingCorrectionC, setLoadingCorrectionC] = useState(false);
  const [feedbackC, setFeedbackC] = useState<any>(null);
  const [activeDocIndex, setActiveDocIndex] = useState(0);
  const [notesDocumentsC, setNotesDocumentsC] = useState<Record<number, string>>({});

  async function callGenerationService(
    action: string,
    payload: any,
    options?: Parameters<typeof appelerFocusTraining>[3],
  ) {
    const actionAPI = action === "generer" ? "generate" : action === "corriger" ? "correct" : null;
    if (!actionAPI) throw new Error("Action de formation inconnue.");
    return appelerFocusTraining(actionAPI, payload.prompt, fetch, options);
  }

  function afficherErreurGeneration(parcours: string, error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Échec de la génération pédagogique", { parcours, message });
    if (error instanceof FocusTrainingError && error.code === "GEMINI_NOT_CONFIGURED") {
      if (parcours === "section-a") setGenerationAConfigGemini(true);
      setErreurGlobal(
        "La génération est arrêtée parce que le service Gemini n’est pas configuré. Demande à un administrateur d’ajouter GEMINI_API_KEY dans les variables d’environnement Netlify, puis de redéployer le site avant de lancer une nouvelle génération. Aucune demande n’est relancée automatiquement.",
      );
      return;
    }
    if (error instanceof FocusTrainingError && error.code === "FOCUS_TRAINING_JOB_EXPIRED") {
      if (parcours === "section-a") setGenerationAJobExpire(true);
      setErreurGlobal("Cette génération n’est plus disponible. Lance une nouvelle génération.");
      return;
    }
    if (error instanceof FocusTrainingError && error.code === "FOCUS_TRAINING_TRACKING_UNAVAILABLE") {
      setErreurGlobal("Le suivi de la génération est temporairement indisponible. Réessaie dans quelques instants.");
      return;
    }
    setErreurGlobal(message || "La génération a échoué pour une raison inconnue.");
  }

  async function callFocusService(prompt: string, action: "generate" | "correct") {
    return appelerFocusTraining(action, prompt);
  }

  async function sauvegarderDansFirestore(donnees: any) {
    try {
      const resultatNormalise = preparerResultatPourSauvegarde(donnees, codeUtilise, parcoursA);
      const activitePush = {
        studentCode: codeUtilise,
        studentName,
        level: niveauScolaire,
        event: "result-saved" as const,
        score: resultatNormalise.note || resultatNormalise.resultat,
        operation: resultatNormalise.operation || resultatNormalise.section,
      };
      const resultatSupabase = await ecrireResultatSupabase(codeUtilise, resultatNormalise);
      if (resultatSupabase) {
        setHistoriqueResultats((resultatsActuels) => ajouterResultatLocal(
          resultatsActuels,
          resultatSupabase.id,
          resultatSupabase,
          new Date(String(resultatSupabase.horodatage || Date.now())),
        ));
        void reportPushActivity(activitePush);
        return;
      }
      const documentCree = await addDoc(collection(db, "resultats_eleves"), {
        ...resultatNormalise,
        horodatage: serverTimestamp()
      });
      setHistoriqueResultats((resultatsActuels) => ajouterResultatLocal(resultatsActuels, documentCree.id, resultatNormalise));
      void reportPushActivity(activitePush);
    } catch (erreur) {
      console.error("Erreur ajout document : ", erreur);
      setErreurGlobal("La correction est prête, mais son enregistrement a échoué. Réessaie avant de poursuivre afin de conserver ta progression.");
      throw erreur;
    }
  }

  // --- LOGIQUE GÉNÉRATION ---
  function exigerUnePeriodeSelectionnee() {
    if (periodesSelectionnees.length > 0) return true;
    setErreurGlobal("Active au moins une période avant de générer une activité.");
    return false;
  }

  function obtenirNiveauPourResultat(): 3 | 4 {
    if (niveauScolaire === 3 || niveauScolaire === 4) return niveauScolaire;
    const niveaux = new Set(
      PERIODES_HISTORIQUES
        .filter((periode) => periodesSelectionnees.includes(periode.id))
        .map((periode) => periode.niveau),
    );
    if (niveaux.size === 1) return [...niveaux][0] as 3 | 4;
    throw new Error("Le niveau scolaire ne peut pas être déterminé.");
  }

  function periodeAutorisee(periodeId: unknown): boolean {
    const id = Number(periodeId);
    return Number.isInteger(id) && periodesSelectionnees.includes(id) && periodesPermises.includes(id);
  }

  async function reparerRattachementPFEQ(promptOriginal: string, objet: any): Promise<any> {
    const realite = trouverRealitePFEQ(objet?.periodeId);
    if (!realite) return objet;
    const concepts = Array.isArray(objet?.conceptsPfeq) ? objet.conceptsPfeq.map(String) : [];
    const connaissances = Array.isArray(objet?.connaissancesPfeq) ? objet.connaissancesPfeq.map(String) : [];
    const conceptsValides = [...new Set(concepts.filter((concept: string) => realite.concepts.includes(concept)))];
    const connaissancesValides = [...new Set(connaissances.filter((connaissance: string) => realite.connaissances.includes(connaissance)))];
    if (conceptsValides.length > 0 && connaissancesValides.length > 0) {
      return {
        ...objet,
        conceptsPfeq: conceptsValides,
        connaissancesPfeq: connaissancesValides,
      };
    }
    const rattachementSecours = (correction: any = {}) => {
      const conceptsCorriges = Array.isArray(correction.conceptsPfeq)
        ? correction.conceptsPfeq.map(String).filter((concept: string) => realite.concepts.includes(concept))
        : [];
      const connaissancesCorrigees = Array.isArray(correction.connaissancesPfeq)
        ? correction.connaissancesPfeq.map(String).filter((connaissance: string) => realite.connaissances.includes(connaissance))
        : [];
      return {
        ...objet,
        ...correction,
        periodeId: objet.periodeId,
        conceptsPfeq: [...new Set([...conceptsValides, ...conceptsCorriges])].length > 0
          ? [...new Set([...conceptsValides, ...conceptsCorriges])]
          : [realite.concepts[0]],
        connaissancesPfeq: [...new Set([...connaissancesValides, ...connaissancesCorrigees])].length > 0
          ? [...new Set([...connaissancesValides, ...connaissancesCorrigees])]
          : [realite.connaissances[0]],
      };
    };

    const correctionPrompt = `${promptOriginal}

RÉPARATION OBLIGATOIRE DU RATTACHEMENT PFEQ :
La sortie précédente ciblait la période ${realite.id} — ${realite.titre}, mais elle ne contenait pas une connaissance officielle exacte de cette période.
Conserve le contenu historique et la structure demandée. Ajoute dans "conceptsPfeq" au moins un concept copié exactement parmi : ${realite.concepts.join(" | ")}.
Ajoute dans "connaissancesPfeq" au moins une connaissance copiée exactement parmi : ${realite.connaissances.join(" | ")}.
Ne change pas "periodeId". Retourne uniquement l'objet ou le tableau JSON complet corrigé.

SORTIE À CORRIGER :
${JSON.stringify(objet)}`;
    let resultat: any;
    try {
      const response = await callFocusService(correctionPrompt, "correct");
      resultat = extraireJSON<any>(response.text);
    } catch (error) {
      console.warn("Réparation PFEQ indisponible; utilisation du rattachement officiel de la période.", error);
      return rattachementSecours();
    }
    const correction = Array.isArray(resultat)
      ? resultat.length === 1 && resultat[0] && typeof resultat[0] === "object" ? resultat[0] : {}
      : resultat && typeof resultat === "object" ? resultat : {};
    const conceptsCorriges = Array.isArray(correction.conceptsPfeq)
      ? correction.conceptsPfeq.map(String).filter((concept: string) => realite.concepts.includes(concept))
      : [];
    const connaissancesCorrigees = Array.isArray(correction.connaissancesPfeq)
      ? correction.connaissancesPfeq.map(String).filter((connaissance: string) => realite.connaissances.includes(connaissance))
      : [];
    return rattachementSecours({
      ...correction,
      conceptsPfeq: conceptsCorriges,
      connaissancesPfeq: connaissancesCorrigees,
    });
  }

  async function reparerDossierDocumentaireSectionA(promptOriginal: string, question: any, index: number): Promise<any> {
    const format = getSectionAFormat(question);
    const nombreMinimum = format === "classement" ? 4 : format === "association-paires" ? 2 : 1;
    const documents = Array.isArray(question?.documents) ? question.documents : [];
    const dossierInvalide = documents.length < nombreMinimum
      || documents.some((document: any) => !documentSectionAComplet(document))
      || documents.some((document: any) => documentEstVisuelPourReponse(document));
    if (!dossierInvalide) return question;

    const correctionPrompt = `${promptOriginal}

RÉPARATION OBLIGATOIRE DU DOSSIER DOCUMENTAIRE :
La question ${index + 1} de la sortie précédente ne contient pas assez de documents textuels valides pour son format.
Conserve intégralement le contenu, la période, les balises PFEQ, le format et les réponses attendues de cette question.
Retourne uniquement un objet JSON contenant "documents".
Il faut fournir au moins ${nombreMinimum} document(s) pour le format "${format}".
Chaque document doit être utile pour répondre, ne doit pas révéler la réponse, et doit contenir "titre", "typeDoc", "reference", "texte".
  Utilise uniquement "typeDoc":"Source primaire" ou "Source secondaire". N'ajoute aucune photo, carte, affiche, statistique, représentation ni champ d'image dans ce lot de Section A.

QUESTION À COMPLÉTER :
${JSON.stringify(question)}

FORMAT DE SORTIE STRICT :
{"documents":[{"titre":"...","typeDoc":"Source primaire","reference":"...","texte":"..."}]}`;
     const response = await callFocusService(correctionPrompt, "correct");
    const documentResultat = extraireJSON<any>(response.text);
    if (Array.isArray(documentResultat)) {
      if (documentResultat.length === 1 && Array.isArray(documentResultat[0]?.documents)) {
        return { ...question, documents: documentResultat[0].documents };
      }
      if (documentResultat.every((item: any) => item && typeof item === "object" && !Array.isArray(item))) {
        return { ...question, documents: documentResultat };
      }
      return { ...question, documents: documentResultat };
    }
    if (Array.isArray(documentResultat?.documents)) {
      return { ...question, documents: documentResultat.documents };
    }
    if (Array.isArray(documentResultat?.question?.documents)) {
      return { ...question, documents: documentResultat.question.documents };
    }
    return question;
  }

  async function reparerMetadonneesCorrectionSectionA(promptOriginal: string, question: any, index: number): Promise<any> {
    if (getSectionAFormat(question) !== "court"
      || (String(question?.reponseAttendue || "").trim()
        && Array.isArray(question?.criteresCorrection)
        && question.criteresCorrection.length > 0)) {
      return question;
    }

    const correctionPrompt = `${promptOriginal}

RÉPARATION OBLIGATOIRE DES MÉTADONNÉES DE CORRECTION :
La question ${index + 1} est une réponse courte, mais sa sortie ne contient pas une réponse attendue et une grille de correction interne complètes.
Ne modifie pas l'énoncé, la période, les balises PFEQ ni les documents. Ne révèle jamais ces champs à l'élève.
Retourne uniquement un objet JSON avec :
- "reponseAttendue" : une formulation historique précise, directement vérifiable à partir de la question et des documents;
- "criteresCorrection" : un tableau non vide de critères observables permettant d'évaluer la réponse.

QUESTION À COMPLÉTER :
${JSON.stringify(question)}

FORMAT DE SORTIE STRICT :
{"reponseAttendue":"...","criteresCorrection":["..."]}`;
    const response = await callFocusService(correctionPrompt, "correct");
    const resultat = extraireJSON<any>(response.text);
    const objet = Array.isArray(resultat) ? resultat[0] : resultat;
    if (!objet || typeof objet !== "object") return question;
    const criteresBruts = Array.isArray(objet.criteresCorrection)
      ? objet.criteresCorrection
      : Array.isArray(objet.criteres)
        ? objet.criteres
        : [];
    const criteres = criteresBruts.map(String).map((critere: string) => critere.trim()).filter(Boolean);
    const reponseAttendue = String(objet.reponseAttendue || objet.reponse || objet.faitAttendu || "").trim();
    return {
      ...question,
      ...(reponseAttendue ? { reponseAttendue } : {}),
      ...(criteres.length > 0 ? { criteresCorrection: criteres } : {}),
    };
  }

  async function reparerLotSectionAEnUnAppel(questions: any[]): Promise<any[]> {
    const questionsAssainies = questions.map((question) =>
      normaliserAssociationPairesSectionA(assainirRattachementPFEQSectionA(question)));
    const reparations = questionsAssainies.flatMap((question, index) => {
      const format = getSectionAFormat(question);
      const estClassementChronologique = format === "court" && classementChronologiqueValide(question?.elementsChronologiques);
      const nombreMinimumDocuments = estClassementChronologique
        ? 0
        : format === "classement" ? 4 : format === "association-paires" ? 3 : 1;
      const documents = Array.isArray(question?.documents) ? question.documents : [];
      const problemes: string[] = [];
      const realite = trouverRealitePFEQ(question?.periodeId);
      if (realite && (!Array.isArray(question.conceptsPfeq) || question.conceptsPfeq.length === 0
        || !Array.isArray(question.connaissancesPfeq) || question.connaissancesPfeq.length === 0)) {
        problemes.push("pfeq: fournir au moins un concept et une connaissance parmi les valeurs officielles permises");
      }
      if (!estClassementChronologique && (documents.length < nombreMinimumDocuments
        || documents.some((document: any) => !documentSectionAComplet(document))
        || documents.some((document: any) => documentEstVisuelPourReponse(document)))) {
        problemes.push(`documents: fournir au moins ${nombreMinimumDocuments} document(s) textuel(s) complet(s)`);
      }
      if (format === "court"
        && (!String(question?.reponseAttendue || "").trim()
          || !Array.isArray(question?.criteresCorrection)
          || question.criteresCorrection.length === 0)) {
        problemes.push("correction: fournir reponseAttendue et criteresCorrection");
      }
      if (format === "association-paires") {
        const propositions = Array.isArray(question?.propositions)
          ? question.propositions.map(String).map((item: string) => item.trim()).filter(Boolean)
          : [];
        const faitsRelier = Array.isArray(question?.faitsRelier)
          ? question.faitsRelier.map(String).map((item: string) => item.trim()).filter(Boolean)
          : [];
        const associationsAttendues = Array.isArray(question?.associationsAttendues)
          ? question.associationsAttendues.map(Number)
          : [];
        let contenuOperationInvalide = false;
        try {
          validerContenuOperation(question, "mise-en-relation");
        } catch {
          contenuOperationInvalide = true;
        }
        if (documents.length !== 3
          || propositions.length !== 3
          || new Set(propositions.map((item: string) => item.toLocaleLowerCase("fr-CA"))).size !== 3
          || faitsRelier.length !== 3
          || faitsRelier.some((fait: string, propositionIndex: number) =>
            fait.toLocaleLowerCase("fr-CA") !== propositions[propositionIndex]?.toLocaleLowerCase("fr-CA"))
          || associationsAttendues.length !== 3
          || associationsAttendues.some((association: number) => !Number.isInteger(association) || association < 0 || association > 2)
          || new Set(associationsAttendues).size !== 3
          || associationsAttendues.every((association: number, associationIndex: number) => association === associationIndex)
          || contenuOperationInvalide
          || !String(question?.realiteCommune || "").trim()
          || !String(question?.constatAttendu || "").trim()
          || !Array.isArray(question?.marqueursRelationAttendus)
          || question.marqueursRelationAttendus.length === 0) {
          problemes.push("mise-en-relation: fournir un thème historique commun, exactement trois faits généraux et trois documents présentant chacun une manifestation concrète distinctive, puis un constat non causal");
        }
      }
      return problemes.length > 0 ? [{
        index,
        problemes,
        question,
        ...(realite ? {
          conceptsPfeqAutorises: realite.concepts,
          connaissancesPfeqAutorisees: realite.connaissances,
        } : {}),
      }] : [];
    });
    if (reparations.length === 0) return questionsAssainies;

    const correctionPrompt = `Répare en une seule réponse uniquement les champs invalides des questions de Section A ci-dessous.
Ne modifie jamais l'énoncé, la période, le format, l'opération, les choix ni l'index de la bonne réponse.
Pour "conceptsPfeq" et "connaissancesPfeq", recopie au moins une valeur exacte dans les listes autorisées de la question. N'invente aucun libellé.
Pour "documents", retourne des documents utiles qui ne révèlent pas la réponse, avec "titre", "typeDoc", "reference" et "texte". Utilise seulement "Source primaire" ou "Source secondaire", sans image ni champ d'image.
Pour une réponse courte, "reponseAttendue" doit être historiquement précise et "criteresCorrection" doit être un tableau non vide de critères observables.
    Pour une question "mise-en-relation", répare ensemble les champs liés : "realiteCommune" nomme un seul thème historique; exactement trois faits généraux liés à ce thème sont mélangés dans "propositions" et recopiés dans "faitsRelier"; exactement trois documents présentent chacun une manifestation concrète distinctive d'un seul fait, sans paraphraser ce fait; "associationsAttendues" est une permutation exacte de [0,1,2] où chaque position de fait contient l'index de son document apparenté. "propositions" doit contenir seulement des chaînes et "documents" seulement les objets documentaires. Ajoute un "constatAttendu" non causal qui explique la réalité commune et un "marqueursRelationAttendus" choisi uniquement parmi : "est associé à", "est lié à", "correspond à", "s’inscrit dans", "illustre", "témoigne de", "contribue à", "est caractéristique de". N'assemble pas trois événements indépendants.
Retourne uniquement un tableau JSON. Chaque élément doit contenir l'index original et seulement les champs réparés :
    [{"index":0,"conceptsPfeq":["..."],"connaissancesPfeq":["..."],"documents":[...],"reponseAttendue":"...","criteresCorrection":["..."],"realiteCommune":"...","propositions":["...","...","..."],"faitsRelier":["...","...","..."],"associationsAttendues":[2,0,1],"constatAttendu":"...","marqueursRelationAttendus":["..."]}]

QUESTIONS À RÉPARER :
${JSON.stringify(reparations)}`;
    const response = await callFocusService(correctionPrompt, "correct");
    const resultat = extraireJSON<any>(response.text);
    const correctifs = Array.isArray(resultat) ? resultat : [];
    const correctifsParIndex = new Map(
      correctifs
        .filter((correctif: any) => Number.isInteger(Number(correctif?.index)))
        .map((correctif: any) => [Number(correctif.index), correctif]),
    );
      return questionsAssainies.map((question, index) => {
      const correctif = correctifsParIndex.get(index);
        const questionAvecCorrectif = !correctif || typeof correctif !== "object"
          ? question
          : assainirRattachementPFEQSectionA({
              ...question,
              ...(Array.isArray(correctif.conceptsPfeq) ? { conceptsPfeq: correctif.conceptsPfeq } : {}),
              ...(Array.isArray(correctif.connaissancesPfeq) ? { connaissancesPfeq: correctif.connaissancesPfeq } : {}),
              ...(Array.isArray(correctif.documents) ? { documents: correctif.documents } : {}),
              ...(String(correctif.reponseAttendue || "").trim()
                ? { reponseAttendue: String(correctif.reponseAttendue).trim() }
                : {}),
              ...(Array.isArray(correctif.criteresCorrection)
                ? { criteresCorrection: correctif.criteresCorrection.map(String).map((critere: string) => critere.trim()).filter(Boolean) }
                : {}),
               ...(Array.isArray(correctif.propositions)
                 ? { propositions: correctif.propositions.map(String).map((item: string) => item.trim()).filter(Boolean) }
                 : {}),
               ...(Array.isArray(correctif.faitsRelier)
                 ? { faitsRelier: correctif.faitsRelier.map(String).map((item: string) => item.trim()).filter(Boolean) }
                 : {}),
               ...(String(correctif.realiteCommune || "").trim()
                 ? { realiteCommune: String(correctif.realiteCommune).trim() }
                 : {}),
               ...(Array.isArray(correctif.associationsAttendues)
                 ? { associationsAttendues: correctif.associationsAttendues.map(Number) }
                 : {}),
               ...(String(correctif.constatAttendu || "").trim()
                 ? { constatAttendu: String(correctif.constatAttendu).trim() }
                 : {}),
               ...(Array.isArray(correctif.marqueursRelationAttendus)
                 ? { marqueursRelationAttendus: correctif.marqueursRelationAttendus.map(String).map((item: string) => item.trim()).filter(Boolean) }
                 : {}),
          });
        const questionAssociationNormalisee = normaliserAssociationPairesSectionA(questionAvecCorrectif);
        const format = getSectionAFormat(questionAssociationNormalisee);
        const sansDocumentChronologique = format === "court"
          && classementChronologiqueValide(questionAssociationNormalisee?.elementsChronologiques);
        return normaliserQuestionSectionA(normaliserRattachementPFEQ(
          sansDocumentChronologique
            ? { ...questionAssociationNormalisee, documents: [] }
            : questionAssociationNormalisee,
          questionAssociationNormalisee?.periodeId,
        ));
    });
  }

  async function reparerCriteresCorrectionSectionC(question: any): Promise<any> {
    if (criteresCorrectionSectionCComplets(question)) return question;
    const isDescription = question.typeTache === "description";
    const nombreCriteres = isDescription ? 3 : 2;
    const criteresAttendus = isDescription
      ? "1 = objet de la description (/2), 2 = première mise en relation (/3), 3 = deuxième mise en relation (/3)"
      : "1 = premier élément de réponse (/4), 2 = deuxième élément de réponse (/4)";
    const documentsDisponibles = (Array.isArray(question.documents) ? question.documents : [])
      .map((document: any, index: number) => `${String.fromCharCode(65 + index)} — ${document.titre || "Document sans titre"}`)
      .join(" | ");
    const correctionPrompt = `Répare uniquement les critères de correction internes du dossier de Section C ci-dessous.
Type de tâche : ${question.typeTache}
Consigne : ${question.consigne}
La grille doit contenir exactement ${nombreCriteres} critères : ${criteresAttendus}.
Chaque critère doit avoir un elementId séquentiel de 1 à ${nombreCriteres}, un element précis, une description concrète et un tableau documentsPertinents non vide contenant uniquement les lettres des documents disponibles.
Ne modifie pas le contexte, la consigne, la période ni les documents. Retourne uniquement {"criteresCorrectionAttendus":[...]} en JSON valide.
Documents disponibles : ${documentsDisponibles}
Critères incomplets à remplacer : ${JSON.stringify(question.criteresCorrectionAttendus || [])}`;
    const response = await callFocusService(correctionPrompt, "correct");
    const resultat = extraireJSON<any>(response.text);
    const criteres = Array.isArray(resultat)
      ? resultat
      : Array.isArray(resultat?.criteresCorrectionAttendus)
        ? resultat.criteresCorrectionAttendus
        : [];
    return { ...question, criteresCorrectionAttendus: criteres };
  }

  async function genererLotQuestionsA(resume?: SectionAGenerationResume) {
    const periodesPourGeneration = resume?.periodes || periodesSelectionnees;
    if (periodesPourGeneration.length === 0 && !exigerUnePeriodeSelectionnee()) return;
    if (sectionAGenerationInFlightRef.current) return;
    sectionAGenerationInFlightRef.current = true;
    setLoadingQuestionA(true); setErreurGlobal(null);
    setGenerationAJobExpire(false);
    setGenerationProgressA({ stage: "queued", percent: 0 });
    if (resume?.requestId) {
      sectionAGenerationIdRef.current = resume.requestId;
    } else if (!sectionAGenerationIdRef.current) {
      sectionAGenerationIdRef.current = globalThis.crypto?.randomUUID?.()
        || `section-a-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
    const generationId = sectionAGenerationIdRef.current;
    const variationCycle = ++generationVariationRef.current;
    const nivCalcul = resume?.niveau || obtenirNiveauPourResultat();
    const parcoursPourGeneration = resume?.parcours || parcoursA;
    const periodesDisponibles = PERIODES_HISTORIQUES.filter(p => periodesPourGeneration.includes(p.id));
    const listePeriodes = periodesDisponibles.map(p => `Période ${p.id} — ${p.titre}`).join(" | ");
    const consigneParcours = parcoursPourGeneration === 'reponses'
      ? `MODULE RÉPONSES COURTES ET CHOIX MULTIPLES : génère exactement 10 questions, dont 5 QCM et 5 réponses courtes. Utilise seulement les formats "qcm" et "court". Ces questions évaluent des connaissances et la compréhension; ne les présente jamais comme des opérations intellectuelles et ne génère aucune association, aucune chaîne en trois étapes et aucun schéma. Au moins une des cinq réponses courtes doit aussi contenir "elementsChronologiques", un tableau de quatre éléments réordonnables, avec le plus ancien en premier et le plus récent en dernier. Pour une réponse courte qui contient "elementsChronologiques", retourne "documents":[] : l’élève doit replacer les éléments dans le temps sans dossier documentaire. Pour les autres questions, fournis au moins un document textuel utile dans "documents", de type "Source primaire" ou "Source secondaire". Le classement sera affiché mélangé dans l’interface et corrigé uniquement selon l’ordre choisi par l’élève, sans réponse textuelle à écrire. N'utilise aucune photo, carte, affiche, iconographie, graphique, tableau de données ou autre représentation visuelle dans ce module.`
      : `MODULE OPÉRATIONS INTELLECTUELLES : le lot doit contenir au moins une question de CHACUNE des sept opérations suivantes, avec ces identifiants exacts : faits, espace-temps, mise-en-relation, causes-consequences, liens-causalite, continuite-changement, comparaisons. Les trois questions restantes peuvent être des QCM de consolidation.
CONTRATS PÉDAGOGIQUES OBLIGATOIRES PAR OPÉRATION :
${contratsOperationsPourPrompt()}
Dans ce lot de Section A, l'opération "espace-temps" doit obligatoirement utiliser "dimension":"temps" et le format "classement"; la localisation spatiale est évaluée dans le dossier interactif de Section B.
Pour ce classement "espace-temps", fournis exactement quatre documents textuels distincts et le champ interne "ordreCorrect" : un tableau des quatre indices des documents (0 à 3), du plus ancien au plus récent.
Pour la mise en relation, "associationsAttendues" ne doit jamais valoir [0,1,2] : présente les documents dans un ordre différent de celui des faits.
Les champs internes servent à valider et corriger l'activité; ne les révèle jamais dans la consigne destinée à l'élève.`;
    const regleFormats = parcoursPourGeneration === 'reponses'
         ? `Répartis les bonnes réponses des QCM de façon aléatoire entre A, B, C et D. Pour chaque réponse courte rédigée, ajoute "reponseAttendue" et "criteresCorrection" internes sans les révéler dans la consigne; son barème est de 2 points, accordés seulement si la réponse est correcte et formulée en phrase complète. Si l’élève écrit un ou deux mots, la note maximale est 1/2 même si l’idée est juste. Chaque réponse courte doit couvrir et permettre d’évaluer séparément les critères suivants : ${JSON.stringify(CRITERES_REPONSE_COURTE_PFEQ)}. Pour au moins une réponse courte, ajoute exactement quatre "elementsChronologiques" contenant chacun "label" et "annee" ou "ordre", dans l'ordre du plus ancien au plus récent; l'élève devra pouvoir les réorganiser. Pour cette question, retourne "documents":[] et ne demande pas de réponse rédigée : la correction doit porter uniquement sur l'ordre chronologique choisi. Pour les autres questions, chaque document doit être textuel, de type "Source primaire" ou "Source secondaire", avec "typeDoc", "texte" et "reference"; n'ajoute aucun champ d'image et ne demande jamais à l'élève de nommer un document. Une réponse courte doit être formulée directement avec le fait historique attendu, sans commencer par « Selon le document ». Ajoute "marqueursRelationAttendus" avec des mots adaptés à la réponse historique attendue.`
        : `Pour chaque QCM, répartis la bonne réponse de façon aléatoire entre A, B, C et D. Pour une réponse courte, ajoute "reponseAttendue" et "criteresCorrection" internes. Utilise les formats adaptés : "court" pour établir un fait et déterminer une cause ou conséquence; "classement" pour situer dans le temps; "association-paires" pour mettre en relation; "causalite-3" pour une chaîne de trois étapes; "changement-continuite"; ou "comparaison". Pour la mise en relation, applique la démarche du RÉCIT : nomme une seule réalité historique dans "realiteCommune", puis formule exactement trois faits généraux qui l'éclairent. Génère exactement trois documents textuels distincts présentant chacun une manifestation concrète et distinctive d'un seul de ces faits. N'assemble jamais trois événements indépendants et ne paraphrase jamais les faits dans les documents. Le parcours élève présente une ligne par fait général et demande le numéro du document qui apporte la manifestation apparentée. "propositions" et "faitsRelier" doivent contenir les mêmes trois chaînes; ne place jamais d'objet documentaire dans "propositions". "associationsAttendues" doit être une permutation de [0,1,2] où chaque position de fait contient l'index de son document apparenté. Ne transforme jamais cette activité en question de cause, de conséquence ou de causalité. Pour chacune des sept opérations, génère au moins une question dans son format adapté; seuls les trois exercices de consolidation peuvent être des QCM. Chaque question doit obligatoirement contenir un tableau "documents" non vide, utile à la tâche et exploitable par l'élève.`;
    const faiblesses = regrouperResultats(historiqueResultats).filter((groupe) => groupe.score < 75).slice(0, 3);
    const consigneAdaptative = faiblesses.length
      ? `ADAPTATION : privilégie, sans exclure les autres exigences, les notions faibles observées : ${faiblesses.map((groupe) => `${groupe.label} (${groupe.periode}, ${groupe.score} %)`).join(" ; ")}. Varie les faits et les documents; ne répète pas mot pour mot les exercices précédents.`
      : `ADAPTATION : varie les périodes et les notions pour établir un premier portrait des forces et défis de l'élève.`;
     const systemPrompt = resume?.prompt || `Tu es un concepteur d'examen pour le cours d'Histoire du Québec et du Canada, secondaire ${nivCalcul} (programme du Québec). Génère EXACTEMENT une liste de 10 questions indépendantes de type "Section A" de l'épreuve unique. ${consigneParcours}
    ${genererContexteTemporel()}
    ${genererConsigneDiversite(variationCycle, parcoursPourGeneration === "reponses" ? "le lot de connaissances" : "le lot d’opérations intellectuelles")}
    RATTACHEMENT HISTORIQUE OBLIGATOIRE : Pour chaque question, choisis une seule "periodeId" parmi les périodes disponibles ci-dessous et ajoute le nom correspondant dans "periode". Chaque fait, date, acteur, institution, événement et bonne réponse de la question doit appartenir à cette période cible. Ne mélange jamais des faits de périodes différentes dans une même question. Lorsque plusieurs chapitres sont cochés, répartis les questions entre les périodes sélectionnées et vérifie la chronologie de chaque fait avant de répondre.
    Périodes disponibles : ${listePeriodes}
    ${genererConsigneDifficulte()}
      ${consigneAdaptative}
       ${regleFormats} Pour une opération intellectuelle, respecte exactement le barème déclaré dans son contrat : établir des faits = 1 point par fait, pour un maximum de 2; classement temporel = 2 points avec crédit partiel; QCM temporel ou spatial = 1 point; comparaison de trois acteurs = 3 points; causes et conséquences = 2 points; changement et continuité = 3 points; mise en relation = 2 points, soit 1 par association; causalité = 3 points. La sortie doit déclarer le nombre exact dans "points". Les métadonnées internes de correction ne doivent jamais être visibles dans le texte destiné à l'élève. Respecte la méthode historique et la progression des apprentissages du PFEQ : fait précis, repère temporel exact et relation explicitée seulement lorsque la tâche la demande. Réponds UNIQUEMENT en format JSON valide sous forme de tableau:
     [ { "periodeId": 1, "periode": "Nom exact de la période", "conceptsPfeq": ["Concept officiel"], "connaissancesPfeq": ["Connaissance officielle"], "operationId":"faits si opération intellectuelle","format": "qcm", "points": 1, "question": "Texte de la question", "documents": [{"titre":"Source historique","typeDoc":"Source primaire","reference":"Source complète","texte":"Extrait textuel vérifiable"}], "choix": ["Choix 1", "Choix 2", "Choix 3", "Choix 4"], "indexReponseCorrecte": 0, "marqueursRelationAttendus":["marqueurs autorisés pour cette opération"], "criteresCorrection":["critères propres à l'opération"], "explication": "Courte explication pédagogique formulée avec les marqueurs appropriés." } ]`;
    if (!generationId) throw new Error("Impossible d'identifier la génération Section A.");
    const reprise = {
      requestId: generationId,
      ...(resume?.statusUrl ? { statusUrl: resume.statusUrl } : {}),
      prompt: systemPrompt,
      parcours: parcoursPourGeneration,
      niveau: nivCalcul,
      periodes: periodesPourGeneration,
      code: resume?.code || codeUtilise,
    } satisfies SectionAGenerationResume;
    sauvegarderRepriseSectionA(reprise);
    try {
      await executerGenerationAvecTentatives(async () => {
        const response = await callGenerationService('generer', { prompt: systemPrompt }, {
          requestId: generationId,
          ...(resume?.statusUrl ? { statusUrl: resume.statusUrl } : {}),
          onJobCreated: ({ statusUrl }) => {
            sauvegarderRepriseSectionA({ ...reprise, statusUrl });
          },
          onProgress: (progress) => setGenerationProgressA({
            stage: progress.stage,
            percent: Math.max(0, Math.min(100, progress.percent)),
          }),
        });
        try {
          let questions = extraireJSON<any[]>(response.text);
          questions = Array.isArray(questions)
            ? questions.map(normaliserQuestionSectionA)
            : questions;
          questions = Array.isArray(questions)
            ? (await reparerLotSectionAEnUnAppel(questions)).map((question) =>
                question?.operationId === "liens-causalite"
                  ? { ...question, question: normaliserConsigneTroisPicots(question.question, question.etapes) }
                  : question)
            : questions;
          questions = Array.isArray(questions)
            ? questions.map((question: any) => (
                getSectionAFormat(question) === "court" && classementChronologiqueValide(question?.elementsChronologiques)
                  ? { ...question, documents: [] }
                  : question
              ))
            : questions;
          questions = Array.isArray(questions)
            ? questions.map((question: any) => question?.operationId
              ? {
                ...question,
                points: pointsOperation(question, question.operationId),
                formatReponse: OPERATIONS.find((operation) => operation.id === question.operationId)?.formatAttendu || question.formatReponse,
                ...(question.operationId === "causes-consequences" ? { exigeJustification: true } : {}),
              }
              : question)
            : questions;
          validerLotSectionA(questions, periodesDisponibles, parcoursPourGeneration);
           const questionsNormalisees = await Promise.all((Array.isArray(questions) ? questions : []).map(async (question: any, index: number) => {
            const periode = periodesDisponibles.find(p => p.id === Number(question.periodeId));
            if (!periode) throw new Error(`Période non activée à la question ${index + 1}.`);
           const operationFormat = getSectionAFormat(question);
             const estClassementChronologique = operationFormat === "court"
               && classementChronologiqueValide(question?.elementsChronologiques);
             const documents = estClassementChronologique
               ? []
               : Array.isArray(question.documents) ? question.documents : [];
             if (documents.some((document: any) => !documentSectionAComplet(document))) {
               throw new Error(`Document textuel incomplet à la question ${index + 1}.`);
             }
             if (documents.some((document: any) => documentEstVisuelPourReponse(document))) {
               throw new Error(`Le dossier de la question ${index + 1} doit rester textuel.`);
             }
           return {
             ...question,
             format: operationFormat,
             formatReponse: operationFormat,
              points: question.operationId
                ? pointsOperation(question, question.operationId)
                : operationFormat === "court" && !estClassementChronologique
                  ? 2
                  : Math.min(3, Math.max(1, Number(question.points) || 1)),
              periodeId: periode.id,
              periode: periode.titre,
              documents,
              elementsChronologiques: Array.isArray(question.elementsChronologiques) && question.elementsChronologiques.length === 4
                ? question.elementsChronologiques
                : undefined,
              etapes: Array.isArray(question.etapes) ? question.etapes.slice(0, 3) : undefined
           };
           }));
           // Exigence propre au module de réponses courtes; le module d'opérations
           // évalue la chronologie par le classement de documents (espace-temps).
           if (parcoursPourGeneration === 'reponses'
             && !questionsNormalisees.some((question: any) => Array.isArray(question.elementsChronologiques) && question.elementsChronologiques.length === 4)) {
             throw new Error("Le lot doit contenir au moins un classement chronologique réorganisable.");
           }
           memoriserQuestionsGenerees(questionsNormalisees);
          setBanqueQuestionsA(questionsNormalisees); setCurrentIndexA(0); setReponsesStructureA({}); setErreurFormatA(null);
          sectionAGenerationIdRef.current = null;
          supprimerRepriseSectionA();
          setGenerationAConfigGemini(false);
        } catch (error) {
          // Une réponse reçue mais invalide doit forcer un nouveau job; une
          // erreur réseau conserve la clé afin que la reprise retrouve le job.
          if (!(error instanceof Error && "status" in error)) {
            sectionAGenerationIdRef.current = null;
            supprimerRepriseSectionA();
          }
          throw error;
        }
      });
    } catch(err) {
      afficherErreurGeneration("section-a", err);
    } finally {
      sectionAGenerationInFlightRef.current = false;
      setLoadingQuestionA(false);
    }
  }

  useEffect(() => {
    if (!codeUtilise || !niveauScolaire || sectionAResumeRestoredRef.current) return;
    const reprise = lireRepriseSectionA();
    if (!reprise || reprise.niveau !== niveauScolaire) return;
    if (reprise.code.trim().toUpperCase() !== codeUtilise.trim().toUpperCase()) return;
    if (reprise.periodes.length === 0) {
      supprimerRepriseSectionA();
      return;
    }

    sectionAResumeRestoredRef.current = true;
    sectionAGenerationIdRef.current = reprise.requestId;
    setParcoursA(reprise.parcours);
    setPeriodesSelectionnees(reprise.periodes);
    setStudentTab("accueil");
    setCurrentView("sectionA");
    void genererLotQuestionsA(reprise);
  }, [codeUtilise, niveauScolaire]);

  function relancerLotQuestionsA() {
    if (generationAConfigGemini || generationAJobExpire) {
      sectionAGenerationIdRef.current = null;
      supprimerRepriseSectionA();
    }
    setGenerationAJobExpire(false);
    if (generationAConfigGemini) {
      // Le job échoué reste consultable avec sa clé. Seule cette action
      // explicite de l'enseignant autorise une nouvelle demande après
      // correction de la configuration Gemini.
      setGenerationAConfigGemini(false);
    }
    void genererLotQuestionsA();
  }

  const questionA = banqueQuestionsA.length > 0 ? banqueQuestionsA[currentIndexA] : null;
  useEffect(() => {
    const elements = questionA?.elementsChronologiques;
    setOrdreChronologiqueA(Array.isArray(elements) ? melangerIndicesChronologiques(elements) : []);
  }, [currentIndexA, banqueQuestionsA]);

  const passerQuestionSuivanteA = () => {
    setSelectedChoice(null); setReponseCourteA(""); setReponsesStructureA({}); setAnnonceReponseStructureA(""); setOrdreChronologiqueA([]); setErreurFormatA(null); setFeedbackA(null); setIsAnswerValidated(false);
    if (currentIndexA + 1 < banqueQuestionsA.length) { setCurrentIndexA(currentIndexA + 1); } else { genererLotQuestionsA(); }
  };

  function lireReponseStructureA(format: string) {
    if (format === "classement") {
      return { ordre: (questionA?.documents || []).map((_: any, index: number) => reponsesStructureA[`ordre-${index}`] || "") };
    }
    if (format === "association-paires") {
      const propositions = questionA?.propositions || questionA?.relations || [];
      return {
        associations: propositions.map((_: unknown, propositionIndex: number) =>
          reponsesStructureA[`paire-${propositionIndex}`] || ""),
      };
    }
    if (format === "causalite-3") {
      return { etapes: [0, 1, 2].map((index) => reponsesStructureA[`causalite-${index}`] || "") };
    }
    if (format === "changement-continuite") {
      return {
        moment1: reponsesStructureA.moment1 || "",
        moment2: reponsesStructureA.moment2 || "",
        changement: reponsesStructureA.changement || "",
        continuite: reponsesStructureA.continuite || "",
        preuves: reponsesStructureA.preuves || "",
      };
    }
    return {
      acteurDissident: reponsesStructureA.acteurDissident || "",
      positionDissidente: reponsesStructureA.positionDissidente || "",
      positionCommune: reponsesStructureA.positionCommune || "",
      preuves: reponsesStructureA.preuves || "",
    };
  }

  function validerFormatStructureA(format: string) {
    const reponse = lireReponseStructureA(format);
    if (format === "classement") {
      const ordre = (reponse.ordre as string[]);
      if (ordre.some((value) => value === "")) return "Place chaque document dans une position chronologique.";
      if (new Set(ordre).size !== ordre.length) return "Un document ne peut pas occuper deux positions.";
    }
    if (format === "association-paires") {
      const associations = reponse.associations as string[];
      if (associations.some((value) => value === "")) return "Inscris le numéro d’un document pour chaque fait ou description.";
      if (new Set(associations).size !== associations.length) return "Chaque document doit être utilisé une seule fois.";
    }
    if (format === "causalite-3" && (reponse.etapes as string[]).some((value) => value.trim() === "")) return "Complète les trois étapes de la chaîne de causalité.";
    if (format === "changement-continuite") {
      if (["moment1", "moment2", "changement", "continuite", "preuves"].some((champ) => !String((reponse as any)[champ] || "").trim())) return "Décris les deux moments, puis précise un changement, une continuité et les preuves utilisées.";
      if (!contientRepereTemporel(`${reponse.moment1} ${reponse.moment2} ${reponse.preuves}`)) return "Ajoute une année, une décennie ou un autre repère temporel précis.";
    }
    if (format === "comparaison" && ["acteurDissident", "positionDissidente", "positionCommune", "preuves"].some((champ) => !String((reponse as any)[champ] || "").trim())) return "Identifie l’acteur dissident, explique sa position, puis explique la position des deux autres acteurs avec les preuves documentaires.";
    return null;
  }

  async function corrigerReponseA() {
    if (!questionA) return;
    const format = getSectionAFormat(questionA);
    const elementsChronologiques = Array.isArray(questionA.elementsChronologiques) ? questionA.elementsChronologiques : [];
    const estClassementChronologique = elementsChronologiques.length === 4;
    const estQcm = format === "qcm" && !estClassementChronologique;
    const estStructure = !["qcm", "court"].includes(format);
    const erreurStructure = estStructure ? validerFormatStructureA(format) : null;
    if (erreurStructure) { setErreurFormatA(erreurStructure); return; }
    const reponseStructure = estStructure ? lireReponseStructureA(format) : null;
    const structureVide = estStructure && reponseStructure
      ? Object.values(reponseStructure).every((value) =>
          Array.isArray(value)
            ? value.every((item) => !String(item || "").trim())
            : !String(value || "").trim())
      : false;
    if ((!estClassementChronologique && !reponseCourteA.trim() && !estStructure && !estQcm) || structureVide) {
      setErreurFormatA(CONSIGNE_REPONSE_VIDE);
      return;
    }
    if (estQcm && selectedChoice === null) {
      setErreurFormatA(CONSIGNE_REPONSE_VIDE);
      return;
    }
    if (estClassementChronologique && ordreChronologiqueA.length === 0) {
      setErreurFormatA(CONSIGNE_REPONSE_VIDE);
      return;
    }
    if (estClassementChronologique && (ordreChronologiqueA.length !== elementsChronologiques.length || new Set(ordreChronologiqueA).size !== elementsChronologiques.length)) {
      setErreurFormatA("Replace tous les éléments : plus ancien en premier, plus récent en dernier.");
      return;
    }
    const ordreChronologiqueCorrect = estClassementChronologique
      && ordreChronologiqueA.every((index, position) => index === position);
    const associationsEleve = format === "association-paires"
      ? (lireReponseStructureA(format).associations as string[]).map(Number)
      : [];
    const associationsAttendues = Array.isArray(questionA.associationsAttendues)
      ? questionA.associationsAttendues.map(Number)
      : [];
    const associationsCorrectes = format === "association-paires"
      && associationsEleve.length === associationsAttendues.length
      && associationsEleve.every((association, index) => association === associationsAttendues[index]);
    const reponseSoumise = estStructure
      ? JSON.stringify(lireReponseStructureA(format))
      : estQcm
        ? `Choix ${String.fromCharCode(65 + Number(selectedChoice))} : ${questionA.choix?.[Number(selectedChoice)] || ""}`
      : estClassementChronologique
        ? JSON.stringify({ ordreChronologique: ordreChronologiqueA.map((index) => elementsChronologiques[index]) })
        : reponseCourteA;
    setLoadingCorrectionA(true); setErreurGlobal(null);
    setErreurFormatA(null);
    const operationQuestionA = OPERATIONS.find((operation) => operation.id === questionA.operationId);
       const correctionPrompt = `Tu es un correcteur d'histoire du Québec et du Canada de secondaire ${niveauScolaire}. Évalue cette réponse selon le barème de ${questionA.points || 1} point(s). Format : ${format}. Question : ${questionA.question}. Documents visibles : ${JSON.stringify(questionA.documents || [])}. Faits à mettre en relation affichés : ${format === "association-paires" ? JSON.stringify(questionA.faitsRelier || questionA.propositions || []) : "non applicable"}. Clé interne des associations par document : ${format === "association-paires" ? JSON.stringify(questionA.associationsAttendues || []) : "non applicable"}. Réponse attendue interne : ${questionA.reponseAttendue || ""}. Explication historique interne : ${questionA.explication || ""}. Réponse correcte du QCM (métadonnée interne, à ne pas révéler dans le commentaire) : ${estQcm ? questionA.choix?.[questionA.indexReponseCorrecte] || "" : ""}. Classement chronologique attendu interne (métadonnée à ne pas révéler) : ${estClassementChronologique ? JSON.stringify(elementsChronologiques) : "non applicable"}. Critères internes : ${JSON.stringify(questionA.criteresCorrection || [])}. Critères transversaux des réponses courtes : ${JSON.stringify(CRITERES_REPONSE_COURTE_PFEQ)}. Contrat de l'opération : ${operationQuestionA ? contratOperationPourPrompt(operationQuestionA) : "question de connaissance sans opération intellectuelle"}. Marqueurs attendus : ${JSON.stringify(questionA.marqueursRelationAttendus || [])}. Réponse de l'élève : "${reponseSoumise}". ${estClassementChronologique ? "Pour ce classement, évalue uniquement l'ordre du plus ancien au plus récent; l'élève n'a aucun texte à rédiger et ne doit pas être pénalisé pour l'absence de réponse textuelle." : ""} ${format === "association-paires" ? "Pour cette mise en relation officielle, compare le numéro choisi pour chaque fait à la clé interne qui associe chaque fait au document présentant sa manifestation ou sa description apparentée. N’expose jamais les indices de la clé dans la rétroaction." : ""} Pour ce module de QCM et de réponses courtes, n'exige jamais le nom d'un document et ne commence jamais une réponse modèle par « Selon le document » : formule directement le fait historique, puis le lien demandé s'il y en a un. Respecte la méthode historique et la progression des apprentissages du PFEQ. Les documents doivent fournir des indices sans écrire explicitement la réponse attendue. Commence toujours la rétroaction par un encouragement sincère et concret avant de nommer une erreur. Le champ "commentaire" doit contenir uniquement l'analyse générale : une première phrase qui indique clairement ce qui fonctionne ou ne fonctionne pas, puis une ligne vide, puis une explication qui aide l'élève à formuler sa réponse. Ne mets jamais dans "commentaire" de point fort, de défi, d'élément à travailler, d'astuce documentaire ou leurs étiquettes; ces informations vont dans leurs champs séparés. Formule l'explication avec les marqueurs de relation historiques appropriés. ${format === "court" && !estClassementChronologique ? `RÈGLE POUR LES RÉPONSES COURTES : n’écris jamais « Ta réponse a été reçue », « Relis la consigne et vérifie chaque élément attendu » ni « Appuie-toi sur un fait précis et explique le lien avec la question ». Si la réponse est partielle ou erronée, explique le fait historique attendu et son contexte afin que l’élève comprenne son erreur. L’astuce documentaire doit nommer un document visible précis et indiquer quel indice chercher pour répondre à cette question. Évalue séparément chaque critère de ${JSON.stringify(CRITERES_REPONSE_COURTE_PFEQ)} et chaque critère interne de la question dans "criteresEvaluation"; chaque entrée doit contenir le texte exact du critère et "statut" égal à "respecte" ou "a-retravailler".` : ""} Pour une opération intellectuelle, ajoute "diagnosticOperation" avec les critères respectés, les critères à retravailler, les marqueurs réellement utilisés par l'élève, une preuve documentaire précise et un champ "lienExtraitReponse" qui explique clairement comment l'extrait soutient ou contredit la réponse. Même si la réponse est vide de sens, le pointFort doit encourager une prochaine action concrète et ne doit jamais dire "aucun point fort décelé". ${questionA.documents?.length ? "Donne une astuce documentaire précise." : "Retourne une chaîne vide pour astuceDocumentaire."} Réponds UNIQUEMENT en JSON valide : {"correct":true,"note":"2/2","commentaire":"Première phrase de diagnostic.\n\nExplication historique liée à cette question.","explication":"Le fait historique attendu, son contexte et le lien avec la question","exempleReponse":"Réponse modèle conforme","criteresEvaluation":[{"critere":"Critère exact","statut":"respecte"}],"diagnosticOperation":{"criteresRespectes":[],"criteresARetravailler":[],"marqueursUtilises":[],"preuveDocumentaire":"Indice précis observé ou attendu","lienExtraitReponse":"Lien explicite entre un extrait et la réponse de l'élève"},"lienExtraitReponse":"Lien explicite entre un extrait et la réponse de l'élève","pointFort":"Encouragement fondé sur une prochaine action","elementATravailler":"Élément à préciser","astuceDocumentaire":"Conseil qui nomme un document précis et l’indice à y chercher","progressionOperation":"Compétence travaillée"}. La note doit respecter le barème demandé, de 0 à ${questionA.points || 1}.`;
    try {
      const response = await callGenerationService('corriger', { prompt: `${CONSIGNE_ORTHOGRAPHE_NOMS}\n${correctionPrompt}` });
      const total = estClassementChronologique
        ? 2
        : estQcm
          ? Number(questionA.points) || 1
          : 2;
        const brut = extraireJSON<any>(response.text);
        if (operationIntellectuelleReconnue(questionA.operationId)) validerFeedbackOperation(brut, questionA.operationId);
        const parsed = normaliserFeedbackCourte(
          estQcm
            ? { ...brut, note: selectedChoice === questionA.indexReponseCorrecte ? `${total}/${total}` : `0/${total}` }
              : estClassementChronologique
                ? { ...brut, correct: ordreChronologiqueCorrect, note: ordreChronologiqueCorrect ? `${total}/${total}` : `0/${total}` }
                : format === "association-paires"
                  ? { ...brut, correct: associationsCorrectes, note: associationsCorrectes ? `${total}/${total}` : `0/${total}` }
                  : brut,
          total,
          estQcm
            ? selectedChoice === questionA.indexReponseCorrecte
            : estClassementChronologique
              ? ordreChronologiqueCorrect
              : false,
          estClassementChronologique ? "" : estQcm ? "" : reponseCourteA,
           estQcm ? "qcm" : "courte",
             format === "court" && !estClassementChronologique
             ? {
                 consigne: questionA.question,
                 reponseAttendue: questionA.reponseAttendue,
                 explicationHistorique: questionA.explication,
                  documents: questionA.documents || [],
                  criteresCorrection: questionA.criteresCorrection || [],
               }
             : {},
        );
       const points = Number(String(parsed.note || '').split('/')[0]) || (parsed.correct ? total : 0);
       setFeedbackA(parsed);
      setIsAnswerValidated(true);
      setScoreA(prev => ({ correct: prev.correct + Math.min(total, Math.max(0, points)), total: prev.total + total }));
       const nivCalcul = obtenirNiveauPourResultat();
         await sauvegarderDansFirestore({
        eleve: studentName || "Anonyme", niveau: `Sec ${nivCalcul}`, section: "Section A",
        periodeId: questionA.periodeId, periode: questionA.periode, conceptsPfeq: questionA.conceptsPfeq, connaissancesPfeq: questionA.connaissancesPfeq,
        format: format, operationId: questionA.operationId || null, operation: questionA.operation || questionA.operationId || "Réponse courte", consigne: questionA.question,
         reponse: reponseSoumise, resultat: `${Math.min(total, Math.max(0, points))}/${total}`,
         note: `${Math.min(total, Math.max(0, points))}/${total}`, commentaire: parsed.commentaire || '-', detailCorrection: parsed,
         ...(format === "court" && !estClassementChronologique ? { criteresCibles: parsed.criteresCibles || [], criteresEvaluation: parsed.criteresEvaluation || [] } : {}),
         ...(operationQuestionA ? { criteresCibles: operationQuestionA.criteresObligatoires || [] } : {}),
       });
    } catch (err) {
      console.error(err);
      setErreurGlobal(err instanceof Error && err.message
        ? err.message
        : "CorrigeMoi rencontre un problème technique. Veuillez réessayer.");
    } finally { setLoadingCorrectionA(false); }
  }

  async function genererQuestionBPourOperation(operation: any, periodeCibleId?: number) {
    if (!exigerUnePeriodeSelectionnee()) return;
    
    // GESTION DU NOMBRE DE DOCUMENTS EN FONCTION DE LA DIFFICULTÉ
    let nbDocuments = "1 à 2 courts documents";
    if (operation.id === "mise-en-relation" || operation.id === "liens-causalite") {
      nbDocuments = "TROIS documents distincts";
    } else if (operation.id === "continuite-changement" || operation.id === "comparaisons") {
      nbDocuments = difficulteGroupe >= 4 ? "TROIS documents distincts" : "DEUX documents distincts";
    }

    const periodeCible = PERIODES_HISTORIQUES.find((periode) => periode.id === periodeCibleId);
    const contraintesVariation = genererConsigneDiversite(
      generationVariationRef.current,
      `le dossier de l’opération ${operation.nom}`,
    );
    const periodeImposee = periodeCible
      ? `\nPÉRIODE IMPOSÉE POUR CE DOSSIER : ${periodeCible.titre} (id ${periodeCible.id}). Tu dois utiliser cette période et aucune autre.`
      : "";
    // Les dossiers de cette opération alternent volontairement entre une
    // activité temporelle et une activité cartographique. Le modèle ne doit
    // jamais avoir à deviner la dimension demandée par l'application.
    const cycleEspaceTemps = Math.max(1, espaceTempsGenerationRef.current);
    const peutGenererEspace = !periodeCible || periodeCible.id >= 3;
    const doitGenererEspace = peutGenererEspace && cycleEspaceTemps % 2 === 0;
    const cycleTemps = Math.floor((cycleEspaceTemps - 1) / 2) % 3;
    const methodeTemps = cycleTemps === 0 ? "ordre" : cycleTemps === 1 ? "avant-apres" : "suite-chronologique";
    const dimensionVoulue = doitGenererEspace ? "espace" : "temps";
    const contrainteDimension = doitGenererEspace
      ? `\nDIMENSION OBLIGATOIRE : cette génération doit être exclusivement spatiale. Retourne type="espace" et dimension="espace". Ne demande aucune date, aucun ordre chronologique et aucune relation avant/après. Utilise une carte historique libre de droits de l'application.`
      : `\nDIMENSION OBLIGATOIRE : cette génération doit être exclusivement temporelle. Retourne type="temps" et dimension="temps". Ne demande jamais de situer un territoire ou un lieu : la tâche doit porter uniquement sur le temps.`;
    const contrainteMethodeTemps = doitGenererEspace
      ? ""
      : `\nMÉTHODE TEMPORELLE OBLIGATOIRE : force sousType="${methodeTemps}".`;
    let systemPrompt: string;
    if (operation.id === "espace-temps") {
      systemPrompt = `Tu es un concepteur de matériel pédagogique pour le cours d'Histoire du Québec et du Canada. Tu dois créer un exercice pour pratiquer l'opération intellectuelle suivante: "${operation.nom}". Définition: ${operation.def}
${genererContexteTemporel()}
${periodeImposee}
${contraintesVariation}
${genererConsigneDifficulte()}
${contrainteDimension}
${contrainteMethodeTemps}
Le champ "type" est déjà déterminé par la dimension obligatoire ci-dessus. Ne choisis pas l'autre dimension.
SI type = "espace":
- Choisis d'abord une "carteEra" parmi les 4 valeurs suivantes, EN RESPECTANT STRICTEMENT LA CONTRAINTE DE TEMPS IMPOSÉE :
  - "province-quebec" (Uniquement autorisée si la période imposée est >= 3)
  - "1867" (Uniquement autorisée si la période imposée est >= 5)
  - "1870-71" (Uniquement autorisée si la période imposée est >= 5)
  - "1999" (Uniquement autorisée si la période imposée est 8)
- SI AUCUNE de ces cartes n'est compatible avec la période imposée (ex: Période 1 ou 2), tu DOIS obligatoirement forcer type="temps" et ignorer le type espace.
- Si la carte est compatible, choisis un territoire parmi la liste de son époque :
  - "1867": Ontario, Québec, Nouveau-Brunswick, Nouvelle-Écosse
  - "1870-71": les 4 précédents + Manitoba + Colombie-Britannique
  - "1999": Yukon, Territoires du Nord-Ouest, Nunavut, Colombie-Britannique, Alberta, Saskatchewan, Manitoba, Ontario, Québec, Terre-Neuve, Nouveau-Brunswick, Île-du-Prince-Édouard, Nouvelle-Écosse
  - "province-quebec" (compare l'étendue territoriale à 2 moments) : choisis 2 années parmi "1763", "1774", "1783" dans "comparaisonAnnees".
       - Si type = "espace", ne génère aucun extrait de texte : retourne "documents":[] et utilise uniquement la carte historique en français comme support. "lieuCorrect" est le nom exact du territoire à choisir. Laisse "sousType", "referenceEvenement", "ordreCorrect", "classificationCorrecte" vides.
SI type = "temps":
${cycleTemps === 0
  ? `Utilise "sousType":"ordre". Génère exactement quatre documents distincts à placer du plus ancien au plus récent. La consigne doit être exactement de cette intention : "Placez les quatre documents suivants dans l’ordre chronologique de déroulement des événements, du plus ancien au plus récent." Les documents sont mélangés dans l’interface et seront affichés comme Documents A, B, C et D.`
  : cycleTemps === 1
    ? `Utilise obligatoirement "sousType":"avant-apres". Génère exactement quatre documents distincts et un "referenceEvenement". La consigne doit demander de déterminer si chacun des quatre faits survient avant ou après l’événement de référence. Retourne "classificationCorrecte" avec exactement deux valeurs "avant" et deux valeurs "apres", dans l’ordre des documents.`
    : `Utilise obligatoirement "sousType":"suite-chronologique". Génère exactement quatre documents distincts, puis quatre choix de réponses dans "ordrePropositions". Chaque choix doit contenir un tableau "ordre" de quatre indices de documents et un "libelle" lisible. Une seule proposition doit être correcte; indique son index dans "indexOrdreCorrect" et recopie le bon ordre dans "ordreCorrect". La consigne doit demander à l’élève de choisir la suite qui présente les quatre faits du plus ancien au plus récent, comme dans une question à choix de séquence.`
}
RÈGLE ABSOLUE : AUCUN document généré ne doit mentionner une année, une date précise ou une période chiffrée.
Génère 4 courts documents. "ordreCorrect" est un tableau des indices (0 à 3) du plus ancien au plus récent.
Réponds UNIQUEMENT en format JSON valide:
{"periode":"nom de la période","periodeId":1,"conceptsPfeq":["Concept officiel"],"connaissancesPfeq":["Connaissance officielle"],"type":"temps ou espace","dimension":"temps ou espace","repereAttendu":"repère interne","sousType":"ordre, avant-apres ou suite-chronologique","referenceEvenement":"","carteEra":"vide sauf si type=espace","comparaisonAnnees":"vide sauf si carteEra=province-quebec","lieuCorrect":"vide sauf si type=espace","documents":[{"titre":"titre du document","auteur":"","annee":"","typeDoc":"Source primaire, Source secondaire ou Statistique","reference":"","texte":"contenu sans date explicite"}],"ordreCorrect":[],"classificationCorrecte":[],"ordrePropositions":[],"indexOrdreCorrect":0,"explication":"","consigne":"la question posée"}`;
     } else if (operation.id === "continuite-changement") {
      systemPrompt = `Tu es un concepteur de matériel pédagogique pour le cours d'Histoire du Québec et du Canada. Crée un dossier pour déterminer une continuité et un changement entre deux moments historiques précis.
${genererContexteTemporel()}
${periodeImposee}
${contraintesVariation}
${genererConsigneDifficulte()}
Choisis exactement deux moments clairement nommés et compatibles avec les périodes imposées. Les documents doivent permettre de décrire chaque moment, d'identifier ce qui change, ce qui demeure et de citer des preuves. Rédige ${nbDocuments} documents pédagogiques historiquement exacts avec titre, auteur, année, typeDoc et référence. N'invente pas d'URL ni de lien d'image : l'application ajoutera les visuels libres après la génération.
Réponds UNIQUEMENT en JSON valide:
{"periode":"nom de la période","periodeId":1,"conceptsPfeq":["Concept officiel"],"connaissancesPfeq":["Connaissance officielle"],"moments":["premier moment précis","second moment précis"],"documents":[{"titre":"","auteur":"","annee":"","typeDoc":"Source primaire, Source secondaire, Statistique ou Iconographique","reference":"","texte":"","imageUrl":"","imageAlt":"","imageLicense":""}],"consigne":"Compare les deux moments et détermine un changement et une continuité à l'aide des documents."}`;
    } else if (operation.id === "comparaisons") {
      systemPrompt = `Tu es un concepteur de matériel pédagogique pour le cours d'Histoire du Québec et du Canada. Tu dois créer un dossier documentaire pour pratiquer l'opération intellectuelle suivante: "${operation.nom}". Définition: ${operation.def} La tâche doit demander à l'élève de: ${operation.consigneType}.
${genererContexteTemporel()}
${periodeImposee}
${contraintesVariation}
${genererConsigneDifficulte()}
Choisis exactement trois acteurs ou historiens qui prennent position sur un même enjeu. Rédige exactement trois extraits textuels, un par acteur, sans révéler directement lequel est dissident. Les deux premiers acteurs peuvent partager une position et le troisième s’en distinguer, mais mélange l’ordre des documents.
Rédige les documents avec titre, auteur, année, typeDoc et référence lorsque disponibles. N’invente pas d’URL ni de lien d’image. Utilise uniquement des documents textuels. Rédige tous les textes en français avec des apostrophes typographiques (’). Réponds UNIQUEMENT en format JSON valide: {"periode":"nom de la période","periodeId":1,"conceptsPfeq":["Concept officiel"],"connaissancesPfeq":["Connaissance officielle"],"acteursComparer":["acteur 1","acteur 2","acteur 3"],"enjeuCommun":"enjeu commun","acteurDissident":"un des trois acteurs","positionDissidenteAttendue":"Alors que les deux autres acteurs…, cet acteur…","positionCommuneAttendue":"Tout comme le premier acteur, le deuxième…","marqueursRelationAttendus":["Tout comme","Alors que"],"documents":[{"titre":"","auteur":"","annee":"","typeDoc":"Source primaire ou Source secondaire","reference":"","texte":""}],"consigne":""}`;
     } else {
        const consigneOperation = operation.id === "faits"
          ? `repérer et nommer un seul fait historique précis. La consigne doit utiliser un verbe d'action direct comme nommer, identifier ou relever. La réponse attendue est un nom, une date, un mot-clé ou une courte phrase factuelle; elle vaut exactement 1 point.`
         : operation.consigneType;
        const schemaSortieOperation = operation.id === "mise-en-relation"
        ? `{"periode":"nom de la période","periodeId":1,"conceptsPfeq":["Concept officiel"],"connaissancesPfeq":["Connaissance officielle"],"operationId":"mise-en-relation","type":"operation","format":"association-paires","realiteCommune":"un seul thème historique précis","documents":[{"titre":"","auteur":"","annee":"","typeDoc":"Source primaire ou Source secondaire","reference":"","texte":"manifestation concrète du fait général 2"},{"titre":"","auteur":"","annee":"","typeDoc":"Source primaire ou Source secondaire","reference":"","texte":"manifestation concrète du fait général 3"},{"titre":"","auteur":"","annee":"","typeDoc":"Source primaire ou Source secondaire","reference":"","texte":"manifestation concrète du fait général 1"}],"faitsRelier":["fait général lié au thème 1","fait général lié au thème 2","fait général lié au thème 3"],"propositions":["fait général lié au thème 1","fait général lié au thème 2","fait général lié au thème 3"],"associationsAttendues":[1,2,0],"constatAttendu":"Les trois faits illustrent la même réalité historique sans relation causale.","marqueursRelationAttendus":["illustre"],"consigne":"Dans ce thème historique commun, pour chaque fait général, inscrivez le numéro du document qui présente une manifestation concrète apparentée."}`
          : operation.id === "liens-causalite"
            ? `{"periode":"nom de la période","periodeId":1,"conceptsPfeq":["Concept officiel"],"connaissancesPfeq":["Connaissance officielle"],"operationId":"liens-causalite","type":"operation","format":"causalite-3","documents":[{"titre":"","auteur":"","annee":"","typeDoc":"Source primaire ou Source secondaire","reference":"","texte":""},{"titre":"","auteur":"","annee":"","typeDoc":"Source primaire ou Source secondaire","reference":"","texte":""},{"titre":"","auteur":"","annee":"","typeDoc":"Source primaire ou Source secondaire","reference":"","texte":""}],"etapes":["étape A","étape B","étape C"],"liensAttendus":["A entraîne B","B entraîne C"],"marqueursRelationAttendus":["entraîne"],"consigne":"Expliquez l’enchaînement entre les trois étapes."}`
            : `{"periode":"nom de la période","periodeId":1,"conceptsPfeq":["Concept officiel"],"connaissancesPfeq":["Connaissance officielle"],"operationId":"${operation.id}","type":"operation","documents":[{"titre":"","auteur":"","annee":"","typeDoc":"Source primaire ou Source secondaire","reference":"","texte":""}],"consigne":"Question posée à l’élève."}`;
       systemPrompt = `Tu es un concepteur de matériel pédagogique pour le cours d'Histoire du Québec et du Canada. Tu dois créer un dossier documentaire pour pratiquer l'opération intellectuelle suivante: "${operation.nom}". Définition: ${operation.def} La tâche doit demander à l'élève de: ${consigneOperation}.
${genererContexteTemporel()}
${periodeImposee}
${contraintesVariation}
${genererConsigneDifficulte()}
          Rédige ${nbDocuments} documents pédagogiques historiquement exacts. Pour chacun, ajoute titre, auteur, année, typeDoc et référence. Utilise uniquement des documents textuels ou statistiques : aucune photo, carte, affiche, portrait ou URL d’image dans le dossier. Les cartes libres sont chargées séparément dans l’encadré prévu pour l’opération « Situer dans le temps et dans l’espace ». Rédige tous les textes en français avec des apostrophes typographiques (’). Réponds UNIQUEMENT en format JSON valide selon ce schéma obligatoire : ${schemaSortieOperation}`;
    }
      systemPrompt += `\nCONTRAT PÉDAGOGIQUE ET MÉTADONNÉES INTERNES OBLIGATOIRES : ${contratOperationPourPrompt(operation)}
 La consigne doit être formulée selon ce contrat sans révéler la réponse. Retourne tous les champs internes demandés, y compris "operationId" et "marqueursRelationAttendus", dans l'objet JSON.
  RÈGLE DE NON-RÉVÉLATION : chaque document doit fournir des indices interprétables, mais ne doit jamais écrire directement la réponse attendue, le lieu, l'ordre correct, la cause, la conséquence, la similitude, la différence, la continuité ou le changement demandé. N'utilise pas la formulation interne attendue comme titre, citation ou conclusion du document.
  ${operation.id === "liens-causalite"
    ? "QUESTION À TROIS PICOTS OBLIGATOIRE : la consigne doit contenir une courte introduction suivie d’exactement trois lignes distinctes commençant chacune par « - ». Chaque ligne doit être un énoncé nominal court correspondant à une étape de la chaîne A → B → C. Ne fusionne jamais les trois énoncés dans une phrase ou un paragraphe."
    : ""}`;
      try {
        return await executerGenerationAvecTentatives(async () => {
         const response = await callGenerationService('generer', { prompt: systemPrompt });
         let parsed = extraireJSON<any>(response.text);
          // Le dossier est généré pour une opération déjà connue. Ne laissons
          // pas une omission bénigne de Gemini transformer toute l'activité en
          // « dossier indisponible ».
          parsed.operationId = operation.id;
          if (operation.id === "espace-temps") {
            parsed.type = dimensionVoulue;
            parsed.dimension = dimensionVoulue;
            if (dimensionVoulue === "temps") {
              parsed.sousType = methodeTemps;
              parsed.consigne = CONSIGNES_ESPACE_TEMPS[methodeTemps as keyof typeof CONSIGNES_ESPACE_TEMPS];
             } else {
               parsed.documents = [];
                parsed.consigne = "Quel territoire la carte permet-elle d’associer au fait historique présenté dans les documents ?";
            }
          } else {
            parsed.type = "operation";
          }
          const periodeIdQuestionB = periodeCibleId ?? resoudrePeriodeId(parsed.periode, parsed.periodeId, periodesSelectionnees[0]);
         parsed.periodeId = periodeIdQuestionB;
         parsed = await reparerRattachementPFEQ(systemPrompt, parsed);
         parsed.periodeId = periodeIdQuestionB;
          parsed.operationId = operation.id;
          if (operation.id === "espace-temps") {
            parsed.type = dimensionVoulue;
            parsed.dimension = dimensionVoulue;
            if (dimensionVoulue === "temps") {
              parsed.sousType = methodeTemps;
              parsed.consigne = CONSIGNES_ESPACE_TEMPS[methodeTemps as keyof typeof CONSIGNES_ESPACE_TEMPS];
            }
          } else {
            parsed.type = "operation";
          }
           parsed = normaliserAssociationPairesSectionA(parsed);
          if (operation.id === "liens-causalite") {
            parsed.consigne = normaliserConsigneTroisPicots(parsed.consigne, parsed.etapes);
          }
         const expectedDocumentCount = parsed.type === "temps" ? 4
            : operation.id === "liens-causalite" ? 3
             : operation.id === "comparaisons" ? 3
              : operation.id === "continuite-changement" ? (difficulteGroupe >= 4 ? 3 : 2)
              : undefined;
          const normaliserMetadonneesOperation = (dossier: any) => {
            dossier.operationId = operation.id;
            dossier.points = pointsOperation(dossier, operation.id);
            dossier.formatReponse = operation.formatAttendu;
            dossier.format = operation.id === "espace-temps"
              ? (dossier.type === "espace" || dossier.dimension === "espace" ? "carte" : "classement")
              : ({
                faits: "court",
                "mise-en-relation": "association-paires",
                "causes-consequences": "court",
                "liens-causalite": "causalite-3",
                "continuite-changement": "changement-continuite",
                comparaisons: "comparaison",
              } as Record<string, string>)[operation.id];
            if (operation.id === "causes-consequences") dossier.exigeJustification = true;
            return dossier;
          };
          const validerDossier = (dossier: any) => {
            normaliserMetadonneesOperation(dossier);
            harmoniserDossierOperation(dossier);
           if (!periodeAutorisee(periodeIdQuestionB)) throw new Error("Le dossier généré utilise une période désactivée.");
           validerQuestionB(dossier, operation.id, periodesSelectionnees, expectedDocumentCount);
           if (dossier.type === "temps" && dossier.documents.length !== 4) {
             throw new Error("Le classement chronologique doit conserver exactement quatre documents.");
           }
         };
         try {
           validerDossier(parsed);
         } catch (validationError) {
           // Une sortie presque conforme peut être réparée sans jeter toute la
           // génération. La sortie réparée passe exactement par le même contrat.
           const repairResponse = await callGenerationService('generer', {
             prompt: `${systemPrompt}

La sortie JSON suivante est presque conforme, mais elle a échoué au contrat de validation :
${JSON.stringify(parsed)}

Erreur de validation : ${validationError instanceof Error ? validationError.message : String(validationError)}
${(operation.marqueursRecommandes || []).length
  ? `Marqueurs de relation autorisés pour cette opération (à employer mot pour mot dans les réponses attendues et à inscrire dans "marqueursRelationAttendus") : ${(operation.marqueursRecommandes || []).map((groupe: any) => `${groupe.typeLien} : ${groupe.marqueurs}`).join(" ; ")}.`
  : ""}
La consigne doit rester une question qui nomme explicitement les documents et se termine par un point d’interrogation, sans verbe directif.

Répare uniquement les champs nécessaires. Conserve le thème historique, la période imposée et les documents vérifiables. Retourne un seul objet JSON complet, sans Markdown, avec tous les champs exigés par le schéma initial. Pour un exercice spatial, retourne une carte compatible et aucun document; pour un exercice temporel, retourne exactement quatre documents et les métadonnées de classement requises.`,
           });
           const repaired = extraireJSON<any>(repairResponse.text);
           parsed = { ...parsed, ...repaired };
           parsed.operationId = operation.id;
           parsed.periodeId = periodeIdQuestionB;
           if (operation.id === "espace-temps") {
             parsed.type = dimensionVoulue;
             parsed.dimension = dimensionVoulue;
             if (dimensionVoulue === "temps") {
               parsed.sousType = methodeTemps;
               parsed.consigne = CONSIGNES_ESPACE_TEMPS[methodeTemps as keyof typeof CONSIGNES_ESPACE_TEMPS];
             } else {
               parsed.documents = [];
              parsed.consigne = "Quel territoire la carte permet-elle d’associer au fait historique présenté dans les documents ?";
             }
           } else {
             parsed.type = "operation";
           }
           parsed = normaliserAssociationPairesSectionA(parsed);
           if (operation.id === "liens-causalite") {
             parsed.consigne = normaliserConsigneTroisPicots(parsed.consigne, parsed.etapes);
           }
           parsed = await reparerRattachementPFEQ(systemPrompt, parsed);
           parsed.periodeId = periodeIdQuestionB;
           parsed.operationId = operation.id;
           validerDossier(parsed);
         }
          if (parsed.type === 'temps' && parsed.sousType === 'ordre') { setPlacementOrdre(new Array((parsed.documents || []).length).fill(null)); }
          if (parsed.type === 'temps' && parsed.sousType === 'avant-apres') { setPlacementAvantApres({}); }
          if (parsed.type === 'temps' && parsed.sousType === 'suite-chronologique') { setSelectedChronologyOption(null); }
         if (parsed.type === 'espace' && parsed.carteEra === 'province-quebec') { setModeCarteComparaison(Math.random() < 0.5 ? 'identifier' : 'comparer'); }
          memoriserQuestionsGenerees([parsed], operation.id);
          return parsed;
       }, 3);
     } catch(err) {
        // Le détail reste dans la console pour le diagnostic développeur; la
        // couche appelante affiche un message sûr et actionnable à l'élève.
        console.warn(`Impossible de produire le dossier ${operation.id}`, err);
        throw err;
     }
  }

  async function genererQuestionsB() {
    if (!exigerUnePeriodeSelectionnee()) return;
    if (operationsSelectionnees.length === 0) {
      setErreurGlobal("Sélectionne au moins une opération intellectuelle avant de générer les questions.");
      return;
    }
    const variationCycle = ++generationVariationRef.current;
    espaceTempsGenerationRef.current += 1;
    const operations = OPERATIONS.filter((operation) => operationsSelectionnees.includes(operation.id));
    const periodeOffset = variationCycle - 1;
    setLoadingQuestionB(true);
    setErreurGlobal(null);
    // Keep the active dossier visible while the replacement is generated. This
    // prevents a blank state from discarding the student's current context.
    setFeedbackB(null);
    setReponseB("");
    setResultatSituerTemps(null);
    setResultatSituerEspace(null);
    setLieuSelectionne(null);
    setPlacementOrdre([]);
    setPlacementAvantApres({});
    setQuestionsB([]);
    try {
      const dossiers = await Promise.all(operations.map(async (operation): Promise<DossierOperationB> => {
        try {
          const index = operations.indexOf(operation);
          const periodeCibleId = periodesSelectionnees.length > 0
            ? periodesSelectionnees[(index + periodeOffset) % periodesSelectionnees.length]
            : undefined;
          const question = periodeCibleId === undefined
            ? await genererQuestionBPourOperation(operation)
            : await genererQuestionBPourOperation(operation, periodeCibleId);
          if (!question) throw new Error("Le dossier généré est vide.");
          return { operation, question };
        } catch (error) {
          console.error("Échec de génération d’une opération de la Section B", {
            operationId: operation.id,
            error,
          });
          return {
            operation,
            question: null,
            error: "Ce dossier n’a pas pu être généré ou ne respecte pas le contrat attendu. Tu peux relancer la génération.",
          };
        }
      }));
      setQuestionsB(dossiers);
      const premierDossierValide = dossiers.find((dossier) => dossier.question);
      const premierDossier = premierDossierValide || dossiers[0];
      setCurrentOp(premierDossier?.operation || null);
      setQuestionB(premierDossier?.question || null);
    } catch (error) {
      afficherErreurGeneration("section-b", error);
    } finally {
      setLoadingQuestionB(false);
    }
  }

  async function genererSchemaB() {
    if (!exigerUnePeriodeSelectionnee()) return;
    const periodesCiblees = [...periodesSelectionnees];
    setLoadingSchemaB(true);
    setErreurGlobal(null);
    setQuestionSchemaB(null);
    setFeedbackSchemaB(null);
    setSelectionsSchemaB({});
    setReponsesSchemaB({});
    setReponseCentraleSchemaB("");
    setSousReponsesSchemaB({});
    setNotesDocumentsSchemaB({});
  const systemPrompt = `Tu es un concepteur d'examen ministériel d'histoire du Québec et du Canada de secondaire ${niveauScolaire}. Crée un schéma conceptuel de discrimination documentaire inspiré de la question 22 sur le gouvernement Duplessis, mais applique-le à une thématique compatible avec les périodes choisies. Reproduis strictement cette topologie visuelle 1 → 2 → 4 : un seul bloc de départ à gauche, intitulé "Objet de la description" et contenant le concept central; deux grands panneaux centraux empilés verticalement, les branches 1 et 2; chaque panneau contient sa branche et se divise vers exactement deux boîtes finales à droite. Il ne doit y avoir aucune branche supplémentaire, aucun nœud supplémentaire et exactement quatre feuilles finales. Les nœuds 3 et 4 ont obligatoirement "parentId":1, et les nœuds 5 et 6 ont obligatoirement "parentId":2. Les noms de toutes les cases doivent reprendre mot pour mot un concept, une rubrique ou une connaissance officielle de la réalité sociale et ne doivent jamais utiliser de libellé interne comme "Volet", "Moyens" ou "Objectif". Fournis EXACTEMENT 8 documents variés : exactement 5 documents pertinents au schéma et exactement 3 leurres anachroniques ou idéologiquement opposés. Inclus au moins une source primaire, une source secondaire et un document statistique ou iconographique. Pour TOUS les documents de type "Iconographique", fournis obligatoirement une vraie image libre de droits tirée d'Internet dans Wikimedia Commons : une URL publique directe fonctionnelle dans "imageUrl", une "imageAlt" et une "imageLicense" égale à "Domaine public" ou "CC BY-SA". Ne mets jamais de champ imageUrl vide pour un document iconographique et ne fabrique jamais d'URL; si nécessaire, utilise une image du catalogue Wikimedia fourni. Rédige pour chaque document une référence bibliographique universitaire complète, sous la forme Auteur. (date). Titre [type de document]. Source. URL, sans préfixes "Auteur :" ou "Date :". Pour chaque document, ajoute les métadonnées internes "pertinentParBranche", "isLeurre" et "justificationInterne"; le contenu et le titre ne doivent jamais révéler à l'élève qu'il s'agit d'un leurre. N'envoie jamais de nœuds supplémentaires : retourne exactement 6 branches avec les identifiants 1 à 6 et les parents demandés. ${genererContexteTemporel()} ${genererConsigneDifficulte()} Réponds UNIQUEMENT en JSON valide : {"periodeId":1,"periode":"Nom exact de la période","conceptCentral":"Gouvernement, premier ministre ou réalité historique au centre du schéma","consigne":"Consigne générale","documents":[{"titre":"","typeDoc":"Source primaire ou Source secondaire ou Statistique ou Iconographique","reference":"Auteur. (date). Titre [type de document]. Source. URL","auteur":"","annee":"","texte":"","imageUrl":"","imageAlt":"","imageLicense":"","pertinentParBranche":[1],"isLeurre":false,"justificationInterne":""}],"branches":[{"id":1,"niveau":1,"parentId":null,"nom":"Libellé officiel du programme","consigne":"Lien historique exact à établir","placeholder":"...","elementsAttendus":["..."]},{"id":2,"niveau":1,"parentId":null,"nom":"Libellé officiel du programme","consigne":"Lien historique exact à établir","placeholder":"...","elementsAttendus":["..."]},{"id":3,"niveau":2,"parentId":1,"nom":"Libellé officiel du programme","consigne":"Lien historique exact à établir","placeholder":"...","elementsAttendus":["..."]},{"id":4,"niveau":2,"parentId":1,"nom":"Libellé officiel du programme","consigne":"Lien historique exact à établir","placeholder":"...","elementsAttendus":["..."]},{"id":5,"niveau":2,"parentId":2,"nom":"Libellé officiel du programme","consigne":"Lien historique exact à établir","placeholder":"...","elementsAttendus":["..."]},{"id":6,"niveau":2,"parentId":2,"nom":"Libellé officiel du programme","consigne":"Lien historique exact à établir","placeholder":"...","elementsAttendus":["..."]}]}`;
    let derniereErreur: unknown = null;
    try {
      for (let tentative = 1; tentative <= 2; tentative += 1) {
        try {
          const promptAvecRegleDeSelection = `${systemPrompt}\n\nRÈGLE DE SÉLECTION : une seule période sélectionnée est parfaitement valide. Tu dois alors générer le schéma uniquement pour cette période. Deux, trois ou quatre périodes sélectionnées sont également valides; ne demande jamais un minimum de trois périodes et ne dis jamais que trois périodes sont obligatoires.`;
          const promptTentative = tentative === 1
            ? promptAvecRegleDeSelection
            : `${promptAvecRegleDeSelection}\n\nSECONDE TENTATIVE AUTOMATIQUE : la sortie précédente était invalide. Vérifie avant de répondre : exactement 6 nœuds, deux parents de niveau 1, deux enfants sous chacun, 8 documents, 5 pertinents et 3 leurres, et une seule période parmi celles sélectionnées.`;
          const response = await callGenerationService('generer', { prompt: promptTentative });
          let parsed = extraireJSON<any>(response.text);
          parsed.branches = normaliserBranchesSchema(Array.isArray(parsed.branches) ? parsed.branches.map((branch: any, index: number) => ({
            ...branch,
            id: Number(branch.id || index + 1),
            niveau: Number(branch.niveau) || (Number(branch.parentId) ? 2 : 1),
            parentId: branch.parentId === null || branch.parentId === undefined || branch.parentId === "" ? null : Number(branch.parentId),
          })) : parsed.branches);
          const periodeIdSchema = resoudrePeriodeId(parsed.periode, parsed.periodeId, periodesCiblees[0]);
          parsed.periodeId = periodeIdSchema;
          parsed = await reparerRattachementPFEQ(promptTentative, parsed);
          parsed.periodeId = periodeIdSchema;
           const realiteSchema = trouverRealitePFEQ(periodeIdSchema);
           parsed.consigne = CONSIGNE_SCHEMA_CONCEPTUEL;
           parsed.conceptCentral = realiteSchema?.titre || parsed.conceptCentral;
           parsed.questionDirectricePfeq = realiteSchema?.question || "";
           parsed.branches = alignerBranchesSchemaPFEQ(
             nettoyerBranchesSchema(normaliserBranchesSchema(parsed.branches)),
             realiteSchema,
           );
          if (!Number.isInteger(periodeIdSchema) || !periodesCiblees.includes(periodeIdSchema) || !periodesPermises.includes(periodeIdSchema)) {
            throw new Error("Le schéma généré utilise une période désactivée.");
          }
          validerSchemaB(parsed, periodesCiblees);
          const documentsEnrichis = await enrichirDocumentsAvecVisuels(parsed.documents, periodeIdSchema, 0);
          if (documentsEnrichis.length !== 8 || compterDocumentsIconographiques(documentsEnrichis) < 1 || !documentsIconographiquesComplets(documentsEnrichis)) {
            throw new Error("Le schéma doit conserver ses huit documents et fournir une image libre pour chaque document iconographique.");
          }
          parsed.documents = melangerDocuments(documentsEnrichis);
          parsed.periodeId = periodeIdSchema;
           validerSchemaB(parsed, periodesCiblees);
          setQuestionSchemaB(parsed);
          return;
        } catch (err) {
          derniereErreur = err;
          console.warn(`Échec de génération du schéma, tentative ${tentative}/2`, err);
        }
      }
      setErreurGlobal("Le schéma conceptuel n’a pas pu être généré après deux tentatives automatiques. Vérifie la période sélectionnée, puis réessaie.");
      console.error("Échec définitif de la génération du schéma conceptuel", derniereErreur);
    } finally { setLoadingSchemaB(false); }
  }

  async function corrigerSchemaB() {
    if (!questionSchemaB) return;
    const schemaSansReponse = !reponseCentraleSchemaB.trim()
      && Object.values(reponsesSchemaB).every((value) => !String(value || "").trim())
      && Object.values(sousReponsesSchemaB).every((value) => !String(value || "").trim())
      && Object.values(selectionsSchemaB).every((value) => !Array.isArray(value) || value.length === 0);
    if (schemaSansReponse) {
      setErreurGlobal(CONSIGNE_REPONSE_VIDE);
      return;
    }
    if (!reponseCentraleSchemaB.trim()) {
      setErreurGlobal("Reformule la question centrale dans le nœud du schéma avant de valider.");
      return;
    }
    const allBranches = questionSchemaB.branches || [];
    const branchesPrincipales = allBranches.filter((branch: any) => branch.parentId === null || branch.parentId === undefined || Number(branch.niveau) === 1).slice(0, 2);
    const branchesIncomplete = branchesPrincipales.some((branch: any, index: number) => {
      const id = Number(branch.id || index + 1);
      return !(reponsesSchemaB[id] || "").trim() || !(selectionsSchemaB[id] || []).length ||
        getSchemaSubnodes(branch, allBranches).some((subNode: any) => {
          const responseKey = `${id}-${subNode.id}`;
          const documentsKey = `sub-${responseKey}`;
          return !(sousReponsesSchemaB[responseKey] || "").trim() || !(selectionsSchemaB[documentsKey] || []).length;
        });
    });
    if (branchesIncomplete) {
      setErreurGlobal("Complète le nœud central, chaque branche et ses sous-boîtes, puis sélectionne au moins un document dans chaque boîte.");
      return;
    }
    setLoadingSchemaB(true); setErreurGlobal(null);
    const documents = (questionSchemaB.documents || []).map((document: any, index: number) => `Doc ${String.fromCharCode(65 + index)} (${document.typeDoc || "document"}) ${document.titre}: ${document.texte} [métadonnées internes à vérifier : branches=${JSON.stringify(document.pertinentParBranche || [])}; leurre=${Boolean(document.isLeurre)}]`).join(" | ");
    const realiteSchema = trouverRealitePFEQ(Number(questionSchemaB.periodeId));
    const contexteMinistérielSchema = realiteSchema
      ? `Question directrice officielle : ${realiteSchema.question}. Concepts officiels : ${realiteSchema.concepts.join(" | ")}. Rubriques officielles : ${realiteSchema.rubriques.join(" | ")}. Connaissances officielles : ${realiteSchema.connaissances.join(" | ")}.`
      : "Le rattachement officiel de la période est indisponible; ne crée aucun libellé ministériel.";
    const branches = branchesPrincipales.map((branch: any, index: number) => {
      const id = Number(branch.id || index + 1);
       const sousNoeuds = getSchemaSubnodes(branch, allBranches).map((subNode: any) => {
         const responseKey = `${id}-${subNode.id}`;
         const documentsKey = `sub-${responseKey}`;
        const documentsSousNoeud = (selectionsSchemaB[documentsKey] || []).map((docIndex) => String.fromCharCode(65 + docIndex)).join(", ") || "(aucun)";
        return `${nettoyerNomNoeudSchema(subNode.nom, "Sous-boîte")}="${sousReponsesSchemaB[responseKey] || "(vide)"}"; documents choisis=${documentsSousNoeud}`;
      }).join(", ");
      return `Branche ${id} ${nettoyerNomNoeudSchema(branch.nom, `Branche principale ${id}`)}: réponse="${reponsesSchemaB[id] || "(vide)"}"; sous-boîtes=${sousNoeuds || "(aucune)"}; documents choisis=${(selectionsSchemaB[id] || []).map((docIndex) => String.fromCharCode(65 + docIndex)).join(", ") || "(aucun)"}; éléments attendus=${JSON.stringify(branch.elementsAttendus || [])}`;
    }).join(" | ");
      const correctionPrompt = `Tu es un correcteur d'histoire du Québec et du Canada. Corrige le schéma conceptuel sur 8 points, soit 2 points par branche. ${contexteMinistérielSchema} Question centrale proposée par l'élève : "${reponseCentraleSchemaB}". Documents : ${documents}. Réponses soumises : ${branches}.

CRITÈRES MINISTÉRIELS À APPLIQUER POUR CHAQUE BRANCHE :
${CRITERES_SCHEMA_PFEQ.map((critere, index) => `${index + 1}. ${critere}`).join("\n")}
Pour chaque branche, accorde 0,5 point à chacun des quatre critères; la note de la branche est donc sur 2. Vérifie les quatre sous-boîtes, la cohérence avec la question directrice et l'exactitude historique. Un libellé qui ne correspond pas à un concept, une rubrique ou une connaissance officielle ne peut pas obtenir le point de mobilisation du programme. Distingue les documents pertinents et hors sujet par branche sans te fier aveuglément aux métadonnées internes. Pour chaque branche et chaque sous-boîte, explique le lien entre au moins un extrait documentaire et la réponse donnée par l'élève. Une réponse d'un seul mot est une tentative valide : corrige-la quand même, indique ce qu'elle démontre et demande ensuite une phrase complète si elle doit être développée. Le champ "commentaireGlobal" doit contenir uniquement l'analyse générale : une première phrase qui indique clairement ce qui fonctionne ou ne fonctionne pas, puis une ligne vide, puis une explication qui aide l'élève à formuler sa réponse. Ne mets jamais dans "commentaireGlobal" de point fort, de défi, d'élément à travailler, d'astuce documentaire ou leurs étiquettes; ces informations vont dans leurs champs séparés.
Réponds UNIQUEMENT en JSON valide : {"noteGlobale":"X/8","commentaireGlobal":"Première phrase de diagnostic.\\n\\nExplication pour aider à formuler la réponse.","lienExtraitReponse":"Lien explicite entre un extrait et la réponse de l'élève","details":[{"branchId":1,"nom":"Libellé officiel","note":"X/2","evaluation":"...","lienExtraitReponse":"Lien explicite entre un extrait et la réponse de la branche","documentsPertinents":["A"],"documentsHorsSujet":["B"],"criteresRespectes":["..."],"criteresARetravailler":["..."],"preuveDocumentaire":"Extrait précis et lien démontré"}],"pisteAmelioration":"Conseil précis","pointFort":"Réussite observée","elementATravailler":"Élément à retravailler","astuceDocumentaire":"Méthode pour choisir une preuve","progressionOperation":"Progression dans l'opération"}`;
    try {
      const response = await callGenerationService('corriger', { prompt: `${CONSIGNE_ORTHOGRAPHE_NOMS}\n${correctionPrompt}` });
      const parsed = extraireJSON<any>(response.text);
      const feedbackNormalise = normaliserFeedbackSchema(parsed, branchesPrincipales);
       setFeedbackSchemaB(feedbackNormalise);
       const nivCalcul = obtenirNiveauPourResultat();
      await sauvegarderDansFirestore({
        eleve: studentName || "Anonyme", niveau: `Sec ${nivCalcul}`, section: "Section B",
        periodeId: questionSchemaB.periodeId, periode: questionSchemaB.periode, conceptsPfeq: questionSchemaB.conceptsPfeq, connaissancesPfeq: questionSchemaB.connaissancesPfeq,
        operationId: null, operation: "Schéma conceptuel", consigne: questionSchemaB.consigne || questionSchemaB.conceptCentral,
         reponse: JSON.stringify({ central: reponseCentraleSchemaB, branches: reponsesSchemaB, sousNoeuds: sousReponsesSchemaB, documents: selectionsSchemaB, notesDocuments: notesDocumentsSchemaB }),
          resultat: feedbackNormalise.noteGlobale || "Non évalué", note: feedbackNormalise.noteGlobale || "-", commentaire: feedbackNormalise.commentaireGlobal || "-", detailCorrection: feedbackNormalise
      });
    } catch (err) {
      console.error(err);
      setErreurGlobal("CorrigeMoi rencontre un problème technique. Veuillez réessayer.");
    } finally { setLoadingSchemaB(false); }
  }

  async function corrigerReponseB() {
    if (!questionB || !currentOp) return;
    const reponseOperationVide = !reponseB.trim()
      || (currentOp.id === "continuite-changement" && (() => {
        try {
          const reponse = JSON.parse(reponseB);
          return Object.values(reponse).every((value) => !String(value || "").trim());
        } catch {
          return true;
        }
      })());
    if (reponseOperationVide) {
      setErreurGlobal(CONSIGNE_REPONSE_VIDE);
      return;
    }
    if (!estReponseOperationComplete()) {
      setErreurGlobal("Complète les éléments demandés avant de lancer corrige.moi.");
      return;
    }
    setLoadingCorrectionB(true); setErreurGlobal(null);
    const pointsQuestion = Number(questionB.points) || pointsOperation(questionB, currentOp.id);
    const infosSources = `Documents fournis: ${(questionB.documents||[]).map((d: any, i: number)=>`Doc ${String.fromCharCode(65+i)}: ${d.texte}`).join(" | ")}`;
       const correctionPrompt = `Tu es un enseignant d'histoire du Québec et du Canada de secondaire ${niveauScolaire}. Corrige la réponse selon l'opération intellectuelle "${currentOp.nom}" et son format exigé : ${currentOp.formatAttendu}. Contrat exact : ${contratOperationPourPrompt(currentOp)}. Le barème de cette question est exactement de ${pointsQuestion} point${pointsQuestion > 1 ? "s" : ""}; n'utilise jamais un autre dénominateur. ${infosSources} Consigne : ${questionB.consigne}. Réponse de l'élève : "${reponseB}". Vérifie séparément chaque critère obligatoire et n'accorde jamais un lien seulement implicite. Respecte la progression des apprentissages du PFEQ et la méthode historique : exactitude du fait, repère temporel ou spatial pertinent, preuve et relation explicitée selon la tâche. Le champ "commentaire" doit contenir uniquement l'analyse générale : une première phrase qui indique clairement ce qui fonctionne ou ne fonctionne pas, puis une ligne vide, puis une explication qui aide l'élève à formuler sa réponse. Ne mets jamais dans "commentaire" de point fort, de défi, d'élément à travailler, d'astuce documentaire ou leurs étiquettes; ces informations vont dans leurs champs séparés. L'exemple de réponse doit respecter exactement la structure de l'opération et employer les bons marqueurs de relation. Ajoute "diagnosticOperation" : les critères réellement respectés, ceux à retravailler, les marqueurs réellement employés par l'élève, une preuve documentaire précise et un champ "lienExtraitReponse" qui explique clairement comment l'extrait soutient ou contredit la réponse. Chaque critère obligatoire doit apparaître dans l'une des deux listes de diagnostic : ne considère jamais une liste vide comme une évaluation complète. Même si la réponse est sans rapport, propose un point fort motivationnel orienté vers la prochaine action; n'écris jamais "aucun point fort décelé". ${(questionB.documents || []).length ? "Donne une astuce documentaire." : "Retourne une chaîne vide pour astuceDocumentaire."} Réponds UNIQUEMENT en JSON valide: {"niveau":"Réussi / Réussi partiellement / À revoir","note":"x/${pointsQuestion}","commentaire":"Première phrase de diagnostic.\n\nExplication pour aider à formuler la réponse.","pisteAmelioration":"conseil court avec marqueur utile","exempleReponse":"réponse modèle structurée selon l'opération","diagnosticOperation":{"criteresRespectes":[],"criteresARetravailler":[],"marqueursUtilises":[],"preuveDocumentaire":"Indice précis observé ou attendu","lienExtraitReponse":"Lien explicite entre un extrait et la réponse de l'élève"},"lienExtraitReponse":"Lien explicite entre un extrait et la réponse de l'élève","pointFort":"encouragement concret","elementATravailler":"élément à retravailler","astuceDocumentaire":"","progressionOperation":"progression dans l'opération"}`;
    try {
      const response = await callGenerationService('corriger', { prompt: `${CONSIGNE_ORTHOGRAPHE_NOMS}\n${correctionPrompt}` });
       const parsed = extraireJSON<any>(response.text);
       validerFeedbackOperation(parsed, currentOp.id);
        const feedbackNormalise = normaliserFeedbackCourte(parsed, pointsQuestion, parsed?.niveau === "Réussi");
       setFeedbackB({ ...feedbackNormalise, niveau: parsed?.niveau || "Évalué" });
       const nivCalcul = obtenirNiveauPourResultat();
        await sauvegarderDansFirestore({
           eleve: studentName || "Anonyme", niveau: `Sec ${nivCalcul}`, section: "Section B", periodeId: questionB.periodeId, periode: questionB.periode, conceptsPfeq: questionB.conceptsPfeq, connaissancesPfeq: questionB.connaissancesPfeq, operationId: currentOp.id, operation: currentOp.nom, consigne: questionB.consigne, reponse: reponseB, resultat: parsed.niveau || 'Erreur', note: feedbackNormalise.note || '-', commentaire: feedbackNormalise.commentaire || '-', detailCorrection: feedbackNormalise, criteresCibles: currentOp.criteresObligatoires || []
       });
    } catch(err) { 
      console.error(err); 
      setErreurGlobal("CorrigeMoi rencontre un problème technique. Veuillez réessayer.");
    } finally { setLoadingCorrectionB(false); }
  }

  async function genererQuestionC() {
    if (!exigerUnePeriodeSelectionnee()) return;
    const variationCycle = ++generationVariationRef.current;
    setLoadingQuestionC(true); setErreurGlobal(null);
    const systemPrompt = `Tu es un concepteur d'examen ministériel pour le cours d'Histoire du Québec et du Canada de secondaire ${niveauScolaire}. Génère un dossier documentaire complet pour une question à réponse élaborée (Section C de l'épreuve unique). Le dossier doit contenir entre 8 et 10 documents, et chaque document doit être pertinent pour répondre à la consigne.
    ORGANISATION DOCUMENTAIRE OBLIGATOIRE :
    - Inclus des documents pertinents pour répondre à la consigne.
    - N'inclus aucun distracteur : ne produis aucun document avec "pertinent": false ou "elementsCibles": [].
    - Les sources primaires sont des extraits attribuables à un acteur ou un document de l'époque; les sources secondaires sont des extraits d'analyse historique rédigés après les faits. Chaque document doit avoir "pertinent": true, au moins un "elementsCibles" et une "justificationPertinence" exacte.
    - Tous les documents doivent soutenir au moins un élément de la consigne; n'indique jamais à l'élève qu'un document est plus ou moins utile.
    - Pour chaque document, produis les métadonnées internes "pertinent": true, "elementsCibles" non vide et "justificationPertinence". Ces métadonnées servent à la correction et ne doivent jamais être montrées pendant la consultation du dossier.
 - Sois d'une rigueur absolue avec les titres politiques. Ne confonds jamais un "ministre" (ex: ministre de l'Éducation) avec le "Premier ministre" (chef du gouvernement).
     - Le dossier documentaire contient des textes, statistiques et au moins deux documents iconographiques réellement affichables (carte, graphique, photographie, portrait ou affiche), tous directement utiles à la question. Si un document présente une personne, commence son titre par « Portrait officiel de », jamais par « Portrait individuel de ».
     - Pour chaque document iconographique, décris précisément le support à rechercher avec "imageAlt"; l’application ajoutera ensuite une image Wikimedia Commons libre et vérifiera l’URL directe et la licence. Une page commons.wikimedia.org/wiki/File:... n’est jamais une image. N’invente jamais une URL et n’utilise jamais une image protégée. Si un personnage historique apparaît dans la consigne ou un document, indique la représentation à rechercher.
     - Tous les textes destinés à l’élève doivent utiliser des apostrophes françaises typographiques (’).
    - Pour chaque document, indique un "typeDoc" interne précis et une "reference" complète. Le type aide le rendu mais ne doit pas être placé à côté du titre dans l'interface.
    - Ajoute "marqueursRelationAttendus" adaptés à la tâche de description ou d'explication.
  ${genererContexteTemporel()}
  ${genererConsigneDiversite(variationCycle, "la question élaborée")}
 ${genererConsigneDifficulte()}
Réponds UNIQUEMENT en format JSON valide:
{
   "typeTache": "description" ou "explication", "periode": "Nom de la période historique", "periodeId": 1, "conceptsPfeq": ["Concept officiel"], "connaissancesPfeq": ["Connaissance officielle"], "contexte": "Mise en contexte globale du dossier", "consigne": "La question exacte posée à l'élève",
       "documents": [ { "titre": "Titre neutre et explicite du document", "typeDoc": "Source primaire, Source secondaire, Statistique ou Iconographique", "reference": "Référence bibliographique ou institutionnelle", "texte": "Extrait, données ou description détaillée", "imageUrl": "URL publique directe si iconographique", "imageAlt": "Description accessible", "imageLicense": "Domaine public ou CC BY-SA", "pertinent": true, "elementsCibles": [1], "justificationPertinence": "Explication interne" } ],
     "criteresCorrectionAttendus": [
         { "elementId": 1, "element": "Élément attendu selon le type de tâche", "description": "Détail précis et observable", "documentsPertinents": ["A"] },
         { "elementId": 2, "element": "Deuxième élément attendu selon le type de tâche", "description": "Détail précis et observable", "documentsPertinents": ["B"] },
         { "elementId": 3, "element": "Troisième élément uniquement pour une description", "description": "Détail précis et observable", "documentsPertinents": ["C"] }
       ]
 Pour une tâche d'explication, conserve exactement deux critères : premier élément de réponse (/4 : indication et faits appropriés) et deuxième élément de réponse (/4 : indication et faits appropriés). Pour une tâche de description, conserve exactement trois critères : objet de la description (/2), première mise en relation (/3) et deuxième mise en relation (/3). Chaque critère doit avoir un elementId séquentiel, une description observable et un tableau documentsPertinents non vide contenant les lettres des documents réellement utiles.
}`;
     try {
       await executerGenerationAvecTentatives(async () => {
         const response = await callGenerationService('generer', { prompt: systemPrompt });
          let parsed = extraireJSON<any>(response.text);
          const periodeIdQuestionC = resoudrePeriodeId(parsed.periode, parsed.periodeId, periodesSelectionnees[0]);
          parsed.periodeId = periodeIdQuestionC;
          parsed = await reparerRattachementPFEQ(systemPrompt, parsed);
          parsed.periodeId = periodeIdQuestionC;
           parsed = await reparerCriteresCorrectionSectionC(parsed);
         if (!periodeAutorisee(periodeIdQuestionC)) throw new Error("La question élaborée utilise une période désactivée.");
          if (compterDocumentsIconographiques(parsed.documents) < 2) {
            throw new Error("La question élaborée doit fournir au moins deux documents iconographiques pertinents.");
          }
          validerQuestionC(parsed, periodesSelectionnees);
         parsed.documents = await enrichirDocumentsAvecVisuels(Array.isArray(parsed.documents) ? parsed.documents : [], periodeIdQuestionC, 2);
         if (parsed.documents.length > 10 || compterDocumentsIconographiques(parsed.documents) < 2 || !documentsIconographiquesComplets(parsed.documents)) {
           throw new Error("La question élaborée doit contenir au moins deux documents iconographiques avec des images Wikimedia libres.");
         }
         validerQuestionC(parsed, periodesSelectionnees);
          setQuestionC(parsed);
          memoriserQuestionsGenerees([parsed], "section-c");
       });
    } catch(err: any) {
      afficherErreurGeneration("section-c", err);
    } finally { setLoadingQuestionC(false); }
  }

  async function corrigerReponseC() {
    if (!questionC) return;
    if (!reponseC.trim()) {
      setErreurGlobal(CONSIGNE_REPONSE_VIDE);
      return;
    }
    const mots = compterMotsReponse(reponseC);
    if (!reponseCEvaluable(reponseC, 300)) {
      setErreurGlobal(`Le texte final ne peut pas dépasser 300 mots (actuellement ${mots}).`);
      return;
    }
    setLoadingCorrectionC(true); setErreurGlobal(null);
    const isDescription = questionC.typeTache === "description";
      const correctionPrompt = `Tu es un enseignant correcteur pour l'épreuve unique d'histoire du Québec de secondaire ${niveauScolaire}. Corrige la réponse officielle de l'élève selon la grille ministérielle. Une réponse d'une seule phrase, même très courte, doit tout de même être évaluée et recevoir une rétroaction pédagogique complète : ne refuse jamais la correction en raison de sa longueur. Respecte la progression des apprentissages du PFEQ et la méthode historique : faits exacts, repères précis, liens de cause ou de mise en relation justifiés par des preuves et structure correspondant à la tâche. Commence toujours la rétroaction par un encouragement sincère et concret avant de nommer une erreur. Type de tâche : ${questionC.typeTache}. Marqueurs attendus : ${JSON.stringify(questionC.marqueursRelationAttendus || [])}. Consigne posée : ${questionC.consigne}. Documents mis à disposition : ${(questionC.documents||[]).map((d: any, i: number)=>`Doc ${String.fromCharCode(65+i)} [${d.typeDoc}] (${d.titre}) — Référence : ${d.reference || "non précisée"} : ${d.texte} [Métadonnées internes à vérifier : pertinent=${d.pertinent}, éléments=${(d.elementsCibles||[]).join(",")}]`).join(" | ")} Critères proposés par le concepteur : ${JSON.stringify(questionC.criteresCorrectionAttendus || [])}. Réponse officielle rédigée par l'élève : "${reponseC}".
     RÈGLE D'ASSOCIATION DOCUMENTAIRE : Pour chaque élément de la grille, analyse TOUS les documents. Indique pour chaque document la preuve précise qu'il apporte à cet élément et explique explicitement le lien entre cet extrait et la réponse de l'élève; ne te fie pas aveuglément aux métadonnées internes : vérifie le texte et la consigne. La sortie "associationsDocuments" doit contenir une entrée pour chaque élément de la grille et, dans chacune de ces entrées, une analyse de TOUS les documents par lettre, sans aucune omission. Aucun document ne doit être traité comme un distracteur dans ce dossier.
    RÈGLE DE RÉTROACTION : Le champ "commentaireGlobal" doit contenir uniquement l'analyse générale : une première phrase qui indique clairement ce qui fonctionne ou ne fonctionne pas, puis une ligne vide, puis une explication qui aide l'élève à formuler sa réponse. Ne mets jamais dans "commentaireGlobal" de point fort, de défi, d'élément à travailler, d'astuce documentaire ou leurs étiquettes; ces informations vont dans leurs champs séparés. Formule les réponses modèles avec les marqueurs de relation adaptés à la tâche. Même si la réponse est sans rapport, donne un point fort motivationnel orienté vers une prochaine action; ne réponds jamais "aucun point fort décelé".
    Grille officielle à appliquer sur 8 points : ${isDescription ? ` - Indiquer l'objet de la description (/2 points) - Première mise en relation (/3 points) - Deuxième mise en relation (/3 points) ` : ` - Premier élément de réponse (/4 points au total : indication /2 + faits appropriés /2) - Deuxième élément de réponse (/4 points au total : indication /2 + faits appropriés /2) `} Réponds UNIQUEMENT en format JSON valide:
{
  "noteGlobale": "X/8", "typeTache": "${questionC.typeTache}",
  "detailPartie1": { "titre": "${isDescription ? "Objet de la description" : "Premier élément de réponse"}", "note": "${isDescription ? "X/2" : "X/4"}", "evaluation": "Commentaire détaillé" },
  "detailPartie2": { "titre": "${isDescription ? "Première mise en relation" : "Deuxième élément de réponse"}", "note": "${isDescription ? "X/3" : "X/4"}", "evaluation": "Commentaire détaillé" },
  ${isDescription ? `"detailPartie3": { "titre": "Deuxième mise en relation", "note": "X/3", "evaluation": "Commentaire détaillé" },` : ""}
       "commentaireGlobal": "Première phrase de diagnostic.\n\nExplication pour aider à formuler la réponse.", "lienExtraitReponse":"Lien explicite entre un extrait et la réponse de l'élève", "pisteAmelioration": "Un conseil précis pour s'améliorer", "pointFort":"Réussite observée", "elementATravailler":"Élément à retravailler", "astuceDocumentaire":"Méthode pour exploiter une preuve", "progressionOperation":"Progression dans l'opération",
      "associationsDocuments": [
        { "elementId": 1, "element": "${isDescription ? "Objet de la description" : "Premier élément de réponse"}", "documents": [
          { "document": "A", "pertinent": true, "utilisation": "Preuve précise apportée par le document pour cet élément." }
        ] }
      ]
}`;
    try {
      const response = await callGenerationService('corriger', { prompt: correctionPrompt });
        const parsed = normaliserFeedbackElabore(extraireJSON<any>(response.text), questionC.typeTache);
       setFeedbackC(parsed);
      const nivCalcul = obtenirNiveauPourResultat();
      await sauvegarderDansFirestore({
        eleve: studentName || "Anonyme", niveau: `Sec ${nivCalcul}`, section: "Section C", periodeId: questionC.periodeId, periode: questionC.periode, conceptsPfeq: questionC.conceptsPfeq, connaissancesPfeq: questionC.connaissancesPfeq, operation: `Section C (${questionC.typeTache})`, consigne: questionC.consigne, reponse: reponseC, notesDocuments: notesDocumentsC, plan: planReponseC, planStructure: planStructureC, diagnosticPlan: parsed.diagnosticPlan || null, associationsDocuments: parsed.associationsDocuments || [], resultat: parsed.noteGlobale || 'Non évalué', note: parsed.noteGlobale || '-', commentaire: parsed.commentaireGlobal || '-', detailCorrection: parsed
      });
    } catch(err: any) { 
      setErreurGlobal("CorrigeMoi rencontre un problème technique. Veuillez réessayer.");
    } finally { setLoadingCorrectionC(false); }
  }

  async function passerQuestionSuivanteC() {
    setQuestionC(null);
    setFeedbackC(null);
    setReponseC("");
    setPlanReponseC("");
    setPlanStructureC(PLAN_INITIAL_C);
    setNotesDocumentsC({});
    setActiveDocIndex(0);
    await genererQuestionC();
  }

  async function validerSituerTemps() {
    if (!questionB) return;
    const estSuiteChronologique = questionB.sousType === "suite-chronologique";
    if (estSuiteChronologique && selectedChronologyOption === null) {
      setErreurGlobal(CONSIGNE_REPONSE_VIDE);
      return;
    }
    if (!estPlacementComplet()) {
      const aucunPlacement = estSuiteChronologique
        ? selectedChronologyOption === null
        : questionB.sousType === "ordre"
          ? placementOrdre.length === 0
          : Object.keys(placementAvantApres).length === 0;
      setErreurGlobal(aucunPlacement
        ? CONSIGNE_REPONSE_VIDE
        : estSuiteChronologique
          ? "Choisis une suite chronologique avant de lancer corrige.moi."
          : "Place les quatre documents avant de lancer corrige.moi.");
      return;
    }
    let correct = 0; let total = 0;
    if (questionB.sousType === 'ordre') {
      total = (questionB.ordreCorrect || []).length;
      placementOrdre.forEach((docIdx, slotIndex) => { if (docIdx !== null && questionB.ordreCorrect[slotIndex] === docIdx) correct++; });
    } else if (questionB.sousType === 'avant-apres') {
      total = (questionB.classificationCorrecte || []).length;
      (questionB.classificationCorrecte || []).forEach((bonne: string, i: number) => { if (placementAvantApres[i] === bonne) correct++; });
    } else if (estSuiteChronologique) {
      total = 1;
      correct = selectedChronologyOption === questionB.indexOrdreCorrect ? 1 : 0;
    }
    if (!estSuiteChronologique && total !== 4) {
      setErreurGlobal("Cette activité doit contenir exactement quatre éléments à classer. Génère un nouveau dossier.");
      return;
    }
    const pointsMaximum = Number(questionB.points) || 2;
    const points = estSuiteChronologique
      ? (correct === 1 ? pointsMaximum : 0)
      : (correct === total ? pointsMaximum : correct >= Math.ceil(total / 2) ? 1 : 0);
    const resultat = {
      correct,
      total,
      points,
      commentaire: points === pointsMaximum
        ? "La suite choisie respecte les quatre repères temporels."
        : "Reprends les indices d'antériorité et de postériorité pour vérifier la suite chronologique.",
      pointFort: points === pointsMaximum ? "Tu as bien utilisé les repères temporels des documents." : "Tu as commencé à comparer les faits pour les situer dans le temps.",
      elementATravailler: points === pointsMaximum ? "Explique aussi l’indice qui t’a permis de choisir cette suite." : "Compare les indices de date, de contexte et de succession avant de choisir.",
      astuceDocumentaire: "Cherche d’abord les indices de chronologie dans les titres, les événements et le vocabulaire des documents.",
      progressionOperation: "Tu apprends à établir l’antériorité et la postériorité entre des faits.",
      exempleReponse: questionB.sousType === "ordre"
        ? "Le document A est antérieur au document B, puis le document C vient après."
        : questionB.sousType === "avant-apres"
          ? `Les faits sont situés avant ou après ${questionB.referenceEvenement}.`
          : `La suite correcte place le ${formatDocumentLabel(questionB.ordreCorrect[0])} avant le ${formatDocumentLabel(questionB.ordreCorrect[1])}, puis les autres documents après.`,
      diagnosticOperation: {
        criteresRespectes: [
          "La tâche porte uniquement sur la dimension temporelle.",
          ...(correct === total ? ["Les quatre faits sont correctement ordonnés ou situés par rapport à l’événement repère."] : []),
        ],
        criteresARetravailler: correct === total ? [] : ["L’ordre, l’antériorité ou la postériorité de tous les faits doit être revérifié."],
        marqueursUtilises: [],
        preuveDocumentaire: questionB.explication || "Les titres, les événements et le contexte des quatre documents servent de repères chronologiques.",
      },
    };
    validerFeedbackOperation(resultat, "espace-temps");
    setResultatSituerTemps(resultat);
    const nivCalcul = obtenirNiveauPourResultat();
    try {
      await sauvegarderDansFirestore({
        eleve: studentName || "Anonyme", niveau: `Sec ${nivCalcul}`, section: "Section B", periodeId: questionB.periodeId, periode: questionB.periode, operationId: "espace-temps", operation: currentOp.nom, consigne: questionB.consigne,
         reponse: questionB.sousType === 'ordre'
           ? `Ordre soumis: ${placementOrdre.map(d => (d === null ? '?' : d + 1)).join(', ')}`
           : questionB.sousType === 'avant-apres'
             ? `Classement soumis: ${Object.entries(placementAvantApres).map(([i, z]) => `Doc ${Number(i) + 1}=${z}`).join(', ')}`
             : `Suite choisie: ${selectedChronologyOption === null ? '?' : selectedChronologyOption + 1}`,
         resultat: `${points}/${pointsMaximum} points (${correct}/${total} corrects)`, note: `${points}/${pointsMaximum}`, commentaire: resultat.commentaire, detailCorrection: resultat,
         criteresCibles: [
           "Choisir et respecter la dimension temporelle de la tâche",
           "Établir l’antériorité et la postériorité à partir de repères historiques précis",
         ],
      });
    } catch (error) {
      console.error(error);
      setErreurGlobal("Le résultat du classement est prêt, mais son enregistrement a échoué. Réessaie pour conserver ta progression.");
    }
  }

  const estPlacementComplet = (): boolean => {
    if (!questionB) return false;
    if (questionB.sousType === 'ordre') return placementOrdre.length > 0 && placementOrdre.every(v => v !== null);
    if (questionB.sousType === 'avant-apres') return (questionB.documents || []).every((_: any, i: number) => placementAvantApres[i] !== undefined);
    if (questionB.sousType === 'suite-chronologique') return selectedChronologyOption !== null;
    return false;
  };

  const estReponseOperationComplete = (): boolean => {
    if (currentOp?.id !== "continuite-changement") return reponseB.trim() !== "";
    try {
      const reponse = JSON.parse(reponseB);
      return ["moment1", "moment2", "changement", "continuite", "preuves"].every((champ) => String(reponse[champ] || "").trim().length > 0);
    } catch {
      return false;
    }
  };

  async function validerSituerEspace() {
    if (!questionB) return;
    if (!lieuSelectionne) {
      setErreurGlobal(CONSIGNE_REPONSE_VIDE);
      return;
    }
    const correct = lieuSelectionne === questionB.lieuCorrect;
    const resultat = {
      correct,
      commentaire: correct
        ? "Le territoire a été correctement localisé à partir du dossier."
        : `Le territoire choisi ne correspond pas aux repères du dossier; la réponse attendue était ${questionB.lieuCorrect}.`,
      pointFort: correct ? "Tu as associé le document au bon territoire historique." : "Tu as pris le temps d’observer la carte et les documents.",
      elementATravailler: correct ? "Justifie ton choix avec un indice visible dans le document." : "Relie les indices du document au territoire représenté sur la carte.",
      astuceDocumentaire: "Repère les lieux, frontières ou indices territoriaux avant de toucher la carte.",
      progressionOperation: "Tu apprends à associer un territoire à une période et à des repères géographiques.",
      exempleReponse: `${questionB.lieuCorrect} se situe à proximité des repères géographiques indiqués dans le dossier.`,
      diagnosticOperation: {
        criteresRespectes: [
          "La tâche porte uniquement sur la dimension spatiale.",
          ...(correct ? ["Le territoire et la période ont été correctement associés."] : []),
        ],
        criteresARetravailler: correct ? [] : ["Le territoire doit être localisé à partir des limites et repères géographiques pertinents."],
        marqueursUtilises: [],
        preuveDocumentaire: questionB.explication || "Les limites, lieux et indices territoriaux visibles dans le dossier permettent la localisation.",
      },
    };
    validerFeedbackOperation(resultat, "espace-temps");
    const nivCalcul = obtenirNiveauPourResultat();
    try {
      await sauvegarderDansFirestore({
        eleve: studentName || "Anonyme", niveau: `Sec ${nivCalcul}`, section: "Section B", periodeId: questionB.periodeId, periode: questionB.periode, conceptsPfeq: questionB.conceptsPfeq, connaissancesPfeq: questionB.connaissancesPfeq, operationId: "espace-temps", operation: currentOp.nom, consigne: questionB.consigne,
        reponse: `Lieu choisi: ${lieuSelectionne} (bonne réponse: ${questionB.lieuCorrect})`, resultat: correct ? 'Réussi' : 'À revoir', note: correct ? '1/1' : '0/1', commentaire: resultat.commentaire, detailCorrection: resultat,
        criteresCibles: [
          "Choisir et respecter la dimension spatiale de la tâche",
          "Localiser le territoire à partir de repères géographiques pertinents",
        ],
      });
      setResultatSituerEspace(resultat);
    } catch (error) {
      console.error(error);
      setErreurGlobal("Le résultat de la carte est prêt, mais son enregistrement a échoué. Réessaie pour conserver ta progression.");
    }
  }

  const planInitialC = PLAN_INITIAL_C;
  const mettreAJourPlanC = (champ: keyof typeof PLAN_INITIAL_C, valeur: string) => {
    setPlanStructureC((prev) => {
      const next = { ...prev, [champ]: valeur };
      setPlanReponseC(JSON.stringify(next));
      return next;
    });
  };
  const limiterMots = (texte: string, maximum: number) => {
    const mots = texte.trim().split(/\s+/).filter(Boolean);
    return mots.length > maximum ? `${mots.slice(0, maximum).join(" ")} ` : texte;
  };

  const handleTabClick = (op: any, question?: any) => {
    setModeSectionB('operations');
    setCurrentOp(op);
    const dossier = question || questionsB.find((item) => item.operation.id === op.id)?.question || null;
    setQuestionB(null); setFeedbackB(null); setReponseB(""); setErreurGlobal(null);
    setSelectedChronologyOption(null);
    setQuestionB(dossier);
  };
  const labelRegenerationQuestionsB = operationsSelectionnees.length > 1
    ? `Générer d’autres questions pour les ${operationsSelectionnees.length} opérations sélectionnées`
    : "Générer une autre question";
  const ouvrirSchemaB = () => {
    setModeSectionB('schema'); setCurrentOp(null); setQuestionB(null); setFeedbackB(null); setErreurGlobal(null);
  };

  const renderModuleLanding = (kind: "reponses" | "schema" | "question") => {
    const content = {
      reponses: {
        accent: "var(--card-blue)",
        soft: "var(--sec-a-soft)",
        eyebrow: "",
        title: "Réponses courtes",
        lead: "Observe les sources, puis réponds\navec précision à ce que la question demande.",
        description: "Ce parcours vérifie tes connaissances historiques, tes repères et ta capacité à formuler une réponse courte appuyée sur les sources.",
        expectations: [
          ["01", "Un fait exact", "Nomme la réalité historique demandée sans ajouter d’information hors sujet."],
          ["02", "Un repère précis", "Utilise une date, un acteur, un lieu ou un indice clairement observable."],
          ["03", "Une réponse complète", "Formule une phrase qui répond directement à la consigne."],
        ],
      },
      question: {
        accent: "var(--question-elab)",
        soft: "var(--question-elab-soft)",
        eyebrow: `Dossier documentaire · Secondaire ${niveauScolaire}`,
        title: "Question élaborée",
        lead: "Construis une réponse historique organisée, des documents jusqu’à la rédaction.",
        description: "Conforme aux exigences de l’épreuve ministérielle, ce parcours t’aide à organiser une réponse développée, à sélectionner des preuves et à établir des liens historiques justifiés.",
        expectations: [
          ["01", "Comprendre la tâche", "Repère l’idée directrice, les éléments attendus et les limites de la question."],
          ["02", "Mobiliser les documents", "Associe chaque preuve à l’élément de réponse qu’elle permet de démontrer."],
          ["03", "Rédiger et justifier", "Développe un raisonnement historique avec des faits et des liens explicites."],
        ],
      },
      schema: {
        accent: "var(--card-teal)",
        soft: "var(--sec-b-soft)",
        eyebrow: `Organisation des idées · Secondaire ${niveauScolaire}`,
        title: "Schéma conceptuel",
        lead: "Organise les idées, les relations et les preuves avant de formuler ton interprétation.",
        description: "Conforme à la démarche d’analyse du programme, ce parcours t’entraîne à organiser une réalité historique, ses relations et les preuves documentaires dans une structure cohérente.",
        expectations: [
          ["01", "Dégager le concept central", "Identifie la réalité historique qui donne son sens à tout le schéma."],
          ["02", "Structurer les relations", "Relie les idées avec des liens historiques précis et logiques."],
          ["03", "Appuyer chaque choix", "Utilise les documents pertinents pour justifier les branches et les sous-idées."],
        ],
      },
    }[kind];

    return (
      <section
        className="module-landing"
        style={{ "--module-accent": content.accent, "--module-soft": content.soft } as React.CSSProperties}
        aria-labelledby={`module-landing-${kind}-title`}
      >
        <div className="module-landing-copy">
          {content.eyebrow && <span className="eyebrow">{content.eyebrow}</span>}
          <h1 id={`module-landing-${kind}-title`}>{content.title}</h1>
          <p className="module-landing-lead">{content.lead}</p>
          <p className="module-landing-description">{content.description}</p>
        </div>
        <div className="module-landing-expectations" aria-label="Attentes du parcours">
          {content.expectations.map(([number, title, text]) => (
            <div className="module-landing-expectation" key={number}>
              <span className="module-landing-number" aria-hidden="true">{number}</span>
              <div><strong>{title}</strong><p>{text}</p></div>
            </div>
          ))}
        </div>
      </section>
    );
  };

  const renderOperationsCatalog = () => {
    return (
      <section className="operations-catalog" aria-labelledby="operations-catalog-title">
        {renderPeriodesActives("var(--card-teal)")}
        {periodesSelectionnees.length > 0 ? (
          <div className="operations-after-periods" aria-live="polite">
            <div className="operations-tab-heading">
              <div>
                <span className="eyebrow">Entraînement guidé</span>
                <h2>Choisis une ou plusieurs opérations</h2>
                <p className="operations-generation-note">
                  {operationsSelectionnees.length === 0
                    ? "Choisis au moins une opération pour activer la génération."
                    : "Choisis la ou les opérations à travailler, puis lance la génération."}
                </p>
              </div>
              <span className="operations-tab-count">{operationsSelectionnees.length}/7 choisies</span>
            </div>
            <div className="operations-choice-grid" aria-label={`Opérations intellectuelles du secondaire ${niveauScolaire}`}>
              {OPERATIONS.map((operation) => (
                <button
                  type="button"
                  key={operation.id}
                  className={`operation-choice-card ${operationsSelectionnees.includes(operation.id) ? 'is-selected' : ''}`}
                  onClick={() => toggleOperation(operation.id)}
                  aria-pressed={operationsSelectionnees.includes(operation.id)}
                >
                  <span className="operation-choice-number" aria-hidden="true">{operation.num}</span>
                   <span className="operation-choice-content">
                     <strong>{operation.nom}</strong>
                   </span>
                   <span className="operation-choice-check" aria-hidden="true">{operationsSelectionnees.includes(operation.id) ? "✓" : ""}</span>
                </button>
              ))}
            </div>
            <div className="operations-generation-actions">
              <button
                type="button"
                className="btn-generer operations-generate-button"
                onClick={genererQuestionsB}
                disabled={loadingQuestionB || operationsSelectionnees.length === 0}
                style={{ backgroundColor: 'var(--card-teal)' }}
              >
                <i className="ti ti-sparkles" aria-hidden="true"></i>
                {loadingQuestionB ? "Génération des questions en cours…" : "Générer les questions sélectionnées"}
              </button>
            </div>
          </div>
        ) : null}
      </section>
    );
  };

  function formatConsigneAvecListe(texte: string) {
    if (!texte) return null;
    const lignes = texte.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const aDesTiretsEnDebutDeLigne = lignes.some(l => /^[-•]\s*/.test(l));
    let intro: string[] = []; let items: string[] = [];
    if (lignes.length > 1 && aDesTiretsEnDebutDeLigne) {
      lignes.forEach(l => { if (/^[-•]\s*/.test(l)) items.push(l.replace(/^[-•]\s*/, '')); else intro.push(l); });
    } else {
      const segments = texte.split(/\s-\s+/).map(s => s.trim()).filter(Boolean);
      if (segments.length > 1) { intro = [segments[0]]; items = segments.slice(1); } else { intro = [texte]; }
    }
    return (
      <>
        {intro.map((p, i) => <p key={`intro-${i}`}>{p}</p>)}
        {items.length > 0 && ( <ul className="consigne-list">{items.map((it, i) => <li key={`item-${i}`}>{it}</li>)}</ul> )}
      </>
    );
  }

  function normaliserConsigneFaits(texte: string, elements: unknown): string {
    const elementsNormalises = Array.isArray(elements)
      ? elements.map((element) => String(element || "").trim()).filter(Boolean).slice(0, 3)
      : [];
    if (elementsNormalises.length !== 3) return texte;
    const lignes = String(texte || "").split(/\r?\n/).map((ligne) => ligne.trim()).filter(Boolean);
    const introduction = lignes.filter((ligne) => !/^[-•]\s*/.test(ligne)).join("\n");
    const dejaTroisPicots = lignes.filter((ligne) => /^[-•]\s*/.test(ligne)).length === 3;
    if (dejaTroisPicots) return texte;
    return `${introduction || "Dans votre réponse, vous devez préciser chacun des éléments ci-dessous et les lier entre eux."}\n${elementsNormalises.map((element) => `- ${element}`).join("\n")}`;
  }

  const renderPeriodesActives = (accent = "var(--card-blue)") => (
    <div className="active-period-context" style={{ "--active-period-color": accent } as React.CSSProperties}>
      <div>
        <span className="active-period-context-label">{libellePeriodesSelectionnees}</span>
        <strong>{nomPeriodesSelectionnees || "Aucune période sélectionnée"}</strong>
      </div>
      <button type="button" className="link-btn" onClick={() => { setCurrentView("menu"); setAccueilEtape("periodes"); setStudentTab("accueil"); }}>
        Modifier les périodes
      </button>
    </div>
  );

  function formatRappelMarqueurs(op: any) {
    if (!op?.marqueursRecommandes || op.marqueursRecommandes.length === 0) return null;
    return (
      <p className="marqueurs-note">
        ( {op.marqueursRecommandes.map((m: any, i: number) => (
          <span key={i}>{op.marqueursRecommandes.length > 1 && <>Pour <strong>{m.typeLien}</strong>, </>} pensez à utiliser des marqueurs comme : <em>{m.marqueurs}</em> {i < op.marqueursRecommandes.length - 1 ? '. ' : '.'}</span>
        ))} )
      </p>
    );
  }

  function renderOperationFocus(op: any, dossier: any = null) {
    if (!op?.def) return null;
    const periode = dossier?.periode || nomPeriodesSelectionnees || "Période à préciser";
    const periodeLabel = dossier?.periode
      ? afficherDatesPeriode(dossier.periode, dossier.periodeId)
      : periode;
    return (
      <section className="operation-focus-card" aria-label={`${periodeLabel} — Opération intellectuelle : ${op.nom}`}>
        <div className="operation-focus-period">
          <span className="operation-focus-label">Période choisie</span>
          <strong>{periodeLabel}</strong>
        </div>
        <div className="operation-focus-rule" aria-hidden="true"></div>
        <div className="operation-focus-copy">
          <span className="operation-focus-label">Opération intellectuelle :</span>
          <strong>{op.nom}</strong>
          <p>{op.def}</p>
        </div>
      </section>
    );
  }

  function renderReponseStructureA() {
    if (!questionA) return null;
    const format = getSectionAFormat(questionA);
    const documents = questionA.documents || [];
    const update = (key: string, value: string) => {
      setReponsesStructureA((prev) => ({ ...prev, [key]: value }));
      setFeedbackA(null);
      setIsAnswerValidated(false);
    };

    if (format === "classement") {
      return (
        <div className="structured-answer">
          <p className="format-note">Choisis la position de chaque document, du plus ancien au plus récent.</p>
          {documents.map((document: any, index: number) => (
            <label className="structured-field" key={index}>
              <span>{formatDocumentLabel(index)}</span>
              <select value={reponsesStructureA[`ordre-${index}`] || ""} onChange={(event) => update(`ordre-${index}`, event.target.value)}>
                <option value="">Position à choisir…</option>
                {documents.map((_: any, position: number) => <option key={position} value={String(position)}>{position + 1}{position === 0 ? "re position" : "e position"}</option>)}
              </select>
            </label>
          ))}
        </div>
      );
    }
    if (format === "association-paires") {
      const faits = questionA.faitsRelier || questionA.elementsRelier || questionA.propositions || questionA.relations || [];
      return (
        <div className="structured-answer">
          <p className="format-note">Pour chaque fait général, inscris le numéro du document qui présente une manifestation concrète apparentée. Appuie-toi sur un indice historique, pas seulement sur des mots semblables.</p>
          <div className="association-table-wrap">
            <table className="association-table">
              <caption>Association des faits généraux aux manifestations concrètes apparentées</caption>
              <thead>
                <tr>
                  <th scope="col">Fait général à mettre en relation</th>
                  <th scope="col">N° du document</th>
                </tr>
              </thead>
              <tbody>
                {faits.map((fait: string, faitIndex: number) => (
                  <tr key={faitIndex}>
                    <th scope="row">{typographieFrancaise(String(fait))}</th>
                    <td>
                      <label className="association-document-choice">
                        <span className="sr-only">Document présentant la manifestation ou la description apparentée au fait {faitIndex + 1}</span>
                        <select
                           aria-label={`Document apparenté au fait ${faitIndex + 1}, « ${typographieFrancaise(String(fait))} » — ${reponsesStructureA[`paire-${faitIndex}`] === undefined || reponsesStructureA[`paire-${faitIndex}`] === "" ? "aucun document sélectionné" : `Document ${Number(reponsesStructureA[`paire-${faitIndex}`]) + 1} sélectionné`}`}
                           value={reponsesStructureA[`paire-${faitIndex}`] || ""}
                           onChange={(event) => {
                             update(`paire-${faitIndex}`, event.target.value);
                             setAnnonceReponseStructureA(`Fait ${faitIndex + 1} sélectionné : ${event.target.value === "" ? "aucun document" : `document ${Number(event.target.value) + 1}`}.`);
                           }}
                        >
                          <option value="">Choisir…</option>
                          {documents.map((document: any, documentIndex: number) => (
                            <option key={documentIndex} value={String(documentIndex)}>{documentIndex + 1}</option>
                          ))}
                        </select>
                      </label>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {faits.length === 0 && <p className="inline-warning">Les faits à mettre en relation sont absents de ce dossier.</p>}
          <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{annonceReponseStructureA}</div>
        </div>
      );
    }
    if (format === "causalite-3") {
      return (
        <div className="structured-answer">
          <p className="format-note">Relie les trois éléments dans l’ordre demandé : A entraîne B, qui entraîne C.</p>
          {(questionA.etapes || []).slice(0, 3).map((etape: string, index: number) => (
            <label className="structured-field" key={index}>
              <span>{index + 1}. {etape}</span>
              <textarea
                aria-label={`Étape ${index + 1} : ${etape} — ${reponsesStructureA[`causalite-${index}`]?.trim() ? "réponse saisie" : "réponse vide"}`}
                value={reponsesStructureA[`causalite-${index}`] || ""}
                onChange={(event) => {
                  update(`causalite-${index}`, event.target.value);
                  setAnnonceReponseStructureA(`Étape ${index + 1}, ${etape} : ${event.target.value.trim() ? "réponse saisie" : "réponse vide"}.`);
                }}
                placeholder="Explique le lien avec l’étape suivante…"
              />
            </label>
          ))}
          <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{annonceReponseStructureA}</div>
        </div>
      );
    }
    if (format === "changement-continuite") {
      const moments = Array.isArray(questionA.moments) ? questionA.moments : [];
      return (
        <div className="structured-answer">
          <div className="structured-context">{questionA.realiteComparee ? `Réalité étudiée : ${questionA.realiteComparee}` : "Observe la même réalité aux deux moments indiqués dans la consigne."}</div>
          <label className="structured-field"><span>{moments[0] || "Premier moment historique"}</span><textarea value={reponsesStructureA.moment1 || ""} onChange={(event) => update("moment1", event.target.value)} placeholder="Décris cette réalité au premier moment…" /></label>
          <label className="structured-field"><span>{moments[1] || "Deuxième moment historique"}</span><textarea value={reponsesStructureA.moment2 || ""} onChange={(event) => update("moment2", event.target.value)} placeholder="Décris la même réalité au deuxième moment…" /></label>
          <label className="structured-field"><span>Un élément de changement</span><textarea value={reponsesStructureA.changement || ""} onChange={(event) => update("changement", event.target.value)} placeholder="La réalité passe de… à…" /></label>
          <label className="structured-field"><span>Un élément de continuité</span><textarea value={reponsesStructureA.continuite || ""} onChange={(event) => update("continuite", event.target.value)} placeholder="La réalité demeure…" /></label>
          <label className="structured-field"><span>Repères et preuves documentaires</span><textarea value={reponsesStructureA.preuves || ""} onChange={(event) => update("preuves", event.target.value)} placeholder="Nomme le repère temporel et les documents utilisés…" /></label>
        </div>
      );
    }
    return (
      <div className="structured-answer">
        <div className="structured-context">{(questionA.acteursComparer || []).length === 3 ? `Acteurs à comparer : ${questionA.acteursComparer.join(", ")}` : "Compare les points de vue des trois acteurs présentés dans les documents."}</div>
        <label className="structured-field"><span>Acteur dont la position se distingue</span><input value={reponsesStructureA.acteurDissident || ""} onChange={(event) => update("acteurDissident", event.target.value)} placeholder="Nom de l’acteur dissident…" /></label>
        <label className="structured-field"><span>Position de cet acteur</span><textarea value={reponsesStructureA.positionDissidente || ""} onChange={(event) => update("positionDissidente", event.target.value)} placeholder="Alors que les deux autres acteurs…, cet acteur…" /></label>
        <label className="structured-field"><span>Position des deux autres acteurs</span><textarea value={reponsesStructureA.positionCommune || ""} onChange={(event) => update("positionCommune", event.target.value)} placeholder="Tout comme…, les deux autres acteurs…" /></label>
        <label className="structured-field"><span>Preuves documentaires</span><textarea value={reponsesStructureA.preuves || ""} onChange={(event) => update("preuves", event.target.value)} placeholder="Nomme les documents et leurs indices précis…" /></label>
      </div>
    );
  }

  // --- RENDU SÉLECTEUR DE PÉRIODES ANIMÉ ---
  const renderSélecteurPériodes = (tone: "teal" = "teal") => {
    return (
      <section className={`period-selector period-selector--${tone}`} aria-labelledby="period-selector-title">
        <div className="period-selector-heading">
          <div>
            <h2 id="period-selector-title">Périodes historiques</h2>
            <p>Sélectionne la ou les périodes qui serviront à construire ton dossier.</p>
          </div>
          <span className="period-selector-count" aria-live="polite">{periodesSelectionnees.length}/4</span>
        </div>
        <div className="periodes-grid">
          {PERIODES_HISTORIQUES.filter((periode) => !niveauScolaire || periode.niveau === niveauScolaire).map(p => {
            const isLocked = !periodesPermises.includes(p.id);
            const isSelected = periodesSelectionnees.includes(p.id);
            const etat = isLocked ? "À débloquer" : isSelected ? "Activée" : "Désactivée";

            const parts = p.titre.split(' : ');
            const dates = parts[0];
            const nom = parts[1] || p.titre;

            if (isLocked) {
              return (
                <div key={p.id} className="periode-card verrouillee">
                  <div className="p-badge">{dates}</div>
                  <i className="ti ti-lock periode-icon-right periode-lock-icon"></i>
                  <div className="p-status">{etat}</div>
                  <div className="p-titre">{nom}</div>
                </div>
              );
            }

            return (
              <button key={p.id} onClick={() => togglePeriodeEleve(p.id)} className={`periode-card ${isSelected ? 'en-cours' : 'completee'}`} aria-pressed={isSelected}>
                <div className="p-badge">{dates}</div>
                {isSelected ? (
                    <i className="ti ti-check periode-icon-right" style={{fontSize: '18px'}}></i>
                ) : null}
                <div className="p-titre">{nom}</div>
              </button>
            );
          })}
        </div>

        <div className="periodes-legende" aria-label="Légende des périodes">
          <div className="legende-item"><span className="legende-swatch legende-swatch--available" aria-hidden="true"></span><span><strong>Désactivée</strong> — période disponible, mais non sélectionnée.</span></div>
           <div className="legende-item"><span className="legende-swatch legende-swatch--selected" aria-hidden="true"></span><span><strong>Activée</strong> — elle sera utilisée pour les questions.</span></div>
           <div className="legende-item"><span className="legende-swatch legende-swatch--locked" aria-hidden="true"></span><span><strong>À débloquer</strong> — période fermée par l’enseignant.</span></div>
        </div>
      </section>
    );
  };

  return (
    <>
      {showSplash && (
        <div className={`splash-screen ${isFading ? "is-fading" : ""}`} style={{ backgroundColor: 'var(--bg-page)' }}>
          <img src="/corrige.moi.transparent.png" alt="Logo Corrige.moi" style={{ width: '100%', maxWidth: '350px', objectFit: 'contain' }} />
        </div>
      )}
      {accesRefuse && (
        <div className="wrap app-shell" role="alert">
          <div className="app-error-banner">
            <strong>Accès élève incomplet.</strong> Le lien de session ne contient pas les informations nécessaires pour ouvrir ce parcours.
          </div>
          <a className="link-btn" href="/">Retour à l’accueil de l’application</a>
        </div>
      )}
      {!accesRefuse && (
        <div className="wrap app-shell">
          <div className="app-header">
            <button
              type="button"
              className="notification-trigger"
              onClick={() => naviguerEspaceEleve('notifications')}
              aria-label="Ouvrir les notifications personnalisées"
              title="Notifications"
            >
              <Bell aria-hidden="true" />
            </button>
            <button
              type="button"
              className="profile-trigger"
              onClick={() => naviguerEspaceEleve('profil')}
              aria-label={`Ouvrir les paramètres de ${studentName || "ton profil"}`}
              title="Paramètres"
            >
              <UserRound aria-hidden="true" />
            </button>
          </div>
          {pushPromptVisible && (
            <aside className="push-permission-prompt" aria-labelledby="push-permission-title">
              <span className="push-permission-icon" aria-hidden="true"><Bell /></span>
              <div className="push-permission-copy">
                <strong id="push-permission-title">Reste au courant de ta progression</strong>
                <p>Autorise Corrige.moi à t’envoyer des rappels personnalisés sur cet appareil.</p>
                {pushMessage && <span role="status">{pushMessage}</span>}
              </div>
              <div className="push-permission-actions">
                <button type="button" className="push-permission-primary" onClick={activerPush} disabled={pushActivationEnCours}>
                  {pushActivationEnCours ? <LoaderCircle className="spin" aria-hidden="true" /> : <Bell aria-hidden="true" />}
                  {pushActivationEnCours ? "Activation…" : "Activer"}
                </button>
                <button type="button" className="push-permission-later" onClick={reporterPush} disabled={pushActivationEnCours}>Plus tard</button>
              </div>
            </aside>
          )}
          {!pushPromptVisible && pushMessage && <p className="push-status-message" role="status">{pushMessage}</p>}

          {currentView === 'menu' && niveauScolaire === null && (
            <section className="level-choice-page">
              <span className="eyebrow">Histoire du Québec et du Canada</span>
              <h1>Choisis ton parcours scolaire</h1>
              <p>Les périodes, activités et dossiers seront limités au niveau sélectionné.</p>
              <div className="level-choice-grid">
                <button type="button" className="level-choice-card level-choice-card--3" onClick={() => selectionnerNiveau(3)}><span>Secondaire</span><strong>3</strong><p>Des origines à 1840</p><b>Ouvrir l’accueil secondaire 3</b></button>
                <button type="button" className="level-choice-card level-choice-card--4" onClick={() => selectionnerNiveau(4)}><span>Secondaire</span><strong>4</strong><p>De 1840 à aujourd’hui</p><b>Ouvrir l’accueil secondaire 4</b></button>
              </div>
            </section>
          )}

          {currentView === 'menu' && niveauScolaire !== null && (
            <div>
              {accueilEtape === "periodes" ? (
                <section className="periods-gate-page" aria-labelledby="periods-gate-title">
                  <div className="progress-card">
                    <div className="progress-card-top"><span>Progression globale</span><span>{Math.round((scoreA.total ? scoreA.correct / scoreA.total : 0) * 100)}%</span></div>
                    <div className="progress-track"><div className="progress-fill" style={{width: `${Math.round((scoreA.total ? scoreA.correct / scoreA.total : 0) * 100)}%`}}></div></div>
                  </div>
                  <div className="student-welcome">
                    <div>
                        <span className="eyebrow">Première étape</span>
                      <h1 id="periods-gate-title">Choisis tes périodes historiques</h1>
                        <p className="periods-intro-copy">
                          <span className="periods-intro-line periods-intro-greeting">Bonjour {studentName || "à toi"}!</span>
                        <span className="periods-intro-line">Commence par sélectionner la ou les périodes que tu veux étudier.</span>
                        <span className="periods-intro-line">Les entraînements seront ensuite adaptés à cette sélection.</span>
                      </p>
                    </div>
                  </div>
                  {renderSélecteurPériodes()}
                  {erreurGlobal && <div className="app-error-banner" role="alert" aria-live="assertive"><strong>Oups!</strong> {erreurGlobal}</div>}
                  <div className="periods-gate-actions">
                    <button type="button" className="btn-generer" onClick={ouvrirEntrainements} style={{ backgroundColor: "var(--card-blue)" }}>
                      Voir les entraînements
                      <span aria-hidden="true">→</span>
                    </button>
                  </div>
                </section>
              ) : (
                <>
                  <div className="progress-card">
                    <div className="progress-card-top"><span>Progression globale</span><span>{Math.round((scoreA.total ? scoreA.correct / scoreA.total : 0) * 100)}%</span></div>
                    <div className="progress-track"><div className="progress-fill" style={{width: `${Math.round((scoreA.total ? scoreA.correct / scoreA.total : 0) * 100)}%`}}></div></div>
                  </div>
                  <section className="training-menu-page" aria-labelledby="training-menu-title">
                    <div className="training-choice-panel">
                      <div className="student-welcome">
                        <div>
                          <span className="eyebrow">Deuxième étape</span>
                          <h1 id="training-menu-title">Choisis ton entraînement</h1>
                        </div>
                      </div>
                      <div className="training-menu-context">
                        <div>
                           <span className="training-menu-context-label">{libellePeriodesSelectionnees}</span>
                          <strong>{nomPeriodesSelectionnees}</strong>
                        </div>
                        <button type="button" className="link-btn" onClick={() => { setAccueilEtape("periodes"); setErreurGlobal(null); }}>
                          Modifier les périodes
                        </button>
                      </div>
                      <div className="module-grid">
                        <button className="module-card module-card--a" onClick={() => { setParcoursA('reponses'); setStudentTab('accueil'); setBanqueQuestionsA([]); setCurrentView('sectionA'); }}><p className="module-card-title">Réponses courtes</p><div className="module-card-footer"><span>Connaissances et compréhension</span><span aria-hidden="true">→</span></div></button>
                        <button className="module-card module-card--operations" onClick={() => { setModeSectionB('operations'); setStudentTab('accueil'); setCurrentOp(null); setQuestionsB([]); setOperationsSelectionnees([]); setCurrentView('sectionB'); }}><p className="module-card-title">Opérations intellectuelles</p><div className="module-card-footer"><span>Raisonnement historique</span><span aria-hidden="true">→</span></div></button>
                        <button className="module-card module-card--c" onClick={() => { setStudentTab('accueil'); setCurrentView('sectionC'); }}><p className="module-card-title">Question élaborée</p><div className="module-card-footer"><span>Argumentation historique</span><span aria-hidden="true">→</span></div></button>
                        <button className="module-card module-card--b" onClick={() => { setStudentTab('accueil'); setModeSectionB('schema'); setCurrentView('sectionB'); }}><p className="module-card-title">Schéma conceptuel</p><div className="module-card-footer"><span>Organisation des connaissances</span><span aria-hidden="true">→</span></div></button>
                      </div>
                    </div>
                  </section>
                </>
              )}
            </div>
          )}

          {currentView === 'dashboard' && studentTab === 'notifications' && (
            <NotificationsEleve
              studentName={studentName}
              niveauScolaire={niveauScolaire}
              resultats={historiqueResultats}
              periodesPermises={periodesPermises}
              onRetourAuxModules={() => naviguerEspaceEleve('accueil')}
            />
          )}
          {currentView === 'dashboard' && studentTab === 'progres' && <TableauProgression resultats={historiqueResultats} niveauScolaire={niveauScolaire} onRetourAuxModules={() => naviguerEspaceEleve('accueil')} />}
          {currentView === 'dashboard' && studentTab === 'focus' && (
            <ModeFocus
              resultats={historiqueResultats}
              niveauScolaire={niveauScolaire}
              periodesSelectionnees={periodesSelectionnees}
              difficulteGroupe={difficulteGroupe}
              studentName={studentName}
              onGenerate={callFocusService}
              onSave={sauvegarderDansFirestore}
            />
          )}
          {currentView === 'dashboard' && studentTab === 'profil' && (
            <section className="profile-page">
              <div className="profile-card">
                <div className="profile-avatar">{studentName ? studentName.charAt(0).toUpperCase() : "?"}</div>
                <span className="eyebrow">Mon espace</span>
                <h1>{studentName || "Élève"}</h1>
                <p>Code d’accès actif : <strong>{codeUtilise || "—"}</strong></p>
                <div className="profile-info-row"><span>Périodes débloquées</span><strong>{periodesPermises.length || 0}</strong></div>
                <div className="profile-info-row"><span>Résultats enregistrés</span><strong>{historiqueResultats.length}</strong></div>
                <div className="theme-setting">
                   <div className="theme-setting-heading"><div><span className="eyebrow">Apparence</span><h2>Mode d’affichage</h2></div><p>Clair par défaut, sombre quand tu en as besoin.</p></div>
                  <div className="theme-options" role="group" aria-label="Choisir le mode d’affichage">
                    <button type="button" className={`theme-option ${theme === 'dark' ? 'selected' : ''}`} aria-pressed={theme === 'dark'} onClick={() => setTheme('dark')}>
                      <Moon aria-hidden="true" /><span><strong>Sombre</strong><small>Confortable le soir</small></span>{theme === 'dark' && <Check aria-hidden="true" />}
                    </button>
                    <button type="button" className={`theme-option ${theme === 'light' ? 'selected' : ''}`} aria-pressed={theme === 'light'} onClick={() => setTheme('light')}>
                      <Sun aria-hidden="true" /><span><strong>Clair</strong><small>Contraste lumineux</small></span>{theme === 'light' && <Check aria-hidden="true" />}
                    </button>
                  </div>
                </div>
                <ReglesEtConfidentialite />
                <button type="button" className="student-secondary-action" onClick={deconnecterEleve}><LogOut aria-hidden="true" /> Se déconnecter</button>
              </div>
            </section>
          )}

          {currentView === 'sectionA' && (
            <>
              <button className="link-btn" onClick={() => setCurrentView('menu')} style={{marginBottom: '20px'}}>← Retour au menu principal</button>
              {parcoursA === 'reponses' && renderModuleLanding("reponses")}
              <div className="dossier">
                <div className="catalog-num">SECTION A — Histoire du Québec et du Canada {banqueQuestionsA.length > 0 && ` – Question ${currentIndexA + 1} / ${banqueQuestionsA.length}`}</div>
                <p className="op-def">{parcoursA === 'reponses' ? "Réponds à 10 questions ciblées. Observe chaque source avant de répondre." : "Travaille les sept opérations du programme avec les formats structurés de l’épreuve ministérielle."}</p>
                 {renderPeriodesActives("var(--card-blue)")}
                
                {erreurGlobal && <div className="app-error-banner" role="alert" aria-live="assertive"><strong>Oups!</strong> {erreurGlobal}</div>}

                {loadingQuestionA ? (
                   <div className="loading section-a-generation-loading" role="status" aria-live="polite">
                     <div className="spinner" aria-hidden="true"></div>
                     <strong>
                       {generationProgressA.stage === "queued"
                         ? "Préparation du lot de 10 questions..."
                         : generationProgressA.stage === "generating"
                           ? "Génération des deux sous-lots en cours..."
                           : generationProgressA.stage === "validating"
                             ? "Vérification des 10 questions et du rattachement PFEQ..."
                             : "Lot de questions prêt..."}
                     </strong>
                     <div className="generation-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={generationProgressA.percent} aria-label={`Progression de la génération : ${generationProgressA.percent}%`}>
                       <div className="generation-progress-bar" style={{ width: `${generationProgressA.percent}%` }}></div>
                     </div>
                     <span>{generationProgressA.percent}% — Ne relance pas : une reprise utilise la même demande et évite un doublon.</span>
                   </div>
                ) : banqueQuestionsA.length === 0 ? (
                    <button className="btn-generer" onClick={relancerLotQuestionsA} style={{backgroundColor: 'var(--card-blue)'}}><i className="ti ti-rotate-clockwise"></i> {generationAJobExpire ? "Relancer la génération" : "Charger un nouveau lot de 10 questions"}</button>
                ) : questionA && (
                  <div>
                      <div className="consigne-box" style={{borderColor: 'var(--card-blue)', backgroundColor: 'var(--sec-a-soft)'}}>
                        <span className="operation-question-label" aria-label={`Opération intellectuelle : ${questionA.operation || OPERATIONS.find((operation) => operation.id === questionA.operationId)?.nom || "Non précisée"}`}>
                          Opération intellectuelle : <strong>{questionA.operation || OPERATIONS.find((operation) => operation.id === questionA.operationId)?.nom || "Non précisée"}</strong>
                        </span>
                        <span className="tag" style={{color: 'var(--card-blue)'}}>Question {currentIndexA + 1} sur {banqueQuestionsA.length}</span>
                        {questionA.periode && <div style={{fontSize: '13px', color: 'var(--card-blue)', fontWeight: 'bold', margin: '8px 0'}}>Dates ciblées : {afficherDatesPeriode(questionA.periode, questionA.periodeId)}</div>}
                        <p>{questionA.question}</p>
                        <BoutonLecture texte={questionA.question} />
                      </div>
                     <div className="question-meta"><span className="format-badge">{getSectionAFormat(questionA) === 'qcm' ? 'Choix multiples' : getSectionAFormat(questionA) === 'court' ? 'Réponse courte' : 'Réponse structurée'}</span><span className="points-badge">{questionA.points || 1} point{questionA.points > 1 ? 's' : ''}</span>{questionA.operation && <span className="operation-badge">{questionA.operation}</span>}</div>
                     {questionA.documents?.length > 0 && <div className="document-list section-a-documents">{questionA.documents.map((document: any, index: number) => <DocumentCard key={index} document={document} index={index} accent="var(--card-blue)" />)}</div>}
                      {Array.isArray(questionA.elementsChronologiques) && questionA.elementsChronologiques.length === 4 ? (
                        <>
                          <ClassementChronologiqueInteractif
                            elements={questionA.elementsChronologiques}
                            ordre={ordreChronologiqueA}
                            setOrdre={setOrdreChronologiqueA}
                          />
                          {erreurFormatA && <div className="inline-warning" role="alert">{erreurFormatA}</div>}
                          <div className="actions">
                            <button
                              className="btn-generer"
                              onClick={corrigerReponseA}
                              disabled={loadingCorrectionA}
                              style={{backgroundColor: 'var(--card-blue)'}}
                            >
                              corrige.moi
                            </button>
                          </div>
                          {feedbackA && isAnswerValidated && (
                            <div className="verdict" role="status" aria-live="polite" style={{borderTopColor: 'var(--card-blue)'}}>
                              <div className={`stamp ${feedbackA.correct ? 'reussi' : ''}`} style={feedbackA.correct ? {borderColor: 'var(--card-blue)', color: 'var(--card-blue)'} : {}}>{feedbackA.correct ? 'Classement réussi !' : 'À revoir'} • {feedbackA.note}</div>
                                <div className="feedback-section"><span className="label">Explication de corrige.moi</span><FeedbackNarratif commentaire={feedbackA.commentaire} explication={feedbackA.explication} encouragement={feedbackA.pointFort} /></div>
                              <FeedbackInteractif
                                feedback={feedbackA}
                                reponse={JSON.stringify({ ordreChronologique: ordreChronologiqueA.map((index) => questionA.elementsChronologiques[index]) })}
                                accent="var(--card-blue)"
                                hasDocuments={(questionA.documents || []).length > 0}
                                hideChallengeWhenCorrect
                              />
                              <button className="link-btn" onClick={passerQuestionSuivanteA} style={{marginTop: '20px', color: 'var(--card-blue)'}}>{currentIndexA + 1 < banqueQuestionsA.length ? 'Question suivante →' : 'Générer un nouveau lot de 10'}</button>
                            </div>
                          )}
                        </>
                      ) : getSectionAFormat(questionA) === 'qcm' ? (
                       <>
                         <div style={{display: 'flex', flexDirection: 'column', gap: '10px', margin: '20px 0'}}>
                           {(questionA.choix || []).map((choixText: string, index: number) => {
                              let bgColor = selectedChoice === index ? 'var(--answer-selected)' : 'var(--bg-surface-soft)';
                             let borderColor = 'var(--ligne)';
                             if (isAnswerValidated) {
                                if (index === questionA.indexReponseCorrecte) { bgColor = 'var(--feedback-correct)'; borderColor = 'var(--feedback-correct-border)'; }
                                else if (index === selectedChoice) { bgColor = 'var(--feedback-error)'; borderColor = 'var(--feedback-error-border)'; }
                             }
                             return (
                                <button type="button" key={index} aria-pressed={selectedChoice === index} style={{ padding: '14px', textAlign: 'left', borderRadius: '4px', border: `1px solid ${borderColor}`, backgroundColor: bgColor, cursor: 'pointer', fontFamily: "'Source Serif 4', serif", fontSize: '15px', transition: 'all 0.2s' }} onClick={() => { setSelectedChoice(index); setFeedbackA(null); setIsAnswerValidated(false); }}>
                                 <strong>{String.fromCharCode(65 + index)}.</strong> {choixText}
                               </button>
                             );
                           })}
                         </div>
                           <button className="btn-generer" onClick={corrigerReponseA} disabled={loadingCorrectionA || savingQcmA} style={{backgroundColor: 'var(--card-blue)'}}>corrige.moi</button>
                          {isAnswerValidated && (
                            <div className="verdict" role="status" aria-live="polite" style={{borderTopColor: 'var(--card-blue)'}}>
                              <div className={`stamp ${feedbackA?.correct ? 'reussi' : ''}`} style={feedbackA?.correct ? {borderColor: 'var(--card-blue)', color: 'var(--card-blue)'} : {}}>{feedbackA?.correct ? 'Bonne réponse !' : 'À revoir'} • {feedbackA?.note || ''}</div>
                                <div className="feedback-section"><span className="label">Explication de corrige.moi</span><FeedbackNarratif commentaire={feedbackA?.commentaire || questionA.explication} explication={feedbackA?.explication} encouragement={feedbackA?.pointFort} /></div>
                               <FeedbackInteractif
                                 feedback={feedbackA}
                                 reponse={reponseCourteA || `Choix ${String.fromCharCode(65 + Number(selectedChoice))} : ${questionA.choix?.[Number(selectedChoice)] || ""}`}
                                 accent="var(--card-blue)"
                                 hasDocuments={(questionA.documents || []).length > 0}
                                  hideChallengeWhenCorrect
                               />
                             <button className="link-btn" onClick={passerQuestionSuivanteA} style={{marginTop: '20px', color: 'var(--card-blue)'}}>{currentIndexA + 1 < banqueQuestionsA.length ? 'Question suivante →' : 'Générer un nouveau lot de 10'}</button>
                           </div>
                         )}
                       </>
                     ) : getSectionAFormat(questionA) === 'court' ? (
                       <>
                            <textarea className="answer-short" aria-label="Réponse courte à la question" placeholder="Écris directement le fait historique demandé, sans nommer le document…" value={reponseCourteA} onChange={(event) => { setReponseCourteA(event.target.value); setFeedbackA(null); setIsAnswerValidated(false); }} />
                          {erreurFormatA && <div className="inline-warning" role="alert">{erreurFormatA}</div>}
                         <div className="actions">
                               <button className="btn-generer" onClick={corrigerReponseA} disabled={loadingCorrectionA} style={{backgroundColor: 'var(--card-blue)'}}>corrige.moi</button>
                         </div>
                          {feedbackA && isAnswerValidated && (
                           <div className="verdict" style={{borderTopColor: 'var(--card-blue)'}}>
                             <div className={`stamp ${feedbackA.correct ? 'reussi' : ''}`} style={feedbackA.correct ? {borderColor: 'var(--card-blue)', color: 'var(--card-blue)'} : {}}>{feedbackA.correct ? 'Réponse satisfaisante' : 'À revoir'} • {feedbackA.note}</div>
                                <div className="feedback-section"><span className="label">Explication de corrige.moi</span><FeedbackNarratif commentaire={feedbackA.commentaire} explication={feedbackA.explication} encouragement={feedbackA.pointFort} splitExplicationAtEt /></div>
                              <FeedbackInteractif feedback={feedbackA} reponse={reponseCourteA} accent="var(--card-blue)" hasDocuments={(questionA.documents || []).length > 0} hideChallengeWhenCorrect encouragerPhraseComplete />
                             <button className="link-btn" onClick={passerQuestionSuivanteA} style={{marginTop: '20px', color: 'var(--card-blue)'}}>{currentIndexA + 1 < banqueQuestionsA.length ? 'Question suivante →' : 'Générer un nouveau lot de 10'}</button>
                           </div>
                         )}
                       </>
                     ) : (
                       <>
                         {renderReponseStructureA()}
                         {erreurFormatA && <div className="inline-warning" role="alert">{erreurFormatA}</div>}
                         <div className="actions">
                             <button className="btn-generer" onClick={corrigerReponseA} disabled={loadingCorrectionA} style={{backgroundColor: 'var(--card-blue)'}}>corrige.moi</button>
                         </div>
                          {feedbackA && isAnswerValidated && (
                           <div className="verdict" style={{borderTopColor: 'var(--card-blue)'}}>
                             <div className={`stamp ${feedbackA.correct ? 'reussi' : ''}`} style={feedbackA.correct ? {borderColor: 'var(--card-blue)', color: 'var(--card-blue)'} : {}}>{feedbackA.correct ? 'Réponse satisfaisante' : 'À revoir'} • {feedbackA.note}</div>
                               <div className="feedback-section"><span className="label">Explication de corrige.moi</span><FeedbackNarratif commentaire={feedbackA.commentaire} explication={feedbackA.explication} /></div>
                             <FeedbackInteractif feedback={feedbackA} reponse={JSON.stringify(reponsesStructureA)} accent="var(--card-blue)" hasDocuments={(questionA.documents || []).length > 0} />
                             <button className="link-btn" onClick={passerQuestionSuivanteA} style={{marginTop: '20px', color: 'var(--card-blue)'}}>{currentIndexA + 1 < banqueQuestionsA.length ? 'Question suivante →' : 'Générer un nouveau lot de 10'}</button>
                           </div>
                         )}
                       </>
                     )}
                  </div>
                )}
              </div>
            </>
          )}

          {currentView === 'sectionB' && (
            <>
              <button className="link-btn" onClick={() => setCurrentView('menu')} style={{marginBottom: '20px'}}>← Retour au menu principal</button>
              {modeSectionB === 'operations' && (
                  <>
                    <section className="operations-landing" aria-labelledby="operations-landing-title">
                      <div className="operations-landing-copy">
                        <span className="eyebrow">Parcours de compétences · Secondaire {niveauScolaire}</span>
                        <h1 id="operations-landing-title">Opérations intellectuelles</h1>
                         <p className="operations-landing-lead">Sélectionne une ou plusieurs démarches, puis génère les dossiers historiques dont tu as besoin.</p>
                        <p className="operations-landing-description">
                          Une opération intellectuelle est une démarche historique : tu mobilises des connaissances exactes,
                          tu observes les preuves dans les documents et tu expliques clairement les liens entre les faits.
                          L’objectif n’est pas seulement de trouver une information, mais de construire une réponse historique justifiée.
                        </p>
                      </div>
                      <div className="operations-expectations" aria-label="Attentes du ministère">
                        <div className="operations-expectation">
                          <span className="operations-expectation-number" aria-hidden="true">01</span>
                          <div><strong>Connaissances précises</strong><p>Utilise les faits, repères et concepts de la période étudiée.</p></div>
                        </div>
                        <div className="operations-expectation">
                          <span className="operations-expectation-number" aria-hidden="true">02</span>
                          <div><strong>Preuves documentaires</strong><p>Repère un indice pertinent et explique ce qu’il démontre.</p></div>
                        </div>
                        <div className="operations-expectation">
                          <span className="operations-expectation-number" aria-hidden="true">03</span>
                          <div><strong>Raisonnement historique</strong><p>Formule la relation demandée avec une réponse claire et structurée.</p></div>
                        </div>
                      </div>
                    </section>
                    {renderOperationsCatalog()}
                     {questionsB.length > 0 && (
                       <div className="sr-only" aria-live="polite">
                         {questionsB.filter((dossier) => dossier.question).length} dossier(s) prêt(s) sur {questionsB.length}.
                         {questionsB.filter((dossier) => dossier.error).length > 0 && " Certains dossiers sont indisponibles."}
                         {questionsB.map(({ operation, error, question }) => (
                           <span key={`status-${operation.id}`} aria-label={`${operation.nom} — ${error ? "dossier indisponible" : "dossier disponible"}`}>
                             {question ? ` ${operation.nom} est prêt.` : ` ${operation.nom} est indisponible.`}
                           </span>
                         ))}
                       </div>
                     )}
                  </>
              )}
              {modeSectionB === 'schema' && renderModuleLanding("schema")}
              <div className={`dossier operation-dossier${modeSectionB === 'operations' && !currentOp ? ' operation-dossier--waiting' : ''}`}>
                 {modeSectionB === 'schema' && <div className="catalog-num">SECTION B — Histoire du Québec et du Canada</div>}
                {modeSectionB === 'schema' ? (
                  <div>
                     <p className="op-def">{CONSIGNE_SCHEMA_CONCEPTUEL}</p>
                     {renderPeriodesActives("var(--card-teal)")}
                    {erreurGlobal && <div className="app-error-banner" role="alert" aria-live="assertive"><strong>Oups!</strong> {erreurGlobal}</div>}
                    {loadingSchemaB ? (
                      <div className="loading" role="status" aria-live="polite"><div className="spinner" aria-hidden="true"></div>Construction du schéma conceptuel...</div>
                    ) : !questionSchemaB ? (
                      <button className="btn-generer" onClick={genererSchemaB} style={{backgroundColor: 'var(--card-teal)'}}><i className="ti ti-sitemap"></i> Générer un schéma conceptuel</button>
                    ) : (
                      <div>
                       <div className="catalog-num" style={{marginTop: '16px'}}>{afficherDatesPeriode(questionSchemaB.periode, questionSchemaB.periodeId)}</div>
                       {questionSchemaB.questionDirectricePfeq && <p className="schema-pfeq-directive"><strong>Question directrice du programme :</strong> {questionSchemaB.questionDirectricePfeq}</p>}
                         <div className="consigne-box"><span className="tag">Consignes</span><p>{CONSIGNE_SCHEMA_CONCEPTUEL}</p></div>
                        <SchemaConceptuel
                          question={questionSchemaB}
                          selections={selectionsSchemaB}
                          setSelections={(value: React.SetStateAction<Record<string, number[]>>) => { setFeedbackSchemaB(null); setSelectionsSchemaB(value); }}
                          reponses={reponsesSchemaB}
                           setReponses={(value: React.SetStateAction<Record<number, string>>) => { setFeedbackSchemaB(null); setReponsesSchemaB(value); }}
                          centralResponse={reponseCentraleSchemaB}
                           setCentralResponse={(value: string) => { setFeedbackSchemaB(null); setReponseCentraleSchemaB(value); }}
                          sousReponses={sousReponsesSchemaB}
                           setSousReponses={(value: React.SetStateAction<Record<string, string>>) => { setFeedbackSchemaB(null); setSousReponsesSchemaB(value); }}
                          notes={notesDocumentsSchemaB}
                           setNotes={(value: React.SetStateAction<Record<number, string>>) => { setFeedbackSchemaB(null); setNotesDocumentsSchemaB(value); }}
                        />
                        <div className="actions">
                           <button className="btn-generer" onClick={corrigerSchemaB} disabled={loadingSchemaB} style={{backgroundColor: 'var(--card-teal)'}}>corrige.moi</button>
                          <button className="link-btn" onClick={() => { setQuestionSchemaB(null); setFeedbackSchemaB(null); setSelectionsSchemaB({}); setReponsesSchemaB({}); setReponseCentraleSchemaB(""); setSousReponsesSchemaB({}); setNotesDocumentsSchemaB({}); }} >Nouveau schéma ↺</button>
                        </div>
                         {feedbackSchemaB && (
                           <div id="schema-evaluation" ref={schemaFeedbackRef} tabIndex={-1} className="verdict schema-evaluation" style={{borderTopColor: 'var(--card-teal)'}} aria-labelledby="schema-evaluation-title">
                             <div id="schema-evaluation-title" className="stamp" style={{borderColor: 'var(--card-teal)', color: 'var(--card-teal)'}}>Évaluation du schéma — {feedbackSchemaB.noteGlobale}</div>
                             <div className="feedback-section"><span className="label">Explication de corrige.moi</span><FeedbackNarratif commentaire={feedbackSchemaB.commentaireGlobal} encouragement={feedbackSchemaB.pointFort} /></div>
                            <div className="schema-feedback-list">
                               {(feedbackSchemaB.details || []).map((detail: any, index: number) => <div className="schema-feedback-item" key={index}><strong>{detail.nom || "Élément du programme"}</strong><span>{detail.note}</span><p>{detail.evaluation}</p><small>Documents pertinents : {(detail.documentsPertinents || []).join(', ') || 'aucun'} · À écarter : {(detail.documentsHorsSujet || []).join(', ') || 'aucun'}</small>{detail.criteresARetravailler?.length > 0 && <small>Critères à retravailler : {detail.criteresARetravailler.join(' · ')}</small>}{detail.preuveDocumentaire && <small>Preuve documentaire : {detail.preuveDocumentaire}</small>}</div>)}
                            </div>
                            <FeedbackInteractif feedback={feedbackSchemaB} reponse={JSON.stringify({ centre: reponseCentraleSchemaB, branches: reponsesSchemaB, documents: selectionsSchemaB })} accent="var(--card-teal)" />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : !currentOp ? null : (
                  <div>
                 {renderOperationFocus(currentOp, questionB)}

                    {erreurGlobal && <div className="app-error-banner" role="alert" aria-live="assertive"><strong>Oups!</strong> {erreurGlobal}</div>}
                    {questionsB.find((dossier) => dossier.operation.id === currentOp.id)?.error && (
                      <div className="app-error-banner" role="alert" aria-live="assertive">
                        <strong>Dossier indisponible.</strong>{" "}
                        {questionsB.find((dossier) => dossier.operation.id === currentOp.id)?.error}
                      </div>
                    )}

                    {loadingQuestionB && !questionB ? (
                      <div className="loading" role="status" aria-live="polite"><div className="spinner" aria-hidden="true"></div>Recherche dans les archives...</div>
                    ) : !questionB ? (
                       <button className="btn-generer" onClick={genererQuestionsB} style={{backgroundColor: 'var(--card-teal)'}}><i className="ti ti-sparkles"></i> Générer les questions sélectionnées</button>
                    ) : (
                      <div>
                        {loadingQuestionB && (
                          <div className="operation-dossier-loading" role="status" aria-live="polite">
                            <div className="spinner" aria-hidden="true"></div>
                            Génération d’un nouveau dossier… Ton dossier actif reste disponible.
                          </div>
                        )}
                         <div className="catalog-num" style={{marginTop: '16px'}}>{afficherDatesPeriode(questionB.periode, questionB.periodeId)}</div>
                         <div className="operation-question-heading" aria-label={`Opération intellectuelle : ${currentOp.nom}`}>
                           Opération intellectuelle : <strong>{currentOp.nom}</strong>
                         </div>
                         {questionB.type === 'temps' && questionB.sousType === 'suite-chronologique' ? (
                           <div className="chronology-sequence-exercise">
                              <div className="consigne-box">
                               <span className="tag">Tâche à réaliser</span>
                               {formatConsigneAvecListe(questionB.consigne)}
                                <BoutonLecture texte={questionB.consigne} />
                             </div>
                              <div className="document-list section-b-documents">
                                {questionB.documents?.map((d: any, i: number) => (
                                  <DocumentCard key={i} document={d} index={i} accent="var(--card-teal)" />
                                ))}
                              </div>
                             <fieldset className="chronology-choice-panel">
                               <legend>Choisis la suite du plus ancien au plus récent</legend>
                               <div className="chronology-choice-grid">
                                 {(questionB.ordrePropositions || []).map((proposition: any, index: number) => {
                                   const libelle = proposition.libelle
                                     || (Array.isArray(proposition.ordre)
                                       ? proposition.ordre.map((documentIndex: number) => formatDocumentLabel(documentIndex)).join(" → ")
                                       : `Suite ${index + 1}`);
                                   return (
                                     <label className={`chronology-choice ${selectedChronologyOption === index ? "is-selected" : ""}`} key={index}>
                                       <input
                                         type="radio"
                                         name="suite-chronologique"
                                         value={index}
                                         checked={selectedChronologyOption === index}
                                         onChange={() => { setSelectedChronologyOption(index); setResultatSituerTemps(null); setErreurGlobal(null); }}
                                       />
                                       <span className="chronology-choice-letter" aria-hidden="true">{String.fromCharCode(65 + index)}</span>
                                       <span>{libelle}</span>
                                     </label>
                                   );
                                 })}
                               </div>
                             </fieldset>
                             <div className="actions">
                               <button className="btn-generer" onClick={validerSituerTemps} disabled={loadingCorrectionB} style={{backgroundColor: 'var(--card-teal)'}}>corrige.moi</button>
                             </div>
                             {resultatSituerTemps && (
                               <div className="verdict" style={{borderTopColor: 'var(--card-teal)'}}>
                                  <div className={`stamp ${resultatSituerTemps.points === 4 ? 'reussi' : ''}`} style={resultatSituerTemps.points === 4 ? {borderColor: 'var(--card-teal)', color: 'var(--card-teal)'} : {}}>{resultatSituerTemps.points}/4 points — {resultatSituerTemps.correct}/{resultatSituerTemps.total} correct</div>
                                 {questionB.explication && <div className="feedback-section"><span className="label">Explication de corrige.moi</span><FeedbackNarratif commentaire={questionB.explication} encouragement={resultatSituerTemps?.pointFort} /></div>}
                                 <FeedbackInteractif
                                   feedback={resultatSituerTemps}
                                   reponse={`Suite choisie : ${selectedChronologyOption === null ? "?" : selectedChronologyOption + 1}`}
                                   accent="var(--card-teal)"
                                 />
                               </div>
                             )}
                           </div>
                         ) : questionB.type === 'temps' ? (
                          <div>
                             <div className="consigne-box"><span className="tag">Tâche à réaliser</span>{formatConsigneAvecListe(questionB.consigne)}<div className="format-note">Touche un document pour le sélectionner, puis touche la case où le déposer.</div></div>
                            <SituerDansLeTemps
                              questionB={questionB}
                              placementOrdre={placementOrdre}
                              setPlacementOrdre={(value: React.SetStateAction<(number | null)[]>) => { setResultatSituerTemps(null); setPlacementOrdre(value); }}
                              placementAvantApres={placementAvantApres}
                              setPlacementAvantApres={(value: React.SetStateAction<Record<number, 'avant' | 'apres'>>) => { setResultatSituerTemps(null); setPlacementAvantApres(value); }}
                              selectedDocIndex={selectedDocIndex}
                              setSelectedDocIndex={setSelectedDocIndex}
                            />
                            <div className="actions">
                                <button className="btn-generer" onClick={validerSituerTemps} disabled={loadingCorrectionB} style={{backgroundColor: 'var(--card-teal)'}}>corrige.moi</button>
                            </div>
                            {resultatSituerTemps && (
                              <div className="verdict" style={{borderTopColor: 'var(--card-teal)'}}>
                                <div className={`stamp ${resultatSituerTemps.points === 4 ? 'reussi' : ''}`} style={resultatSituerTemps.points === 4 ? {borderColor: 'var(--card-teal)', color: 'var(--card-teal)'} : {}}>{resultatSituerTemps.points}/4 points — {resultatSituerTemps.correct}/{resultatSituerTemps.total} corrects</div>
                                   {questionB.explication && <div className="feedback-section"><span className="label">Explication de corrige.moi</span><FeedbackNarratif commentaire={questionB.explication} encouragement={resultatSituerTemps?.pointFort} /></div>}
                                  <FeedbackInteractif
                                    feedback={resultatSituerTemps}
                                    reponse={questionB.sousType === "ordre" ? JSON.stringify(placementOrdre) : JSON.stringify(placementAvantApres)}
                                    accent="var(--card-teal)"
                                  />
                             </div>
                        )}
                          </div>
                        ) : questionB.type === 'espace' ? (
                          <div>
                              <div className="consigne-box"><span className="tag">Tâche à réaliser</span>{formatConsigneAvecListe(questionB.consigne)}<div className="format-note">Observe la carte, puis choisis le territoire correspondant.</div></div>
                             <div className="espace-exercise-layout">
                               {modeCarteComparaison === "identifier" && (
                                 <fieldset className="espace-choice-panel">
                                   <legend>Choisis un territoire</legend>
                                   <p>Observe la carte, puis sélectionne une seule réponse.</p>
                                   <div className="espace-choice-list">
                                     {(questionB.carteEra === "province-quebec"
                                       ? (questionB.comparaisonAnnees || []).filter((annee: string) => CARTES_PROVINCE_QUEBEC[annee]).map((annee: string) => ({ value: annee, label: CARTES_PROVINCE_QUEBEC[annee].label }))
                                       : (ERAS_HISTORIQUES[questionB.carteEra] || ERAS_HISTORIQUES["1999"]).regions.map((region) => ({ value: region.nom, label: region.nom }))
                                     ).map((option: { value: string; label: string }) => (
                                       <label className={`espace-choice ${lieuSelectionne === option.value ? "selected" : ""}`} key={option.value}>
                                         <input
                                           type="radio"
                                           name="territoire-a-identifier"
                                           value={option.value}
                                           checked={lieuSelectionne === option.value}
                                           onChange={() => { setResultatSituerEspace(null); setLieuSelectionne(option.value); }}
                                         />
                                         <span>{option.label}</span>
                                       </label>
                                     ))}
                                   </div>
                                 </fieldset>
                               )}
                               <div className="espace-map-panel">
                                 {questionB.carteEra === 'province-quebec'
                                   ? <CarteComparaisonProvinceQuebec mode={modeCarteComparaison} annees={questionB.comparaisonAnnees} lieuCorrect={questionB.lieuCorrect} lieuSelectionne={lieuSelectionne} setLieuSelectionne={(value: string | null) => { setResultatSituerEspace(null); setLieuSelectionne(value); }} />
                                   : <CarteHistorique era={questionB.carteEra} lieuSelectionne={lieuSelectionne} setLieuSelectionne={(value: string | null) => { setResultatSituerEspace(null); setLieuSelectionne(value); }} />}
                               </div>
                             </div>
                            <div className="actions">
                                <button className="btn-generer" onClick={validerSituerEspace} disabled={loadingCorrectionB} style={{backgroundColor: 'var(--card-teal)'}}>corrige.moi</button>
                            </div>
                            {resultatSituerEspace && (
                              <div className="verdict" style={{borderTopColor: 'var(--card-teal)'}}>
                                <div className={`stamp ${resultatSituerEspace.correct ? 'reussi' : ''}`} style={resultatSituerEspace.correct ? {borderColor: 'var(--card-teal)', color: 'var(--card-teal)'} : {}}>{resultatSituerEspace.correct ? 'Bonne réponse !' : `À revoir – la bonne réponse était ${questionB.lieuCorrect}`}</div>
                                 {questionB.explication && <div className="feedback-section"><span className="label">Explication de corrige.moi</span><FeedbackNarratif commentaire={questionB.explication} encouragement={resultatSituerEspace?.pointFort} /></div>}
                                <FeedbackInteractif
                                  feedback={resultatSituerEspace}
                                  reponse={`Territoire choisi : ${lieuSelectionne}`}
                                  accent="var(--card-teal)"
                                />
                              </div>
                            )}
                          </div>
                        ) : (
                          <div>
                             {questionB.documents?.map((d: any, i: number) => <DocumentCard key={i} document={d} index={i} accent="var(--card-teal)" />)}
                             <div className="consigne-box"><span className="tag">Tâche à réaliser</span>{formatConsigneAvecListe(questionB.consigne)}<BoutonLecture texte={questionB.consigne} />{formatRappelMarqueurs(currentOp)}<div className="format-note">Format attendu : {currentOp.formatAttendu}</div></div>
                            {currentOp.id === "continuite-changement"
                              ? <ContinuiteChangementInteractif question={questionB} value={reponseB} onChange={(value) => { setReponseB(value); setFeedbackB(null); }} />
                               : <textarea placeholder="Écris ta réponse ici, en phrases complètes..." value={reponseB} onChange={(e) => { setReponseB(e.target.value); setFeedbackB(null); }} />}
                            <div className="actions">
                                <button className="btn-generer" onClick={corrigerReponseB} disabled={loadingCorrectionB} style={{backgroundColor: 'var(--card-teal)'}}>corrige.moi</button>
                            </div>
                            {loadingCorrectionB && <div className="loading" role="status" aria-live="polite"><div className="spinner" aria-hidden="true"></div>corrige.moi examine ta réponse...</div>}
                             {feedbackB && (
                              <div className="verdict" style={{ display: 'flex', flexDirection: 'column', gap: '24px', padding: '24px' }}>
                                 <div><div className="feedback-step-label">1. Résultat</div><div className={`stamp ${feedbackB.niveau?.toLowerCase().includes('réussi') ? 'reussi' : ''}`} style={{ display: 'inline-block', margin: 0 }}>{feedbackB.niveau || 'Évalué'} • {feedbackB.note || ''}</div></div>
                                <div style={{ borderTop: '1px dashed var(--ligne)', paddingTop: '20px' }}>
                                    <div className="feedback-step-label">2. Explication de corrige.moi</div>
                                    <div className="feedback-body" style={{ fontSize: '15px', lineHeight: '1.6', margin: 0 }}><FeedbackNarratif commentaire={feedbackB.commentaire} encouragement={feedbackB.pointFort} /></div>
                                </div>
                                {feedbackB.exempleReponse && (
                                  <div style={{ borderTop: '1px dashed var(--ligne)', paddingTop: '20px' }}>
                                     <div className="feedback-step-label">3. Démonstration d’une réponse parfaite</div>
                                    <div style={{ padding: '16px', backgroundColor: 'var(--sec-a-soft)', borderLeft: '4px solid var(--card-blue)', borderRadius: '4px', fontStyle: 'italic', fontSize: '15px', color: 'var(--text-main)' }}>{feedbackB.exempleReponse}</div>
                                  </div>
                                )}
                                  <FeedbackInteractif feedback={feedbackB} reponse={reponseB} accent="var(--card-teal)" encouragerPhraseComplete />
                              </div>
                            )}
                          </div>
                        )}
                              <button type="button" className="btn-generer operation-regenerate-button" onClick={genererQuestionsB} disabled={loadingQuestionB} style={{backgroundColor: 'var(--card-teal)'}}>
                               {labelRegenerationQuestionsB}
                             </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {currentView === 'sectionC' && (
            <>
              <button className="link-btn" onClick={() => setCurrentView('menu')} style={{marginBottom: '20px'}}>← Retour au menu principal</button>
              {renderModuleLanding("question")}
              <div className="dossier" style={{maxWidth: '900px'}}>
                <div className="catalog-num">SECTION C — Histoire du Québec et du Canada</div>
                <p className="op-def">Construisez votre plan, consultez les documents et rédigez votre réponse développée.</p>
                 {renderPeriodesActives("var(--question-elab)")}
                
                {erreurGlobal && <div className="app-error-banner" role="alert" aria-live="assertive"><strong>Oups!</strong> {erreurGlobal}</div>}

                {loadingQuestionC ? (
                  <div className="loading" role="status" aria-live="polite"><div className="spinner" aria-hidden="true"></div>Compilation du dossier ministériel (textes et statistiques)...</div>
                ) : !questionC ? (
                   <button className="btn-generer" onClick={genererQuestionC} style={{backgroundColor: 'var(--question-elab)'}}><i className="ti ti-folder-open"></i> Ouvrir le dossier documentaire de l’épreuve</button>
                ) : (
                  <div>
                    <div className="catalog-num" style={{marginBottom: '16px'}}>{afficherDatesPeriode(questionC.periode, questionC.periodeId)}</div>
                     <div className="consigne-box" style={{borderColor: 'var(--question-elab)', backgroundColor: 'var(--question-elab-soft)', marginBottom: '20px'}}>
                        <span className="tag" style={{color: 'var(--question-elab)'}}>Consignes</span>
                      <p style={{marginBottom: '10px', fontStyle: 'italic'}}>{questionC.contexte}</p><p style={{fontWeight: '600', fontSize: '16px'}}>{questionC.consigne}</p><BoutonLecture texte={questionC.consigne} />
                    </div>
                     <div style={{marginBottom: '20px', border: '1px solid var(--ligne)', borderRadius: '6px', background: 'var(--bg-surface)', padding: '16px'}}>
                          <div style={{fontSize: '13px', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 'bold', color: 'var(--question-elab)', marginBottom: '10px'}}>Dossier documentaire</div>
                      <div style={{display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '15px'}}>
                        {questionC.documents?.map((doc: any, index: number) => (
                           <button key={index} onClick={() => setActiveDocIndex(index)} style={{ padding: '6px 12px', fontSize: '13px', borderRadius: '4px', border: activeDocIndex === index ? '2px solid var(--question-elab)' : '1px solid var(--ligne)', backgroundColor: activeDocIndex === index ? 'var(--question-elab)' : 'var(--bg-surface-soft)', color: activeDocIndex === index ? '#fff' : 'var(--text-main)', cursor: 'pointer', fontWeight: 'bold' }}>Document {String.fromCharCode(65 + index)}</button>
                        ))}
                      </div>
                      {questionC.documents && questionC.documents[activeDocIndex] && (
                        <DocumentCard
                          document={questionC.documents[activeDocIndex]}
                          index={activeDocIndex}
                           accent="var(--question-elab)"
                          note={notesDocumentsC[activeDocIndex] || ""}
                          onNoteChange={(value) => setNotesDocumentsC((previous) => ({ ...previous, [activeDocIndex]: value }))}
                        />
                      )}
                    </div>
                     <NotesDocumentsPanel documents={questionC.documents || []} notes={notesDocumentsC} setNotes={setNotesDocumentsC} accent="var(--question-elab)" collapsible />
                    <div className="long-answer-panel">
                      <div className="long-answer-heading">
                        <strong>Réponse de l’élève</strong>
                          <span>Rédige directement ta réponse dans l’espace blanc.</span>
                          <span className={`word-counter ${compterMotsReponse(reponseC) >= 300 ? 'over-limit' : ''}`}>{compterMotsReponse(reponseC)} mot{compterMotsReponse(reponseC) > 1 ? 's' : ''} / 300 max.</span>
                      </div>
                       <textarea className="final-answer" aria-label="Réponse élaborée" placeholder="Rédige ta réponse en t’appuyant sur les documents…" value={reponseC} onChange={(e) => { setReponseC(limiterMots(e.target.value, 300)); setFeedbackC(null); }} />
                    </div>
                    <div className="actions">
                        <button className="btn-generer" onClick={corrigerReponseC} disabled={loadingCorrectionC} style={{backgroundColor: 'var(--question-elab)'}}>corrige.moi</button>
                         <button className="link-btn" onClick={passerQuestionSuivanteC} disabled={loadingQuestionC || loadingCorrectionC} style={{color: 'var(--question-elab)'}}>Question suivante →</button>
                    </div>
                    {loadingCorrectionC && <div className="loading" role="status" aria-live="polite"><div className="spinner" aria-hidden="true"></div>corrige.moi évalue votre utilisation des documents et applique la grille sur 8 points...</div>}
                    
                    {feedbackC && (
                       <div className="verdict" style={{borderTopColor: 'var(--question-elab)'}}>
                         <div className="stamp" style={{borderColor: 'var(--question-elab)', color: 'var(--question-elab)'}}>Évaluation officielle — Note globale : {feedbackC.noteGlobale}</div>
                          <div className="feedback-body" style={{marginBottom: '16px'}}><div className="feedback-section"><span className="label">Explication de corrige.moi</span><FeedbackNarratif commentaire={feedbackC.commentaireGlobal} encouragement={feedbackC.pointFort} /></div></div>
                        <div style={{display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px'}}>
                           <div style={{background: 'rgba(0,0,0,0.03)', padding: '12px', borderRadius: '4px'}}><span className="label" style={{color: 'var(--question-elab)'}}>{feedbackC.detailPartie1?.titre} ({feedbackC.detailPartie1?.note})</span><p style={{fontSize: '13.5px', margin: '4px 0'}}>{feedbackC.detailPartie1?.evaluation}</p></div>
                           <div style={{background: 'rgba(0,0,0,0.03)', padding: '12px', borderRadius: '4px'}}><span className="label" style={{color: 'var(--question-elab)'}}>{feedbackC.detailPartie2?.titre} ({feedbackC.detailPartie2?.note})</span><p style={{fontSize: '13.5px', margin: '4px 0'}}>{feedbackC.detailPartie2?.evaluation}</p></div>
                           {feedbackC.detailPartie3 && ( <div style={{background: 'rgba(0,0,0,0.03)', padding: '12px', borderRadius: '4px'}}><span className="label" style={{color: 'var(--question-elab)'}}>{feedbackC.detailPartie3?.titre} ({feedbackC.detailPartie3?.note})</span><p style={{fontSize: '13.5px', margin: '4px 0'}}>{feedbackC.detailPartie3?.evaluation}</p></div> )}
                        </div>
                         <FeedbackInteractif feedback={feedbackC} reponse={reponseC} accent="var(--question-elab)" encouragerPhraseComplete />
                         {Array.isArray(feedbackC.associationsDocuments) && feedbackC.associationsDocuments.length > 0 && (
                           <div style={{borderTop: '1px dashed var(--ligne)', paddingTop: '20px', marginTop: '20px'}}>
                              <div className="label" style={{color: 'var(--question-elab)', marginBottom: '12px'}}>Association des documents aux éléments de réponse</div>
                             <div style={{display: 'flex', flexDirection: 'column', gap: '14px'}}>
                               {feedbackC.associationsDocuments.map((association: any, associationIndex: number) => (
                                 <div key={associationIndex} style={{background: 'rgba(0,0,0,0.03)', padding: '12px', borderRadius: '4px'}}>
                                   <div style={{fontWeight: 'bold', marginBottom: '8px', color: 'var(--text-main)'}}>{association.element || `Élément ${association.elementId || associationIndex + 1}`}</div>
                                   <div style={{display: 'flex', flexDirection: 'column', gap: '7px'}}>
                                     {(association.documents || []).map((document: any, documentIndex: number) => (
                                       <div key={documentIndex} style={{padding: '9px 10px', background: 'var(--bg-surface)', borderLeft: `3px solid ${document.pertinent ? 'var(--success)' : 'var(--text-muted)'}`, borderRadius: '3px'}}>
                                         <div style={{display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '13px'}}>
                                           <strong>Document {document.document}</strong>
                                           <span style={{color: document.pertinent ? 'var(--card-blue)' : 'var(--period-disabled)', fontWeight: 'bold'}}>{document.pertinent ? 'À utiliser' : 'Hors sujet'}</span>
                                         </div>
                                         <div style={{fontSize: '13px', lineHeight: '1.5', marginTop: '4px'}}>{document.utilisation}</div>
                                       </div>
                                     ))}
                                   </div>
                                 </div>
                               ))}
                             </div>
                           </div>
                          )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
          <BarreNavigationEleve active={studentTab} onChange={naviguerEspaceEleve} />
        </div>
      )}
    </>
  );
}

type SectionAGenerationResume = {
  requestId: string;
  statusUrl?: string;
  prompt: string;
  parcours: "reponses" | "operations";
  niveau: 3 | 4;
  periodes: number[];
  code: string;
};

function sauvegarderRepriseSectionA(value: SectionAGenerationResume): void {
  try {
    window.localStorage.setItem(SECTION_A_GENERATION_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Le job reste repris en mémoire; le stockage local peut être bloqué par le navigateur.
  }
}

function supprimerRepriseSectionA(): void {
  try {
    window.localStorage.removeItem(SECTION_A_GENERATION_STORAGE_KEY);
  } catch {
    // Rien à faire si le navigateur refuse l’accès au stockage.
  }
}

function lireRepriseSectionA(): SectionAGenerationResume | null {
  try {
    const raw = window.localStorage.getItem(SECTION_A_GENERATION_STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw);
    if (
      !value
      || typeof value.requestId !== "string"
      || !value.requestId.trim()
      || typeof value.prompt !== "string"
      || !value.prompt.trim()
      || (value.parcours !== "reponses" && value.parcours !== "operations")
      || (value.niveau !== 3 && value.niveau !== 4)
      || !Array.isArray(value.periodes)
      || value.periodes.some((periode: unknown) => !Number.isInteger(periode))
      || typeof value.code !== "string"
      || !value.code.trim()
    ) {
      window.localStorage.removeItem(SECTION_A_GENERATION_STORAGE_KEY);
      return null;
    }
    return {
      requestId: value.requestId,
      ...(typeof value.statusUrl === "string" && value.statusUrl.startsWith("/api/focus-training/jobs/")
        ? { statusUrl: value.statusUrl }
        : {}),
      prompt: value.prompt,
      parcours: value.parcours,
      niveau: value.niveau,
      periodes: value.periodes.map((periode: number) => Number(periode)),
      code: value.code,
    };
  } catch {
    return null;
  }
}
