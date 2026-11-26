// Journal minimal (remplace pino) : une ligne JSON par événement, visible dans
// Netlify > Logs > Functions. Ne jamais y passer de clé, de prompt ni de réponse brute.
type Data = unknown;
const ecrire = (niveau: string) => (data: Data, message: string): void => {
  const ligne = JSON.stringify({ niveau, message, ...(data && typeof data === "object" ? data : { data }) });
  if (niveau === "error") console.error(ligne);
  else if (niveau === "warn") console.warn(ligne);
  else console.log(ligne);
};
export const logger = { info: ecrire("info"), warn: ecrire("warn"), error: ecrire("error") };
