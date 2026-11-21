// Port de routes/historical-visuals.ts (serveur Replit), sans Express.

const SEARCH_TERMS: Record<number, string> = {
  1: "Quebec New France Indigenous history filetype:bitmap",
  2: "New France Quebec colony filetype:bitmap",
  3: "Quebec conquest 1759 filetype:bitmap",
  4: "Patriotes Lower Canada Quebec filetype:bitmap",
  5: "Canadian Confederation Quebec filetype:bitmap",
  6: "Canada Quebec nationalism 1900 filetype:bitmap",
  7: "Quiet Revolution Quebec filetype:bitmap",
  8: "Quebec contemporary history filetype:bitmap",
};

const RELEVANCE_TERMS: Record<number, string[]> = {
  1: ["quebec", "new france", "canada", "indigenous", "first nations", "huron", "iroquois", "micmac", "montreal", "champlain", "cartier"],
  2: ["new france", "quebec", "canada", "montreal", "acadia", "louisbourg", "france", "indigenous"],
  3: ["quebec", "1759", "conquest", "plains of abraham", "new france", "canada", "british", "montreal"],
  4: ["patriot", "lower canada", "canada", "quebec", "montreal", "rebellion", "papineau", "1837", "1838", "union"],
  5: ["confederation", "canada", "quebec", "ontario", "new brunswick", "nova scotia", "1867", "canadian"],
  6: ["quebec", "canada", "nationalism", "industrial", "montreal", "1900", "20th", "world war", "labour", "labor"],
  7: ["quiet revolution", "quebec", "revolution tranquille", "lesage", "duplessis", "hydro-quebec", "secular", "1960", "nationalism"],
  8: ["quebec", "canada", "modern", "contemporary", "montreal", "ndg", "housing", "indigenous", "architecture", "environment", "language", "referendum", "1980", "1995", "2000"],
};

const MAP_SEARCH_TERMS: Record<string, string> = {
  "province-quebec": "carte française Province de Québec 1763 1774 1783",
  "province-quebec-1763": "carte française Province de Québec 1763",
  "province-quebec-1774": "carte française Province de Québec 1774",
  "province-quebec-1783": "carte française Province de Québec 1783",
  "1867": "carte française Canada provinces 1867",
  "1870-71": "carte française Canada provinces 1870 1871",
  "1999": "carte française Canada provinces territoires 1999",
};

const MAP_RELEVANCE_TERMS: Record<string, string[]> = {
  "province-quebec": ["province de québec", "québec", "1763", "1774", "1783", "carte"],
  "province-quebec-1763": ["province de québec", "québec", "1763", "carte"],
  "province-quebec-1774": ["province de québec", "québec", "1774", "carte"],
  "province-quebec-1783": ["province de québec", "québec", "1783", "carte"],
  "1867": ["canada", "1867", "ontario", "québec", "carte"],
  "1870-71": ["canada", "1870", "1871", "carte"],
  "1999": ["canada", "1999", "nunavut", "territoires", "provinces", "carte"],
};

export const licenceAutorisee = (value: unknown): "Domaine public" | "CC BY-SA" | null => {
  const licence = String(value || "").toLowerCase();
  if (licence.includes("public domain") || licence.includes("domaine public")) return "Domaine public";
  if (licence.includes("cc by-sa")) return "CC BY-SA";
  return null;
};

const retirerHtml = (value: unknown) => String(value || "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
export const estImageRendable = (value: string) => /\.(?:jpe?g|png|gif|svg|webp)(?:$|[?#])/i.test(value);

export const estSourceImageWikimediaAutorisee = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return ["upload.wikimedia.org", "thumb.wikimedia.org"].includes(url.hostname.toLowerCase())
      && /^\/wikipedia\/commons\//i.test(url.pathname)
      && estImageRendable(url.pathname);
  } catch {
    return false;
  }
};

export const estFichierImageCommons = (title: unknown, url: string) => {
  const nom = String(title || "").replace(/^File:/i, "").trim();
  const source = `${nom} ${url}`;
  return !/\.(?:pdf|djvu|djv|svgz|tif|tiff|xcf|psd)(?:[/?#]|$)/i.test(source)
    && estImageRendable(url);
};

function normaliserRecherche(value: unknown): string {
  return retirerHtml(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function visuelEstPertinent(page: any, motsCles: readonly string[]): boolean {
  if (motsCles.length === 0) return true;
  const info = page?.imageinfo?.[0] || {};
  const metadata = info.extmetadata || {};
  const texteRecherche = [
    page?.title,
    metadata.ObjectName?.value,
    metadata.ImageDescription?.value,
    metadata.Categories?.value,
  ].map(normaliserRecherche).join(" ");
  return motsCles.some((motCle) => texteRecherche.includes(normaliserRecherche(motCle)));
}

function anneeVisuel(page: any): number | undefined {
  const info = page?.imageinfo?.[0] || {};
  const metadata = info.extmetadata || {};
  const textesDatants = [
    page?.title,
    metadata.DateTimeOriginal?.value,
    metadata.Date?.value,
  ].map(retirerHtml).join(" ");
  const anneesDate = [...textesDatants.matchAll(/\b(1[5-9]\d{2}|20\d{2})\b/g)]
    .map((correspondance) => Number(correspondance[1]))
    .filter(Number.isInteger);
  const annees = anneesDate.length
    ? anneesDate
    : [...retirerHtml(metadata.Categories?.value).matchAll(/\b(1[5-9]\d{2}|20\d{2})\b/g)]
      .map((correspondance) => Number(correspondance[1]))
      .filter(Number.isInteger);
  if (!annees.length) return undefined;
  // Un fichier contemporain peut être classé avec un sujet historique;
  // une seule année moderne suffit donc à ne pas le rejeter.
  return annees.some((annee) => annee >= 1980)
    ? Math.max(...annees.filter((annee) => annee >= 1980))
    : Math.min(...annees);
}

function visuelCompatibleAvecPeriode(page: any, period: number): boolean {
  // Pour la période 8, une image datée avant 1980 est anachronique pour le
  // thème du Québec contemporain. Les autres périodes peuvent légitimement
  // utiliser une représentation postérieure d'un personnage ou d'un fait.
  const annee = anneeVisuel(page);
  return period !== 8 || annee === undefined || annee >= 1980;
}

export function normaliserVisuelWikimedia(page: any, motsCles: readonly string[] = [], period?: number): {
  titre: string;
  typeDoc: "Iconographique";
  reference: string;
  auteur: string;
  annee: string;
  texte: string;
  imageUrl: string;
  imageAlt: string;
  imageLicense: "Domaine public" | "CC BY-SA";
} | null {
  if (!visuelEstPertinent(page, motsCles) || (period !== undefined && !visuelCompatibleAvecPeriode(page, period))) return null;
  const info = page?.imageinfo?.[0] || {};
  const metadata = info.extmetadata || {};
  const imageLicense = licenceAutorisee(metadata.LicenseShortName?.value);
  const rawUrl = String(info.url || "").split("?")[0];
  const thumbnailUrl = String(info.thumburl || "").split("?")[0];
  const titre = String(page.title || "").replace(/^File:/i, "");
  const imageUrl = estImageRendable(rawUrl) ? rawUrl : thumbnailUrl;
  if (!imageLicense || !estFichierImageCommons(titre, imageUrl) || !/^https:\/\/(?:upload|thumb)\.wikimedia\.org\//i.test(imageUrl)) return null;
  const description = retirerHtml(metadata.ImageDescription?.value) || `Document iconographique de Wikimedia Commons : ${titre}.`;
  return {
    titre,
    typeDoc: "Iconographique",
    reference: `Wikimedia Commons — ${page.title}`,
    auteur: retirerHtml(metadata.Artist?.value),
    annee: retirerHtml(metadata.Date?.value),
    texte: description,
    imageUrl,
    imageAlt: description.slice(0, 240),
    imageLicense,
  };
}

const USER_AGENT = "HistoireQuebecEducationalApp/1.0 (educational open-source project)";

function json(status: number, body: unknown, cache = "no-store"): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": cache },
  });
}

async function rechercherCommons(params: URLSearchParams): Promise<Record<string, any> | { erreur: string }> {
  const upstream = await fetch(`https://commons.wikimedia.org/w/api.php?${params.toString()}`, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(8000),
  });
  if (!upstream.ok) return { erreur: `upstream-${upstream.status}` };
  const data = await upstream.json() as { query?: { pages?: Record<string, any> } };
  return data.query?.pages || {};
}

/** GET /api/historical-visuals?period=&count= */
export async function visuelsPeriode(url: URL): Promise<Response> {
  const period = Number(url.searchParams.get("period"));
  const count = Math.min(4, Math.max(1, Number(url.searchParams.get("count")) || 1));
  const params = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: SEARCH_TERMS[period] || SEARCH_TERMS[8],
    gsrnamespace: "6",
    gsrlimit: String(Math.min(12, count * 4)),
    prop: "imageinfo",
    iiprop: "url|extmetadata",
    iiurlwidth: "1200",
    format: "json",
  });
  try {
    const pages = await rechercherCommons(params);
    if ("erreur" in pages && typeof pages.erreur === "string") {
      return json(200, { visuals: [], method: "Wikimedia Commons API", reason: pages.erreur });
    }
    const visuals = Object.values(pages)
      .map((page) => normaliserVisuelWikimedia(page, RELEVANCE_TERMS[period] || RELEVANCE_TERMS[8], period))
      .filter(Boolean)
      .slice(0, count);
    return json(200, { visuals, method: "Wikimedia Commons API", licence: "Domaine public ou CC BY-SA" }, "public, max-age=600");
  } catch (error) {
    console.error("Erreur recherche visuels Wikimedia", error);
    return json(200, { visuals: [], method: "Wikimedia Commons API", reason: "unavailable" });
  }
}

/** GET /api/historical-visuals/maps?era= */
export async function cartesEpoque(url: URL): Promise<Response> {
  const era = String(url.searchParams.get("era") || "");
  const params = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: MAP_SEARCH_TERMS[era] || MAP_SEARCH_TERMS["1999"],
    gsrnamespace: "6",
    gsrlimit: "24",
    prop: "imageinfo",
    iiprop: "url|extmetadata",
    iiurlwidth: "1600",
    format: "json",
  });
  try {
    const pages = await rechercherCommons(params);
    if ("erreur" in pages && typeof pages.erreur === "string") {
      return json(200, { visuals: [], method: "Wikimedia Commons API", reason: pages.erreur });
    }
    const visuals = Object.values(pages)
      .map((page) => normaliserVisuelWikimedia(page, MAP_RELEVANCE_TERMS[era] || MAP_RELEVANCE_TERMS["1999"]))
      .filter((visual) => Boolean(visual) && /\b(?:carte|province|provinces|territoire|territoires|québec)\b/i.test(`${visual?.titre || ""} ${visual?.texte || ""}`))
      .slice(0, 4);
    return json(200, { visuals, method: "Wikimedia Commons API", licence: "Domaine public ou CC BY-SA" }, "public, max-age=600");
  } catch (error) {
    console.error("Erreur recherche cartes Wikimedia", error);
    return json(200, { visuals: [], method: "Wikimedia Commons API", reason: "unavailable" });
  }
}

/** GET /api/historical-visuals/image?url= — relais d'image Wikimedia autorisée seulement. */
export async function relaisImage(url: URL): Promise<Response> {
  const source = String(url.searchParams.get("url") || "");
  if (!estSourceImageWikimediaAutorisee(source)) return json(400, { error: "Image Wikimedia non autorisée." });
  try {
    const upstream = await fetch(source, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(8000),
    });
    if (!upstream.ok) {
      return json(upstream.status === 404 ? 404 : 502, { error: "Image Wikimedia indisponible." });
    }
    const contentType = upstream.headers.get("content-type") || "";
    if (!contentType.toLowerCase().startsWith("image/")) {
      return json(415, { error: "La ressource Wikimedia n'est pas une image." });
    }
    return new Response(await upstream.arrayBuffer(), {
      status: 200,
      headers: { "Content-Type": contentType, "Cache-Control": "public, max-age=86400" },
    });
  } catch (error) {
    console.error("Erreur relais image Wikimedia", error);
    return json(502, { error: "Le relais de l'image Wikimedia est temporairement indisponible." });
  }
}
