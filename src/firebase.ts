import { initializeApp } from "firebase/app";
import { collection, getDocs, getFirestore, query, where } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { normaliserCodeUtilise, trierResultatsDuPlusRecent } from "./histoire/resultPersistence";
import { signalerLectureFirebase } from "./histoire/shadowReadClient";
import { lireResultatsSupabase } from "./supabaseResultsClient";

// Ta configuration officielle
export const firebaseConfig = {
  apiKey: "AIzaSyA8moMjFA7oBO5LRBNiPHBJmjilefVEg5o",
  authDomain: "histoire-nationale.firebaseapp.com",
  projectId: "histoire-nationale",
  storageBucket: "histoire-nationale.firebasestorage.app",
  messagingSenderId: "451701053568",
  appId: "1:451701053568:web:3b99396dd35079c59a6e65",
  measurementId: "G-LWH10XQWL0",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

export type ResultatEleve = {
  id: string;
  codeUtilise?: string;
  eleve?: string;
  operation?: string;
  section?: string;
  periode?: string;
  periodeId?: number;
  note?: string;
  resultat?: string;
  reponse?: string;
  commentaire?: string;
  detailCorrection?: unknown;
  horodatage?: unknown;
  [key: string]: unknown;
};

/**
 * Firestore filtre par code avant transmission à l'espace élève. Le tri reste
 * côté client pour accepter les anciens horodatages et les résultats hérités
 * qui n'ont pas de période reconnue.
 */
export async function chargerResultatsEleve(codeUtilise: string): Promise<ResultatEleve[]> {
  const code = normaliserCodeUtilise(codeUtilise);
  if (!code) return [];
  const resultatsSupabase = await lireResultatsSupabase(code);
  if (resultatsSupabase) return trierResultatsDuPlusRecent(resultatsSupabase as ResultatEleve[]) as ResultatEleve[];
  // Les nouveaux codes sont normalisés en majuscules, mais les résultats
  // historiques peuvent avoir été écrits en minuscules ou avec la casse
  // saisie à l'époque. Les trois requêtes évitent une migration destructive.
  const variantes = [...new Set([code, code.toLowerCase(), codeUtilise.trim()])].filter(Boolean);
  const resultatSnaps = await Promise.all(
    variantes.map((variante) => getDocs(
      query(collection(db, "resultats_eleves"), where("codeUtilise", "==", variante)),
    )),
  );
  const documentsUniques = new Map<string, any>();
  resultatSnaps.forEach((resultatSnap) => {
    resultatSnap.docs.forEach((document) => {
      documentsUniques.set(document.id, {
        id: document.id,
        ...document.data(),
      });
    });
  });
  const resultats = [...documentsUniques.values()] as ResultatEleve[];
  const resultatsTries = trierResultatsDuPlusRecent(resultats) as ResultatEleve[];
  // Firebase demeure la source affichée; ce résumé éphémère ne sert qu'à la
  // comparaison staging/pilote et ne change jamais le parcours élève.
  signalerLectureFirebase(
    auth.currentUser?.uid,
    code,
    resultatsTries.map((resultat) => ({
      id: resultat.id,
      horodatage: resultat.horodatage,
    })),
  );
  return resultatsTries;
}