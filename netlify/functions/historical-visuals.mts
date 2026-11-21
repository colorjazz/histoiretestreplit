/** /api/historical-visuals, /maps et /image — documents iconographiques Wikimedia Commons. */
import type { Config } from "@netlify/functions";
import { cartesEpoque, relaisImage, visuelsPeriode } from "../lib/historical-visuals";

export default async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  if (url.pathname.endsWith("/maps")) return cartesEpoque(url);
  if (url.pathname.endsWith("/image")) return relaisImage(url);
  return visuelsPeriode(url);
};

export const config: Config = {
  path: ["/api/historical-visuals", "/api/historical-visuals/maps", "/api/historical-visuals/image"],
};
