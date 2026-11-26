type SourceDocumentaire = {
  institution: string;
  titre: string;
  url: string;
};

export const SOURCES_DOCUMENTAIRES: readonly SourceDocumentaire[] = [
  {
    institution: "Bibliothèque et Archives Canada",
    titre: "Collections et dossiers historiques",
    url: "https://www.bac-lac.gc.ca/",
  },
  {
    institution: "Musée de la civilisation",
    titre: "Ressources sur l'histoire du Québec",
    url: "https://www.mcq.org/",
  },
  {
    institution: "Université de Sherbrooke",
    titre: "Bilan du siècle",
    url: "https://bilan.usherbrooke.ca/",
  },
  {
    institution: "Gouvernement du Québec",
    titre: "Chronologie de l'histoire du Québec",
    url: "https://www.quebec.ca/",
  },
];

const MODULE_HISTOIRE_CONTEXT = `Tu es un assistant pédagogique pour l'histoire du Québec et du Canada au secondaire.

POLITIQUE DE RECHERCHE DOCUMENTAIRE CONTRÔLÉE :
- Les sources citées doivent provenir exclusivement du catalogue autorisé ci-dessous.
- N'invente jamais une URL, une citation ou un document précis.
- Si le catalogue ne permet pas de confirmer une information, indique-le dans "limiteSource" et n'affirme pas le détail.
- Retourne les sources dans le champ "sources" avec institution, titre, url et usage.`;

export function buildEducationalContext(action: "generate" | "correct"): string {
  if (!MODULE_HISTOIRE_CONTEXT.trim() || SOURCES_DOCUMENTAIRES.length === 0) {
    throw new Error("Le module de contexte historique est vide ou incomplet.");
  }

  return `${MODULE_HISTOIRE_CONTEXT}

CATALOGUE AUTORISÉ :
${JSON.stringify(SOURCES_DOCUMENTAIRES)}

Action demandée : ${action === "generate" ? "générer une activité" : "corriger une réponse"}.`;
}