export interface Operation {
  id: string;
  num: string;
  nom: string;
  description?: string;
  def?: string;
  consigneType?: string;
  formatAttendu?: string;
  criteresObligatoires?: string[];
  marqueursRecommandes?: Array<{
    typeLien: string;
    marqueurs: string;
  }>;
  [key: string]: unknown;
}

export const OPERATIONS: Operation[];
export const CONSIGNES_ESPACE_TEMPS: {
  ordre: string;
  "avant-apres": string;
  "suite-chronologique": string;
};