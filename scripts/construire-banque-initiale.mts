/**
 * Construit netlify/lib/banque-initiale.json (réserve de départ des lots de la
 * Section A) à partir de lots générés par l'appli (un fichier JSON par lot).
 *
 * Usage : npx tsx scripts/construire-banque-initiale.mts reponses lot1.json lot2.json …
 * Chaque question passe par le même filtre que la réserve en production
 * (entreeAdmissible) ; les doublons sont ignorés.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { entreeAdmissible, type EntreeBanque, type Parcours } from "../netlify/lib/banque.ts";

const [parcours, ...fichiers] = process.argv.slice(2) as [Parcours, ...string[]];
if (parcours !== "reponses" && parcours !== "operations") {
  throw new Error("Premier argument : reponses ou operations.");
}
const cible = new URL("../netlify/lib/banque-initiale.json", import.meta.url);
const existantes = JSON.parse(readFileSync(cible, "utf8")) as EntreeBanque[];
const ids = new Set(existantes.map((e) => e.id));
let ajoutees = 0;
let refusees = 0;
for (const fichier of fichiers) {
  const questions = JSON.parse(readFileSync(fichier, "utf8"));
  for (const question of Array.isArray(questions) ? questions : []) {
    const entree = entreeAdmissible(question, parcours);
    if (!entree) { refusees += 1; continue; }
    if (ids.has(entree.id)) continue;
    ids.add(entree.id);
    existantes.push(entree);
    ajoutees += 1;
  }
}
writeFileSync(cible, JSON.stringify(existantes, null, 1) + "\n");
console.log(`${ajoutees} question(s) ajoutée(s), ${refusees} refusée(s), ${existantes.length} au total.`);
