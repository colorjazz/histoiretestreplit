/**
 * GET /api/banque-section-a?parcours=reponses|operations&periodes=1,2&exclure=id1,id2
 * Lot de réserve de 10 questions, demandé par l'appli seulement quand la
 * génération du lot a échoué malgré les relances.
 */
import type { Config } from "@netlify/functions";
import { tirerLot, type Parcours } from "../lib/banque";
import { logger } from "../lib/logger";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
});

export default async (req: Request): Promise<Response> => {
  if (req.method !== "GET") return json(405, { error: "Méthode non permise." });
  const url = new URL(req.url);
  const parcours = url.searchParams.get("parcours");
  if (parcours !== "reponses" && parcours !== "operations") return json(400, { error: "Module invalide." });
  const periodes = [...new Set((url.searchParams.get("periodes") || "").split(",").map(Number))]
    .filter((p) => Number.isInteger(p) && p >= 1 && p <= 8);
  if (periodes.length === 0) return json(400, { error: "Périodes invalides." });
  const exclus = new Set((url.searchParams.get("exclure") || "").split(",").filter((id) => /^[0-9a-f]{16}$/.test(id)).slice(0, 500));
  try {
    const lot = await tirerLot(parcours as Parcours, periodes, exclus);
    if (!lot) {
      logger.warn({ parcours, periodes }, "Réserve insuffisante pour un lot complet");
      return json(404, { error: "Aucun lot de réserve disponible pour ces périodes." });
    }
    logger.info({ parcours, periodes }, "Lot de réserve servi");
    return json(200, { questions: lot.map((e) => ({ ...e.question, reserveId: e.id })) });
  } catch (error) {
    logger.error({ message: error instanceof Error ? error.message : "Erreur inconnue" }, "Réserve illisible");
    return json(503, { error: "Réserve indisponible." });
  }
};

export const config: Config = { path: "/api/banque-section-a" };
