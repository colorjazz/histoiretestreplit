export type HistoricalVisual = {
  titre: string;
  typeDoc: "Iconographique";
  reference: string;
  auteur: string;
  annee: string;
  texte: string;
  imageUrl: string;
  imageAlt: string;
  imageLicense: "Domaine public" | "CC BY-SA";
};

const FALLBACK_VISUALS: Array<HistoricalVisual & { periods: number[] }> = [
  {
    periods: [1, 2],
    titre: "Portrait officiel de Samuel de Champlain",
    typeDoc: "Iconographique",
    reference: "Wikimedia Commons — File:Samuel de Champlain by Ronjat.jpg",
    auteur: "Eugène Ronjat",
    annee: "XIXe siècle",
    texte: "Portrait officiel postérieur de Samuel de Champlain, utilisé comme représentation historique du fondateur de Québec.",
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/f/f9/Samuel_de_Champlain_by_Ronjat.jpg",
    imageAlt: "Portrait en noir et blanc de Samuel de Champlain",
    imageLicense: "Domaine public",
  },
  {
    periods: [1, 2, 3],
    titre: "Portrait officiel d’Abraham Martin",
    typeDoc: "Iconographique",
    reference: "Wikimedia Commons — File:Abraham Martin.jpg",
    auteur: "Charles Huot",
    annee: "1900",
    texte: "Portrait officiel associé à Abraham Martin et au territoire de Québec.",
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/c/c7/Abraham_Martin.jpg",
    imageAlt: "Représentation peinte d'Abraham Martin",
    imageLicense: "Domaine public",
  },
  {
    periods: [3, 4, 5],
    titre: "Louis-Joseph Papineau",
    typeDoc: "Iconographique",
    reference: "Wikimedia Commons — File:Louis-Joseph Papineau, par Alfred Boisseau, 1871.jpg",
    auteur: "Alfred Boisseau",
    annee: "1871",
    texte: "Portrait officiel de Louis-Joseph Papineau, figure politique des revendications nationales au Bas-Canada.",
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/4/48/Louis-Joseph_Papineau%2C_par_Alfred_Boisseau%2C_1871.jpg",
    imageAlt: "Portrait peint de Louis-Joseph Papineau",
    imageLicense: "Domaine public",
  },
  {
    periods: [5, 6],
    titre: "Caricature sur les bienfaits de la Confédération",
    typeDoc: "Iconographique",
    reference: "Wikimedia Commons — File:Bienfaits de la Confederation - Charles-Henri Moreau - 1865.jpg",
    auteur: "Charles-Henri Moreau",
    annee: "1865",
    texte: "Caricature politique contemporaine des débats sur la Confédération canadienne.",
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/5/59/Bienfaits_de_la_Confederation_-_Charles-Henri_Moreau_-_1865.jpg",
    imageAlt: "Caricature politique sur les débats de la Confédération",
    imageLicense: "Domaine public",
  },
  {
    periods: [7, 8],
    titre: "Édifice des douanes du Vieux-Québec",
    typeDoc: "Iconographique",
    reference: "Wikimedia Commons — File:New Quebec Custom House.jpg",
    auteur: "Judith Bourque",
    annee: "XXIe siècle",
    texte: "Photographie d'un lieu institutionnel du Vieux-Québec servant à contextualiser les transformations du territoire et des institutions.",
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/4/4e/New_Quebec_Custom_House.jpg",
    imageAlt: "Édifice des douanes de Québec",
    imageLicense: "CC BY-SA",
  },
];

const visuelsDistantsEnCache = new Map<string, Promise<any[]>>();
const cartesDistantesEnCache = new Map<string, Promise<HistoricalVisual | null>>();

function licenceAutorisee(value: unknown): "Domaine public" | "CC BY-SA" | null {
  const licence = String(value || "").toLowerCase();
  if (licence.includes("public domain") || licence.includes("domaine public")) return "Domaine public";
  if (licence.includes("cc by-sa")) return "CC BY-SA";
  return null;
}

const CHAMPS_SOURCE_IMAGE = ["imageUrl", "image", "imageSource", "imageSrc", "urlImage", "wikimediaUrl"] as const;

function estSourceImageWikimediaRendable(value: unknown): value is string {
  return typeof value === "string"
    && /^https:\/\/(?:upload|thumb)\.wikimedia\.org\//i.test(value)
    && /\.(?:jpe?g|png|gif|svg|webp)(?:$|[?#])/i.test(value);
}

export function getWikimediaImageSource(document: any): string | undefined {
  if (!licenceAutorisee(document?.imageLicense)) return undefined;
  return CHAMPS_SOURCE_IMAGE
    .map((champ) => document?.[champ])
    .find(estSourceImageWikimediaRendable);
}

export function getWikimediaImageProxySource(source: string): string {
  return `/api/historical-visuals/image?url=${encodeURIComponent(source)}`;
}

export function getFallbackWikimediaImageSource(periodeId?: number): string | undefined {
  return fallbackVisuals(Number(periodeId) || 1, 1)[0]?.imageUrl;
}

export async function chargerCarteHistoriqueLibre(era: string): Promise<HistoricalVisual | null> {
  const cachee = cartesDistantesEnCache.get(era);
  if (cachee) return cachee;

  const demande = (async () => {
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(`/api/historical-visuals/maps?era=${encodeURIComponent(era)}`, {
        signal: controller.signal,
      });
      if (!response.ok) return null;
      const data = await response.json() as { visuals?: unknown };
      const candidat = Array.isArray(data.visuals) ? data.visuals[0] : null;
      if (!candidat || typeof candidat !== "object") return null;
      const visual = candidat as Partial<HistoricalVisual>;
      if (!visual.imageUrl || !visual.imageLicense || !/^https:\/\/(?:upload|thumb)\.wikimedia\.org\//i.test(visual.imageUrl)) return null;
      return visual as HistoricalVisual;
    } catch {
      return null;
    } finally {
      globalThis.clearTimeout(timeout);
    }
  })();
  cartesDistantesEnCache.set(era, demande);
  return demande;
}

export function imageWikimediaAutorisee(document: any): boolean {
  return Boolean(getWikimediaImageSource(document));
}

export function estDocumentIconographique(document: any): boolean {
  const type = String(document?.typeDoc || document?.type || "").toLowerCase();
  return ["icon", "image", "photo", "affich", "portrait", "carte", "graph", "visuel"]
    .some((motif) => type.includes(motif));
}

export function documentsIconographiquesComplets(documents: unknown): boolean {
  if (!Array.isArray(documents)) return false;
  return documents.every((document) => !estDocumentIconographique(document) || imageWikimediaAutorisee(document));
}

export function compterDocumentsIconographiques(documents: unknown): number {
  return Array.isArray(documents) ? documents.filter(estDocumentIconographique).length : 0;
}

function fallbackVisuals(periodeId: number, minimum: number): HistoricalVisual[] {
  const parPeriode = FALLBACK_VISUALS.filter((visual) => visual.periods.includes(periodeId));
  const disponibles = parPeriode.length > 0 ? parPeriode : FALLBACK_VISUALS;
  return Array.from({ length: minimum }, (_, index) => disponibles[index % disponibles.length]);
}

export async function enrichirDocumentsAvecVisuels(documents: any[], periodeId: number, minimum = 1): Promise<any[]> {
  const originaux = Array.isArray(documents) ? documents : [];
  const visuelsExistants = originaux.filter(imageWikimediaAutorisee).length;
  const iconographiquesSansImage = originaux.filter((document) => estDocumentIconographique(document) && !imageWikimediaAutorisee(document));
  if (visuelsExistants >= minimum && iconographiquesSansImage.length === 0) return originaux;

  const besoin = Math.max(minimum - visuelsExistants, iconographiquesSansImage.length);
  const cacheKey = `${periodeId}:${Math.max(2, besoin)}`;
  let demandeVisuels = visuelsDistantsEnCache.get(cacheKey);
  if (!demandeVisuels) {
    demandeVisuels = (async () => {
      const controller = new AbortController();
      const timeout = globalThis.setTimeout(() => controller.abort(), 3500);
      try {
        const response = await fetch(`/api/historical-visuals?period=${encodeURIComponent(String(periodeId))}&count=${encodeURIComponent(String(Math.max(2, besoin)))}`, {
          signal: controller.signal,
        });
        if (!response.ok) return [];
        const data = await response.json() as { visuals?: unknown };
        return Array.isArray(data.visuals) ? data.visuals : [];
      } catch {
        // Le catalogue local garantit le rendu même si l'API Commons est temporairement indisponible.
        return [];
      } finally {
        globalThis.clearTimeout(timeout);
      }
    })();
    visuelsDistantsEnCache.set(cacheKey, demandeVisuels);
  }
  const visuelsDistants = await demandeVisuels;

  const candidats = [...visuelsDistants, ...fallbackVisuals(periodeId, besoin)];
  const dejaVues = new Set(originaux.map((document) => getWikimediaImageSource(document)).filter(Boolean));
  const visuelsExistantsValides = originaux
    .filter(imageWikimediaAutorisee)
    .map((document) => ({
      imageUrl: getWikimediaImageSource(document),
      imageAlt: document.imageAlt,
      imageLicense: document.imageLicense,
      reference: document.reference,
      auteur: document.auteur,
      annee: document.annee,
      texte: document.texte,
    }));
  const visuelsDisponibles: any[] = [];
  for (const candidat of candidats) {
    const licence = licenceAutorisee(candidat?.imageLicense);
    const source = getWikimediaImageSource({ ...candidat, imageLicense: licence });
    if (!source || dejaVues.has(source)) continue;
    dejaVues.add(source);
    visuelsDisponibles.push({ ...candidat, imageUrl: source, imageLicense: licence });
  }

  const remplis = [...originaux];
  iconographiquesSansImage.forEach((document, index) => {
    const visuel = visuelsDisponibles.length > 0
      ? visuelsDisponibles[index % visuelsDisponibles.length]
      : visuelsExistantsValides.length > 0
        ? visuelsExistantsValides[index % visuelsExistantsValides.length]
        : undefined;
    if (!visuel) return;
    remplis[originaux.indexOf(document)] = {
      ...document,
      imageUrl: visuel.imageUrl,
      imageAlt: document.imageAlt || visuel.imageAlt,
      imageLicense: visuel.imageLicense,
      reference: document.reference || visuel.reference,
      auteur: document.auteur || visuel.auteur,
      annee: document.annee || visuel.annee,
      texte: document.texte || visuel.texte,
      typeDoc: "Iconographique",
    };
  });

  const visuelsExistantsApresRemplissage = remplis.filter(imageWikimediaAutorisee).length;
  const besoinAjouts = Math.max(0, minimum - visuelsExistantsApresRemplissage);
  const ajouts: any[] = [];
  for (const visuel of visuelsDisponibles.slice(iconographiquesSansImage.length)) {
    ajouts.push({ ...visuel, typeDoc: "Iconographique" });
    if (ajouts.length >= besoinAjouts) break;
  }
  return [...remplis, ...ajouts];
}

export function resoudrePeriodeId(periode: unknown, periodeId: unknown, fallback?: number): number {
  const id = Number(periodeId);
  if (Number.isInteger(id) && id > 0) return id;
  const valeur = String(periode || "").toLowerCase();
  const match = valeur.match(/p[ée]riode\s*(\d+)/i);
  if (match) return Number(match[1]);
  const intervalle = valeur.match(/(\d{3,4})\s*[-–]\s*(\d{3,4})/);
  if (intervalle) {
    const debut = Number(intervalle[1]);
    if (debut < 1608) return 1;
    if (debut < 1760) return 2;
    if (debut < 1791) return 3;
    if (debut < 1840) return 4;
    if (debut < 1896) return 5;
    if (debut < 1945) return 6;
    if (debut < 1980) return 7;
    return 8;
  }
  return fallback ?? 0;
}