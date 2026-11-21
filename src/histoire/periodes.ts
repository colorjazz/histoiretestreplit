import { PFEQ_REALITES } from "./pfeqReferentiel";

export type NiveauScolaire = 3 | 4;

/**
 * Référentiel unique des réalités historiques utilisées dans les sélecteurs,
 * les générateurs et le tableau de progression.
 */
export const PERIODES_HISTORIQUES = [
  ...PFEQ_REALITES.map((realite) => ({
    id: realite.id,
    niveau: realite.niveau,
    titre: `${realite.periode} : ${realite.titre}`,
  })),
] as const;