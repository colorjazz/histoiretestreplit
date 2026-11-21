export type DonneesResultat = Record<string, unknown>;

export function normaliserCodeUtilise(codeUtilise: string): string {
  return codeUtilise.trim().toUpperCase();
}

export function preparerResultatPourSauvegarde(
  donnees: DonneesResultat,
  codeUtilise: string,
  parcours: "reponses" | "operations",
): DonneesResultat {
  const section = donnees.section;
  const module = donnees.module
    || (section === "Section C"
      ? "Question élaborée"
      : donnees.operation === "Schéma conceptuel"
        ? "Schémas conceptuels"
        : parcours === "operations"
          ? "Opérations intellectuelles"
          : "Réponses courtes");
  return {
    matiere: "Histoire du Québec et du Canada",
    module,
    notion: donnees.notion || donnees.operation || donnees.periode || "Compétence historique",
    ...donnees,
    codeUtilise: normaliserCodeUtilise(codeUtilise),
  };
}

export function ajouterResultatLocal(
  resultatsActuels: DonneesResultat[],
  documentId: string,
  resultat: DonneesResultat,
  horodatage = new Date(),
): DonneesResultat[] {
  return [
    { id: documentId, ...resultat, horodatage },
    ...resultatsActuels,
  ];
}

export function horodatageEnMillisecondes(resultat: DonneesResultat): number {
  const valeur = resultat.horodatage as { toMillis?: () => number } | Date | string | number | null | undefined;
  if (typeof (valeur as { toMillis?: unknown })?.toMillis === "function") {
    return (valeur as { toMillis: () => number }).toMillis();
  }
  if (valeur instanceof Date) return valeur.getTime();
  return new Date(String(valeur || 0)).getTime() || 0;
}

export function trierResultatsDuPlusRecent(resultats: DonneesResultat[]): DonneesResultat[] {
  return [...resultats].sort((a, b) => horodatageEnMillisecondes(b) - horodatageEnMillisecondes(a));
}