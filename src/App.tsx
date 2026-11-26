import React, { lazy, Suspense, useState, useEffect } from 'react';
import {
  BookOpen, Users, Settings, Key, Search, FileText,
  CheckCircle, AlertCircle, LogOut, Shield, X, RefreshCw, Loader2,
  Lock, Mail, ArrowRight, User as UserIcon, Building, PlusCircle,
  Activity, Download, Megaphone, Eye, ChevronRight, Menu, Home,
  Compass, Target, Sparkles, UserRound, UserPlus, Calculator,
  FlaskConical, Languages, ShieldCheck
} from 'lucide-react';
import { db, auth, firebaseConfig } from './firebase';
import { PERIODES_HISTORIQUES } from './histoire/periodes';
import {
  auditerCouverturePFEQ,
  compterResultatsPFEQNonRattaches,
  filtrerResultatsPFEQNonRattaches,
  filtrerResultatsPFEQParGroupe,
  filtrerResultatsPFEQParNiveau,
  genererCSVResultatsPFEQNonRattaches,
  OPERATIONS_PFEQ,
  PFEQ_REALITES,
} from './histoire/pfeqReferentiel';
import { normaliserCodeUtilise } from './histoire/resultPersistence';
import { preparerMotDePasseSupabase } from './authMigrationClient';
import {
  collection, getDocs, addDoc, serverTimestamp, query, orderBy, where,
  doc, updateDoc, setDoc, getDoc
} from 'firebase/firestore';
import {
  onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signOut, sendPasswordResetEmail, getAuth
} from 'firebase/auth';
import { initializeApp } from 'firebase/app';
import type { User } from 'firebase/auth';

interface Groupe {
  id: string; nom: string; codes?: string[]; prefixeBase: string;
  dateCreation: any; profId?: string;
  periodesDebloquees?: number[];
  codesUtilises?: Record<string, { nom: string; email: string; uid: string; date: any }>;
}
interface Ecole {
  id: string; nom: string; prefixe: string;
  codesProfs?: string[];
  codesProfsUtilises?: Record<string, { email: string; uid: string; date: any }>;
  nbGroupes?: number; nbResultats?: number; tauxReussite?: number;
}
interface ProfProfil {
  id: string; uid: string; email: string; codeUtilise: string; ecoleId: string; dateInscription: any;
}

import { appelerFocusTraining } from "./histoire/focusTrainingClient";
const HistoireApp = lazy(() => import('./histoire/App'));

type AppRole = 'superadmin' | 'adminEcole' | 'prof' | 'eleve';

async function roleAutoriseParServeur(user: User): Promise<{ role: AppRole; ecoleId?: string } | null> {
  const token = await user.getIdToken();
  const response = await fetch('/api/auth/me', {
    headers: { Authorization: `Bearer ${token}` },
    credentials: 'same-origin',
  });
  if (!response.ok) return null;
  const data = await response.json() as {
    role?: unknown;
    scope?: { ecoleId?: unknown } | null;
  };
  const role = String(data.role || '');
  if (!['superadmin', 'adminEcole', 'prof', 'eleve'].includes(role)) return null;
  const result: { role: AppRole; ecoleId?: string } = { role: role as AppRole };
  if (typeof data.scope?.ecoleId === 'string' && data.scope.ecoleId) result.ecoleId = data.scope.ecoleId;
  return result;
}

function routeDemandee(): 'public' | 'app' | 'admin' | 'super-admin' {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  if (path === '/super-admin' || path.startsWith('/super-admin/')) return 'super-admin';
  if (path === '/admin' || path.startsWith('/admin/')) return 'admin';
  if (path === '/app' || path.startsWith('/app/')) return 'app';
  return 'public';
}

function rolePeutOuvrirRoute(role: AppRole, route: ReturnType<typeof routeDemandee>): boolean {
  if (route === 'public' || route === 'app') return true;
  if (route === 'super-admin') return role === 'superadmin';
  return role === 'superadmin' || role === 'adminEcole';
}

function afficherDatesPeriode(periode: unknown, periodeId?: unknown) {
  const id = Number(periodeId);
  const valeur = String(periode || "").toLowerCase();
  const numeroDansLibelle = valeur.match(/p[ée]riode\s*(\d+)/i);
  const reference = PERIODES_HISTORIQUES.find((item) => item.id === id)
    || (numeroDansLibelle ? PERIODES_HISTORIQUES.find((item) => item.id === Number(numeroDansLibelle[1])) : undefined)
    || PERIODES_HISTORIQUES.find((item) =>
      valeur.includes(item.titre.toLowerCase()) ||
      valeur.includes(item.titre.split(" : ")[0].toLowerCase()) ||
      valeur.includes(item.titre.split(" : ")[1]?.toLowerCase() || "")
    );
  return reference?.titre.split(" : ")[0] || String(periode || "Dates non précisées");
}

function formaterDateResultat(valeur: unknown): string {
  let date: Date | null = null;
  if (valeur instanceof Date) {
    date = valeur;
  } else if (valeur && typeof (valeur as { toDate?: () => Date }).toDate === "function") {
    date = (valeur as { toDate: () => Date }).toDate();
  } else if (valeur && typeof valeur === "object" && "seconds" in valeur) {
    const secondes = Number((valeur as { seconds?: unknown }).seconds);
    if (Number.isFinite(secondes)) date = new Date(secondes * 1000);
  } else if (typeof valeur === "string" || typeof valeur === "number") {
    const dateCandidate = new Date(valeur);
    if (!Number.isNaN(dateCandidate.getTime())) date = dateCandidate;
  }
  if (!date || Number.isNaN(date.getTime())) return "Date non précisée";
  return new Intl.DateTimeFormat("fr-CA", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function libellePeriodeHistorique(resultat: any): string {
  const periode = String(resultat?.periode || "").trim();
  if (periode) return periode;
  const periodeId = resultat?.periodeId;
  if (periodeId !== undefined && periodeId !== null && String(periodeId).trim()) {
    return `Identifiant de période conservé : ${periodeId}`;
  }
  return "Période non précisée";
}

function groupePourCode(groupes: Groupe[], code: unknown): Groupe | undefined {
  const codeNormalise = normaliserCodeUtilise(String(code || ""));
  return groupes.find((groupe) => (groupe.codes || []).some((codeGroupe) => normaliserCodeUtilise(codeGroupe) === codeNormalise));
}

function elevePourCode(groupe: Groupe | undefined, code: unknown): any {
  if (!groupe?.codesUtilises) return undefined;
  const codeNormalise = normaliserCodeUtilise(String(code || ""));
  const entree = Object.entries(groupe.codesUtilises).find(([codeGroupe]) => normaliserCodeUtilise(codeGroupe) === codeNormalise);
  return entree?.[1];
}

function telechargerCSV(nomFichier: string, contenu: string): void {
  const blob = new Blob([contenu], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const lien = document.createElement("a");
  lien.href = url;
  lien.download = nomFichier;
  document.body.appendChild(lien);
  lien.click();
  lien.remove();
  URL.revokeObjectURL(url);
}

function genererCodesProfs(prefixe: string, nombre: number): string[] {
  return Array.from({ length: nombre }, (_, i) => `${prefixe}-PROF-${(i + 1).toString().padStart(2, '0')}`);
}

/** Appel à Gemini par le serveur : suit la tâche de génération et envoie le jeton de l'enseignant. */
async function callGenerationService(action: string, payload: any) {
  return appelerFocusTraining(action === "generer" ? "generate" : "correct", payload.prompt);
}

// --- COMPOSANT PIED DE PAGE (Mentions légales) ---
function FooterGlobale() {
  const [showAPropos, setShowAPropos] = useState(false);
  return (
    <footer className="w-full text-center py-6 px-6 text-[11px] sm:text-xs text-stone/70 mt-auto shrink-0 border-t border-line bg-sand">
      <p className="max-w-3xl mx-auto mb-2">Cette application est conçue uniquement pour la pratique des compétences, notamment les opérations intellectuelles. Elle ne sert pas de remplacement à un enseignant d’histoire.</p>
      <button onClick={() => setShowAPropos(true)} className="text-brand-red hover:text-brand-red-hover font-medium transition-colors">À propos du projet</button>
      
      {showAPropos && (
        <div className="fixed inset-0 bg-espresso/80 flex items-center justify-center z-[100] p-4 backdrop-blur-sm text-left">
          <div className="bg-white rounded-2xl p-8 w-full max-w-lg shadow-xl">
            <h2 className="text-xl font-bold mb-4 text-espresso flex items-center gap-2"><BookOpen className="h-5 w-5 text-brand-red"/> À propos de Corrige.moi</h2>
            <div className="space-y-4 text-sm text-stone leading-relaxed">
              <p>Ce projet est une initiative strictement personnelle. Il n’est affilié d’aucune façon au gouvernement du Québec, ni au Ministère de l’Éducation.</p>
              <p>Notre mission est d’utiliser la force des grands modèles de langage au service de la pratique des compétences historiques et de fournir un soutien pédagogique interactif.</p>
            </div>
            <div className="mt-8 flex justify-end">
              <button onClick={() => setShowAPropos(false)} className="px-5 py-2.5 bg-sand-soft text-espresso/90 hover:bg-line rounded-lg font-medium transition-colors">Fermer</button>
            </div>
          </div>
        </div>
      )}
    </footer>
  );
}

// --- 1. ACCUEIL ---
function EcranAccueil({ onChoisirRole }: { onChoisirRole: (role: 'eleve' | 'enseignant') => void }) {
  const [page, setPage] = useState<'accueil' | 'matieres' | 'progression' | 'compte'>('accueil');

  const matieres = [
    { nom: "Histoire du Québec et du Canada", court: "Histoire", description: "Sources, opérations intellectuelles et préparation à l’épreuve.", icon: BookOpen, disponible: true },
    { nom: "Mathématiques", court: "Mathématiques", description: "Raisonnement, résolution de problèmes et démarches expliquées.", icon: Calculator, disponible: false },
    { nom: "Sciences", court: "Sciences", description: "Observer, expliquer et relier les notions scientifiques.", icon: FlaskConical, disponible: false },
    { nom: "Français", court: "Français", description: "Lire, écrire et structurer sa pensée avec précision.", icon: Languages, disponible: false },
  ];

  const ouvrirAccueilEleve = () => onChoisirRole('eleve');
  const ouvrirTarifs = () => {
    setPage('accueil');
    window.setTimeout(() => document.getElementById('tarifs')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  };

  return (
    <div className="min-h-screen flex flex-col bg-sand font-sans text-espresso">
      <main className="flex-1 w-full max-w-7xl mx-auto px-5 sm:px-8 pt-6 sm:pt-8 pb-28">
        <header className="home-app-header flex items-center justify-between gap-4 mb-8 sm:mb-12">
          <button onClick={() => setPage('accueil')} className="flex items-center gap-3 text-left" aria-label="Retour à l’accueil">
            <span className="inline-flex p-2.5 bg-espresso text-white rounded-xl"><BookOpen className="h-5 w-5" /></span>
            <span><strong className="block text-lg font-display tracking-tight">Corrige.moi</strong><span className="block text-xs text-stone">Histoire. Méthode. Progrès.</span></span>
          </button>
          <button onClick={() => setPage('compte')} className="home-account-button inline-flex items-center gap-2 rounded-full bg-espresso px-4 py-2.5 text-sm font-bold text-white shadow-[0_8px_24px_-12px_rgba(0,0,0,0.6)] hover:bg-espresso/90 transition-colors">
            <UserRound className="h-4 w-4" /> Mon compte
          </button>
        </header>

        {page === 'accueil' && (
          <>
            <section className="grid lg:grid-cols-[1.12fr_0.88fr] gap-6 lg:gap-10 items-stretch fade-in">
              <div className="rounded-[2rem] border border-line bg-white p-7 sm:p-12 shadow-[0_24px_70px_-44px_rgba(0,0,0,0.55)]">
                <span className="inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.18em] text-brand-red mb-6"><span className="h-1.5 w-1.5 rounded-full bg-brand-red" /> Secondaire 3 et 4</span>
                <h1 className="max-w-3xl text-4xl sm:text-6xl font-display font-black tracking-[-0.04em] leading-[1.02] mb-6 text-espresso">Apprendre l’histoire avec plus de méthode.</h1>
                <p className="max-w-xl text-base sm:text-lg leading-relaxed text-stone mb-8">Des exercices ciblés, une rétroaction claire et un parcours qui t’aide à comprendre ce que tu sais déjà — et ce que tu peux pratiquer ensuite.</p>
                <div className="flex flex-col sm:flex-row gap-3">
                  <button onClick={ouvrirAccueilEleve} className="inline-flex justify-center items-center gap-2 bg-espresso text-white hover:bg-espresso/90 rounded-xl px-5 py-3.5 text-sm font-extrabold text-center btn-press"><UserIcon className="h-4 w-4 shrink-0" /> Entrer dans mon espace élève <ArrowRight className="h-4 w-4 shrink-0" /></button>
                  <button onClick={ouvrirTarifs} className="inline-flex justify-center items-center gap-2 bg-sand text-espresso hover:bg-sand-soft border border-line rounded-xl px-5 py-3.5 text-sm font-extrabold text-center transition-colors">Voir les offres</button>
                </div>
              </div>
              <div className="rounded-[2rem] border border-line bg-sand-soft/60 p-7 sm:p-9 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-3 mb-10">
                    <span className="text-xs font-extrabold uppercase tracking-[0.16em] text-stone">Ton parcours</span>
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-line bg-white text-brand-red"><Compass className="h-4 w-4" /></span>
                  </div>
                  <p className="text-2xl sm:text-3xl font-display font-black tracking-tight text-espresso max-w-xs">Une pratique claire, une étape à la fois.</p>
                </div>
                <div className="mt-10 space-y-3">
                  {["Choisir une période", "Pratiquer une opération", "Comprendre sa rétroaction"].map((etape, index) => (
                    <div key={etape} className="flex items-center gap-3 rounded-xl border border-line bg-white px-4 py-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-espresso text-xs font-black text-white">{index + 1}</span>
                      <span className="text-sm font-bold text-espresso/85">{etape}</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>
            <div className="grid md:grid-cols-3 gap-4 my-8 slide-up">
              {[
                { title: "Des exercices ciblés", text: "Travaille les opérations attendues au secondaire." },
                { title: "Une rétroaction utile", text: "Comprends la logique derrière chaque correction." },
                { title: "Un suivi lisible", text: "Retrouve tes forces et les notions à revoir." },
              ].map((item) => (
                <div key={item.title} className="rounded-2xl border border-line bg-white p-5">
                  <span className="mb-8 block text-xs font-black text-brand-red">0{["Des exercices ciblés", "Une rétroaction utile", "Un suivi lisible"].indexOf(item.title) + 1}</span>
                  <h2 className="text-base font-black text-espresso">{item.title}</h2>
                  <p className="text-sm leading-relaxed text-stone mt-2">{item.text}</p>
                </div>
              ))}
            </div>
            <div className="flex items-end justify-between gap-4 mb-4"><div><p className="text-xs font-extrabold uppercase tracking-[0.16em] text-brand-red mb-1">Le parcours</p><h2 className="text-3xl font-display font-black tracking-tight text-espresso">Les matières qui arrivent ici</h2></div><button onClick={() => setPage('matieres')} className="inline-flex items-center gap-2 text-sm font-bold text-brand-red hover:text-brand-red-hover"><BookOpen className="h-4 w-4" /> Voir le parcours</button></div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 slide-up">
              {matieres.map(({ nom, court, description, icon: Icon, disponible }) => (
                  <button key={nom} onClick={disponible ? ouvrirAccueilEleve : undefined} disabled={!disponible} className={`group text-left rounded-[1.5rem] border border-line bg-white p-6 sm:p-7 min-h-[190px] transition-all duration-300 ${disponible ? "card-hover cursor-pointer" : "cursor-default opacity-75"}`}>
                  <span className="inline-flex bg-sand-soft text-brand-red rounded-xl p-3 mb-5"><Icon className="h-6 w-6" /></span>
                  <span className="block text-lg font-black text-espresso">{court}</span><span className="block text-sm text-stone mt-1 leading-relaxed max-w-2xl">{description}</span>
                  <span className={`inline-flex items-center gap-2 mt-5 text-xs font-extrabold ${disponible ? "text-brand-red group-hover:gap-3" : "text-stone"} transition-all`}>{disponible ? <>Ouvrir le parcours <ArrowRight className="h-3.5 w-3.5" /></> : "Bientôt disponible"}</span>
                </button>
              ))}
            </div>
            <section id="tarifs" className="mt-10 rounded-[2rem] border border-line bg-white p-6 sm:p-8 shadow-[0_24px_70px_-52px_rgba(0,0,0,0.65)]">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-6">
                <div>
                  <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-brand-red mb-2">Tarifs</p>
                  <h2 className="text-3xl font-display font-black tracking-tight text-espresso">Commence avec 7 jours gratuits.</h2>
                  <p className="text-sm text-stone mt-2 max-w-xl">Choisis l’accès qui correspond à ton parcours. Tu peux commencer avec une seule matière et élargir ton accès plus tard.</p>
                </div>
                <span className="inline-flex w-fit rounded-full bg-brand-pine-soft px-3 py-1.5 text-xs font-extrabold text-brand-pine">Sans engagement pendant l’essai</span>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <article className="rounded-2xl border border-line bg-sand p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div><h3 className="text-lg font-black text-espresso">Une matière</h3><p className="text-sm text-stone mt-1">Pour pratiquer l’Histoire du Québec et du Canada.</p></div>
                    <strong className="text-2xl font-black text-brand-navy">9,99 $<span className="text-xs font-bold text-stone">/mois</span></strong>
                  </div>
                  <button type="button" onClick={() => setPage('compte')} className="mt-6 w-full rounded-xl bg-brand-navy px-4 py-3 text-sm font-extrabold text-white hover:opacity-90">Commencer l’essai de 7 jours</button>
                </article>
                <article className="rounded-2xl border-2 border-espresso/15 bg-white p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div><h3 className="text-lg font-black text-espresso">Tout inclus</h3><p className="text-sm text-stone mt-1">Tous les parcours et toutes les matières disponibles.</p></div>
                    <strong className="text-2xl font-black text-brand-red">35 $<span className="text-xs font-bold text-stone">/mois</span></strong>
                  </div>
                  <button type="button" onClick={() => setPage('compte')} className="mt-6 w-full rounded-xl bg-brand-red px-4 py-3 text-sm font-extrabold text-white hover:bg-brand-red-hover">Choisir tout inclus</button>
                </article>
              </div>
              <p className="mt-4 text-xs text-stone">Le paiement sera traité par Stripe au moment de l’activation. Les accès pédagogiques restent liés au plan actif.</p>
            </section>
          </>
        )}

        {page === 'matieres' && (
          <section>
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-brand-red mb-2">Les matières</p><h1 className="text-3xl sm:text-5xl font-display font-black tracking-tight mb-3 text-espresso">Pratique les compétences attendues en classe.</h1><p className="text-stone max-w-2xl mb-8">Histoire est disponible maintenant. Les parcours de mathématiques, sciences et français seront ajoutés progressivement.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">{matieres.map(({ nom, description, icon: Icon, disponible }) => <button key={nom} onClick={disponible ? ouvrirAccueilEleve : undefined} disabled={!disponible} className={`text-left bg-white border border-line rounded-2xl p-6 transition-all ${disponible ? "shadow-sm hover:-translate-y-1 hover:shadow-lg hover:border-brand-red/30" : "cursor-default opacity-75"}`}><span className="inline-flex p-3 rounded-xl bg-sand-soft text-brand-red mb-6"><Icon className="h-6 w-6" /></span><h2 className="font-black text-xl mb-2">{nom}</h2><p className="text-sm text-stone leading-relaxed mb-5">{description}</p><span className={`inline-flex items-center gap-2 text-xs font-extrabold rounded-full px-3 py-1.5 ${disponible ? "text-brand-red-hover bg-brand-red-soft" : "text-stone bg-sand"}`}>{disponible ? <><BookOpen className="h-3.5 w-3.5" /> Ouvrir l’Histoire</> : "Bientôt disponible"}</span></button>)}</div>
          </section>
        )}

          {page === 'compte' && (
          <section className="max-w-xl mx-auto text-center bg-white rounded-3xl border border-line shadow-lg p-7 sm:p-10 fade-in slide-up">
            <span className="inline-flex p-4 bg-brand-red-soft text-brand-red-hover rounded-2xl mb-5"><Target className="h-8 w-8" /></span><p className="text-xs font-extrabold uppercase tracking-[0.16em] text-brand-red mb-2">Accès sécurisé</p><h1 className="text-3xl sm:text-4xl font-display font-black tracking-tight mb-3 text-espresso">Qui se connecte?</h1><p className="text-stone mb-8">Ton espace élève conserve ta progression. Les enseignants retrouvent leurs groupes et leurs résultats.</p>
            <div className="grid sm:grid-cols-3 gap-3"><button onClick={() => onChoisirRole('eleve')} className="rounded-2xl bg-brand-red hover:bg-brand-red-hover text-white py-4 px-2 text-sm font-extrabold transition-colors flex items-center justify-center gap-2"><UserIcon className="h-4 w-4" /> Espace élève</button><button onClick={() => onChoisirRole('enseignant')} className="rounded-2xl bg-sand-soft hover:bg-line text-espresso py-4 px-2 text-sm font-extrabold transition-colors flex items-center justify-center gap-2"><Shield className="h-4 w-4" /> Espace prof</button><button onClick={() => window.location.assign('/super-admin')} className="rounded-2xl bg-espresso hover:bg-espresso/90 text-white py-4 px-2 text-sm font-extrabold transition-colors flex items-center justify-center gap-2"><ShieldCheck className="h-4 w-4" /> Super Admin</button></div>
            <p className="mt-4 text-xs leading-relaxed text-stone">L’accès Super Admin est réservé aux comptes autorisés et sera vérifié côté serveur.</p>
          </section>
        )}

        {page === 'progression' && (
          <section className="max-w-4xl mx-auto">
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-brand-red mb-2">Progression</p>
            <h1 className="text-3xl sm:text-5xl font-display font-black tracking-tight mb-3 text-espresso">Un suivi qui te montre quoi faire ensuite.</h1>
            <p className="text-stone max-w-2xl mb-8">Connecte-toi pour retrouver tes forces, tes défis et les notions à pratiquer dans chaque matière.</p>
            <div className="grid md:grid-cols-3 gap-4 mb-6">
              <div className="bg-white border border-line rounded-2xl p-5 shadow-sm"><Activity className="h-6 w-6 text-brand-red mb-5" /><span className="block text-sm font-bold text-stone mb-1">Forces</span><strong className="block text-xl font-display">Ce que tu maîtrises</strong><p className="text-sm text-stone mt-2">Les compétences où ta méthode fonctionne déjà.</p></div>
              <div className="bg-white border border-line rounded-2xl p-5 shadow-sm"><Target className="h-6 w-6 text-brand-ochre mb-5" /><span className="block text-sm font-bold text-stone mb-1">Défis</span><strong className="block text-xl font-display">Ce qui mérite un détour</strong><p className="text-sm text-stone mt-2">Des exercices choisis selon tes résultats réels.</p></div>
              <div className="bg-white border border-line rounded-2xl p-5 shadow-sm"><Compass className="h-6 w-6 text-brand-pine mb-5" /><span className="block text-sm font-bold text-stone mb-1">Repères</span><strong className="block text-xl font-display">Ton chemin dans le temps</strong><p className="text-sm text-stone mt-2">Une vue par matière, module, notion et compétence.</p></div>
            </div>
            <div className="rounded-3xl bg-brand-navy text-white p-7 sm:p-9 shadow-xl shadow-brand-navy/20"><span className="text-xs uppercase tracking-[0.16em] font-extrabold text-brand-ochre-soft">Prêt à commencer?</span><h2 className="font-display text-3xl font-black mt-2 mb-3">Active ton espace élève.</h2><p className="text-white/75 max-w-xl mb-6">Ton compte te permet de sauvegarder tes réponses et de recevoir une rétroaction adaptée à ton parcours.</p><button onClick={() => onChoisirRole('eleve')} className="inline-flex items-center gap-2 bg-white text-brand-navy hover:bg-sand-soft rounded-xl px-5 py-3 font-extrabold btn-press">Accéder à mon compte <ArrowRight className="h-4 w-4" /></button></div>
          </section>
        )}
      </main>
      <nav className="home-bottom-nav" aria-label="Navigation principale">
        <div className="flex items-center justify-center gap-2">
          {([{ id: 'accueil', label: 'Accueil', icon: Home }, { id: 'matieres', label: 'Matières', icon: Compass }, { id: 'progression', label: 'Progression', icon: Activity }, { id: 'compte', label: 'Compte', icon: UserRound }] as const).map(({ id, label, icon: Icon }) => <button key={id} onClick={() => setPage(id)} className={`flex flex-col items-center gap-1 px-4 sm:px-5 py-2 text-[10px] font-bold rounded-full transition-all ${page === id ? "bg-sand text-espresso shadow-sm" : "text-espresso/55 hover:text-espresso hover:bg-sand"}`}><Icon className="h-5 w-5" /><span>{label}</span></button>)}
        </div>
      </nav>
      <FooterGlobale />
    </div>
  );
}

// --- 2. CONNEXION ÉLÈVE ---
function EcranConnexionEleve({ surRetour }: { surRetour: () => void }) {
  const [mode, setMode] = useState<'connexion' | 'creation'>('connexion');
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [nomEleve, setNomEleve] = useState('');
  const [codeEleve, setCodeEleve] = useState('');
  const [acceptePolitique, setAcceptePolitique] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function soumettre(e: React.FormEvent) {
    e.preventDefault(); setErreur(null); setEnCours(true);
    try {
      if (mode === 'connexion') {
        await signInWithEmailAndPassword(auth, email, motDePasse);
        preparerMotDePasseSupabase(email, motDePasse);
        return;
      }
      if (!acceptePolitique) { setErreur("Vous devez accepter la politique de confidentialité."); setEnCours(false); return; }
      
      const codeNettoye = codeEleve.trim().toUpperCase();
      const qGroupe = query(collection(db, 'groupes'), where('codes', 'array-contains', codeNettoye));
      const snapGroupe = await getDocs(qGroupe);
       if (snapGroupe.empty) { setErreur("Ce code n’est pas reconnu."); setEnCours(false); return; }
      const groupeDoc = snapGroupe.docs[0];
      const groupeData = groupeDoc.data() as any;
      if (groupeData.codesUtilises && groupeData.codesUtilises[codeNettoye]) { setErreur("Code déjà utilisé."); setEnCours(false); return; }
      const cred = await createUserWithEmailAndPassword(auth, email, motDePasse);
      await setDoc(doc(db, 'eleves', cred.user.uid), { uid: cred.user.uid, nom: nomEleve.trim(), email, codeUtilise: codeNettoye, groupeId: groupeDoc.id, dateInscription: serverTimestamp() });
      await updateDoc(doc(db, 'groupes', groupeDoc.id), { [`codesUtilises.${codeNettoye}`]: { nom: nomEleve.trim(), email, uid: cred.user.uid, date: serverTimestamp() } });
    } catch (err: any) { setErreur("Erreur d’authentification. Vérifie tes infos."); } finally { setEnCours(false); }
  }

  return (
    <div className="min-h-screen flex flex-col bg-sand">
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="bg-white rounded-[2rem] shadow-2xl shadow-brand-navy/10 border border-line/50 w-full max-w-md p-8 sm:p-10 fade-in slide-up">
          <div className="flex justify-between mb-6"><div className="text-brand-red font-bold text-lg flex items-center gap-2"><UserIcon className="h-5 w-5" /> Portail Élève</div><button onClick={surRetour} className="text-xs text-stone/70 underline">Retour</button></div>
          <div className="flex gap-1 mb-6 bg-sand-soft p-1 rounded-lg">
            <button type="button" onClick={() => setMode('connexion')} className={`flex-1 text-sm font-medium py-2 rounded-md ${mode === 'connexion' ? 'bg-white text-brand-red-hover shadow-sm' : 'text-stone'}`}>Se connecter</button>
            <button type="button" onClick={() => setMode('creation')} className={`flex-1 text-sm font-medium py-2 rounded-md ${mode === 'creation' ? 'bg-white text-brand-red-hover shadow-sm' : 'text-stone'}`}>Créer mon compte</button>
          </div>
          <form onSubmit={soumettre} className="space-y-4">
            {mode === 'creation' && (
              <>
                <div><label className="block text-sm font-medium text-espresso/90 mb-1">Code d’accès</label><input type="text" required value={codeEleve} onChange={(e) => setCodeEleve(e.target.value)} className="w-full px-4 py-2 border border-line rounded-lg text-sm uppercase font-mono" placeholder="Ex: ANJ-GRP-01" /></div>
                <div><label className="block text-sm font-medium text-espresso/90 mb-1">Prénom et Nom</label><input type="text" required value={nomEleve} onChange={(e) => setNomEleve(e.target.value)} className="w-full px-4 py-2 border border-line rounded-lg text-sm" placeholder="Ex: Jean Tremblay" /></div>
              </>
            )}
            <div><label className="block text-sm font-medium text-espresso/90 mb-1">Courriel</label><input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-4 py-2 border border-line rounded-lg text-sm" /></div>
            <div><label className="block text-sm font-medium text-espresso/90 mb-1">Mot de passe</label><input type="password" autoComplete={mode === 'connexion' ? 'current-password' : 'new-password'} required minLength={6} value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} className="w-full px-4 py-2 border border-line rounded-lg text-sm" /></div>
            
            {mode === 'creation' && (
              <div className="mt-4 p-3 bg-sand border border-line rounded-lg">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" required checked={acceptePolitique} onChange={(e) => setAcceptePolitique(e.target.checked)} className="mt-1 h-4 w-4 text-brand-red rounded border-line focus:ring-brand-red" />
                  <span className="text-xs text-stone leading-snug">
                    En créant ce compte, vous consentez à ce que vos informations (nom, courriel, réponses aux exercices) soient enregistrées pour permettre la correction et le suivi pédagogique exclusif par votre enseignant. Aucune donnée personnelle n’est utilisée à des fins commerciales ni partagée à des tiers.
                  </span>
                </label>
              </div>
            )}

            {erreur && <div className="text-sm text-error-text bg-error-surface p-2 rounded-lg">{erreur}</div>}
            <button type="submit" disabled={enCours || (mode === 'creation' && !acceptePolitique)} className="w-full bg-brand-red hover:bg-brand-red-hover text-white py-3 rounded-xl text-sm font-bold btn-press disabled:opacity-50 disabled:cursor-not-allowed">{enCours ? '...' : (mode === 'connexion' ? 'Accéder à mes exercices' : 'Activer mon accès')}</button>
          </form>
        </div>
      </div>
      <FooterGlobale />
    </div>
  );
}

// --- 3. CONNEXION PROF ---
function EcranConnexionProf({ surRetour }: { surRetour: () => void }) {
  const [mode, setMode] = useState<'connexion' | 'creation'>('connexion');
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [codeProf, setCodeProf] = useState('');
  const [acceptePolitique, setAcceptePolitique] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function soumettre(e: React.FormEvent) {
    e.preventDefault(); setErreur(null); setEnCours(true);
    try {
      if (mode === 'connexion') {
        await signInWithEmailAndPassword(auth, email, motDePasse);
        preparerMotDePasseSupabase(email, motDePasse);
        return;
      }
      if (!acceptePolitique) { setErreur("Vous devez accepter la politique de confidentialité."); setEnCours(false); return; }

      const codeNettoye = codeProf.trim().toUpperCase();
      const qEcole = query(collection(db, 'codes_ecole'), where('codesProfs', 'array-contains', codeNettoye));
      const snapEcole = await getDocs(qEcole);
      if (snapEcole.empty) { setErreur("Code enseignant non reconnu."); setEnCours(false); return; }
      const ecoleDoc = snapEcole.docs[0];
      const ecoleData = ecoleDoc.data() as any;
      if (ecoleData.codesProfsUtilises && ecoleData.codesProfsUtilises[codeNettoye]) { setErreur("Code déjà utilisé."); setEnCours(false); return; }
      const cred = await createUserWithEmailAndPassword(auth, email, motDePasse);
      await setDoc(doc(db, 'profs', cred.user.uid), { uid: cred.user.uid, email, codeUtilise: codeNettoye, ecoleId: ecoleDoc.id, dateInscription: serverTimestamp() });
      await updateDoc(doc(db, 'codes_ecole', ecoleDoc.id), { [`codesProfsUtilises.${codeNettoye}`]: { email, uid: cred.user.uid, date: serverTimestamp() } });
    } catch (err: any) { setErreur("Erreur d’authentification."); } finally { setEnCours(false); }
  }

  return (
    <div className="min-h-screen flex flex-col bg-sand">
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="bg-white rounded-[2rem] shadow-2xl shadow-brand-navy/10 border border-line/50 w-full max-w-md p-8 sm:p-10 fade-in slide-up">
          <div className="flex justify-between mb-6"><div className="text-brand-red font-bold text-lg flex items-center gap-2"><Shield className="h-5 w-5" /> Portail Enseignant</div><button onClick={surRetour} className="text-xs text-stone/70 underline">Retour</button></div>
          <div className="flex gap-1 mb-6 bg-sand-soft p-1 rounded-lg">
            <button type="button" onClick={() => setMode('connexion')} className={`flex-1 text-sm font-medium py-2 rounded-md ${mode === 'connexion' ? 'bg-white text-brand-red-hover shadow-sm' : 'text-stone'}`}>Se connecter</button>
            <button type="button" onClick={() => setMode('creation')} className={`flex-1 text-sm font-medium py-2 rounded-md ${mode === 'creation' ? 'bg-white text-brand-red-hover shadow-sm' : 'text-stone'}`}>Activer mon code</button>
          </div>
          <form onSubmit={soumettre} className="space-y-4">
            {mode === 'creation' && (
              <div><label className="block text-sm font-medium text-espresso/90 mb-1">Code enseignant</label><input type="text" required value={codeProf} onChange={(e) => setCodeProf(e.target.value)} className="w-full px-4 py-2 border border-line rounded-lg text-sm uppercase font-mono" placeholder="Ex: STX-PROF-01" /></div>
            )}
            <div><label className="block text-sm font-medium text-espresso/90 mb-1">Courriel</label><input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-4 py-2 border border-line rounded-lg text-sm" /></div>
            <div><label className="block text-sm font-medium text-espresso/90 mb-1">Mot de passe</label><input type="password" autoComplete={mode === 'connexion' ? 'current-password' : 'new-password'} required minLength={6} value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} className="w-full px-4 py-2 border border-line rounded-lg text-sm" /></div>
            
            {mode === 'creation' && (
              <div className="mt-4 p-3 bg-sand border border-line rounded-lg">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" required checked={acceptePolitique} onChange={(e) => setAcceptePolitique(e.target.checked)} className="mt-1 h-4 w-4 text-brand-red rounded border-line focus:ring-brand-red" />
                  <span className="text-xs text-stone leading-snug">
                    En créant ce compte, vous acceptez la création d’un espace d’enseignement et le traitement des données nécessaires au suivi pédagogique de vos groupes. Aucune donnée n’est partagée à des tiers.
                  </span>
                </label>
              </div>
            )}

            {erreur && <div className="text-sm text-error-text bg-error-surface p-2 rounded-lg">{erreur}</div>}
            <button type="submit" disabled={enCours || (mode === 'creation' && !acceptePolitique)} className="w-full bg-brand-red hover:bg-brand-red-hover text-white py-3 rounded-xl text-sm font-bold btn-press disabled:opacity-50 disabled:cursor-not-allowed">{enCours ? '...' : (mode === 'connexion' ? 'Se connecter' : 'Activer mon compte')}</button>
          </form>
        </div>
      </div>
      <FooterGlobale />
    </div>
  );
}

// --- 4. REDIRECTION ÉLÈVE ---
function RedirectionEleve({ user, surDeconnexion }: { user: User; surDeconnexion: () => void }) {
  const [erreur, setErreur] = useState<string | null>(null);
  const [profil, setProfil] = useState<{ nom: string; codeUtilise: string } | null>(null);

  useEffect(() => {
    async function preparerRedirection() {
      try {
        const snap = await getDoc(doc(db, 'eleves', user.uid));
        if (snap.exists()) {
          const data = snap.data();
          setProfil({ nom: data.nom, codeUtilise: data.codeUtilise });
        } else { setErreur("Profil introuvable."); }
      } catch (err) { setErreur("Erreur de redirection."); }
    }
    preparerRedirection();
  }, [user]);

  if (profil) {
    const params = new URLSearchParams({ nom: profil.nom, code: profil.codeUtilise });
    window.history.replaceState(null, '', `/?${params.toString()}`);
    return (
      <Suspense fallback={<div className="min-h-screen bg-sand flex items-center justify-center text-stone">Chargement de l’espace élève...</div>}>
        <HistoireApp />
      </Suspense>
    );
  }

  return (
    <div className="min-h-screen bg-sand flex items-center justify-center p-4 text-center">
      <div className="bg-white rounded-2xl shadow-sm border border-line p-10 max-w-md w-full">
        {erreur ? (
          <><div className="inline-flex p-4 bg-error-surface text-error-text rounded-xl mb-4"><AlertCircle className="h-8 w-8" /></div><h1 className="text-xl font-bold mb-2">Oups !</h1><p className="text-sm mb-6">{erreur}</p><button onClick={surDeconnexion} className="bg-line px-6 py-2 rounded-lg text-sm">Déconnexion</button></>
        ) : (
          <><div className="inline-flex p-4 bg-brand-red-soft text-brand-red rounded-xl mb-4"><Loader2 className="h-8 w-8 animate-spin" /></div><h1 className="text-xl font-bold mb-2">Chargement de l’espace élève...</h1></>
        )}
      </div>
    </div>
  );
}

// --- 5. ADMIN DASHBOARD (AVEC DRILL-DOWN & RESPONSIVE) ---
function DashboardAdmin({ surDeconnexion, onImpersonate }: { surDeconnexion: () => void; onImpersonate: (uid: string, email: string) => void }) {
  const [vueCourante, setVueCourante] = useState<'ecoles' | 'profs' | 'groupes' | 'eleves' | 'resultats' | 'stats'>('ecoles');
  const [menuOuvert, setMenuOuvert] = useState(false);
  
  const [ecoleActive, setEcoleActive] = useState<Ecole | null>(null);
  const [profActif, setProfActif] = useState<ProfProfil | null>(null);
  const [groupeActif, setGroupeActif] = useState<Groupe | null>(null);
  const [eleveActif, setEleveActif] = useState<{nom: string, code: string, email?: string} | null>(null);

  const [ecoles, setEcoles] = useState<Ecole[]>([]);
  const [profs, setProfs] = useState<ProfProfil[]>([]);
  const [groupesAdmin, setGroupesAdmin] = useState<Groupe[]>([]);
  const [resultatsGlobaux, setResultatsGlobaux] = useState<any[]>([]);

  const [nomEcole, setNomEcole] = useState('');
  const [prefixe, setPrefixe] = useState('');
  const [nbProfs, setNbProfs] = useState<number>(10);
  const [showCreationModal, setShowCreationModal] = useState(false);
  const [modalCodesEcole, setModalCodesEcole] = useState<Ecole | null>(null);
  const [showDirectionModal, setShowDirectionModal] = useState(false);
  const [directionEcoleId, setDirectionEcoleId] = useState('');
  const [directionEmail, setDirectionEmail] = useState('');
  const [directionPassword, setDirectionPassword] = useState('');
  const [directionBusy, setDirectionBusy] = useState(false);
  const [directionError, setDirectionError] = useState('');

  async function chargerDonnees() {
    const snapEcoles = await getDocs(collection(db, 'codes_ecole'));
    const snapGroupes = await getDocs(collection(db, 'groupes'));
    const snapProfs = await getDocs(collection(db, 'profs'));
    const snapRes = await getDocs(collection(db, 'resultats_eleves'));
    
    const profsList = snapProfs.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
    const groupesList = snapGroupes.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
    
    setProfs(profsList);
    setGroupesAdmin(groupesList);
    setResultatsGlobaux(snapRes.docs.map(d => ({ id: d.id, ...(d.data() as any) })));

    setEcoles(snapEcoles.docs.map(d => {
      const e = { id: d.id, ...(d.data() as any) };
      const grps = groupesList.filter(g => (g.prefixeBase || '').startsWith(`${e.prefixe}-`));
      return { ...e, nbGroupes: grps.length };
    }));
  }

  useEffect(() => { chargerDonnees(); }, []);

  async function ajouterEcole(e: React.FormEvent) {
    e.preventDefault(); 
    if (!nomEcole.trim() || prefixe.length !== 3) return;
    await addDoc(collection(db, 'codes_ecole'), { nom: nomEcole.trim(), prefixe: prefixe.toUpperCase(), codesProfs: genererCodesProfs(prefixe.toUpperCase(), nbProfs) });
    setNomEcole(''); setPrefixe(''); setNbProfs(10); setShowCreationModal(false); chargerDonnees();
  }

  async function creerAccesDirection(e: React.FormEvent) {
    e.preventDefault();
    const ecole = ecoles.find((item) => item.id === directionEcoleId);
    if (!ecole || directionPassword.length < 8) return;
    setDirectionBusy(true); setDirectionError('');
    try {
      const provisioningApp = initializeApp(firebaseConfig, `direction-provision-${Date.now()}`);
      const provisioningAuth = getAuth(provisioningApp);
      const credential = await createUserWithEmailAndPassword(provisioningAuth, directionEmail.trim(), directionPassword);
      await setDoc(doc(db, 'admins_ecole', credential.user.uid), {
        uid: credential.user.uid, email: directionEmail.trim(), role: 'adminEcole',
        ecoleId: ecole.id, ecoleNom: ecole.nom, createdBy: 'superadmin', dateCreation: serverTimestamp()
      });
      await signOut(provisioningAuth);
      setDirectionEmail(''); setDirectionPassword(''); setDirectionEcoleId('');
      setShowDirectionModal(false);
    } catch (error: any) {
      setDirectionError(error?.code === 'auth/email-already-in-use' ? 'Cette adresse possède déjà un compte.' : 'Impossible de créer cet accès. Vérifiez les informations.');
    } finally { setDirectionBusy(false); }
  }

  const navVersEcoles = () => { setVueCourante('ecoles'); setEcoleActive(null); setProfActif(null); setGroupeActif(null); setEleveActif(null); setMenuOuvert(false); };
  const navVersStats = () => { setVueCourante('stats'); setMenuOuvert(false); };
  const navVersProfs = (ecole: Ecole) => { setEcoleActive(ecole); setVueCourante('profs'); setProfActif(null); setGroupeActif(null); setEleveActif(null); };
  const navVersGroupes = (prof: ProfProfil) => { setProfActif(prof); setVueCourante('groupes'); setGroupeActif(null); setEleveActif(null); };
  const navVersEleves = (groupe: Groupe) => { setGroupeActif(groupe); setVueCourante('eleves'); setEleveActif(null); };
  const navVersResultats = (eleve: {nom: string, code: string, email?: string}) => { setEleveActif(eleve); setVueCourante('resultats'); };

  const profsFiltres = profs.filter(p => p.ecoleId === ecoleActive?.id);
  const groupesFiltres = groupesAdmin.filter(g => g.profId === profActif?.uid);
  const resultatsEleve = resultatsGlobaux.filter(r => r.codeUtilise === eleveActif?.code && r.eleve === eleveActif?.nom).sort((a,b) => (b.horodatage?.seconds || 0) - (a.horodatage?.seconds || 0));

  return (
    <div className="flex flex-col md:flex-row h-screen bg-sand text-espresso font-sans overflow-hidden">
      <aside className="w-full md:w-64 bg-espresso text-white flex flex-col shrink-0 border-b md:border-b-0 md:border-r border-white/10 z-20">
        <div className="p-4 md:p-6 flex justify-between items-center">
          <h1 className="text-xl font-bold flex items-center gap-2"><Shield className="text-brand-red"/> Super Admin</h1>
          <button className="md:hidden p-2 rounded hover:bg-white/10" onClick={() => setMenuOuvert(!menuOuvert)}><Menu className="h-6 w-6" /></button>
        </div>
        <nav className={`flex-1 p-4 space-y-2 ${menuOuvert ? 'block' : 'hidden md:block'} overflow-y-auto`}>
          <button onClick={navVersEcoles} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${vueCourante !== 'stats' ? 'bg-brand-red text-white shadow-sm' : 'text-stone/70 hover:bg-white/10 hover:text-white'}`}><Building className="h-5 w-5"/> Établissements</button>
          <button onClick={navVersStats} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${vueCourante === 'stats' ? 'bg-brand-red text-white shadow-sm' : 'text-stone/70 hover:bg-white/10 hover:text-white'}`}><Activity className="h-5 w-5"/> Vue globale</button>
          <div className="pt-6">
            <button onClick={surDeconnexion} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-stone/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors"><LogOut className="h-5 w-5"/> Déconnexion</button>
          </div>
        </nav>
      </aside>
      
      <main className="flex-1 flex flex-col h-full overflow-hidden relative">
        <header className="bg-white border-b border-line px-4 md:px-8 py-4 md:py-5 shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs md:text-sm font-medium text-stone overflow-x-auto whitespace-nowrap hide-scrollbar">
            {vueCourante === 'stats' ? (
              <span className="font-bold text-espresso">Toutes les statistiques</span>
            ) : (
              <>
                <button onClick={navVersEcoles} className="hover:text-brand-red flex items-center gap-1"><Building className="h-4 w-4 hidden md:inline-block"/> Écoles</button>
                {ecoleActive && <><ChevronRight className="h-4 w-4 text-stone shrink-0"/><button onClick={() => navVersProfs(ecoleActive)} className="hover:text-brand-red truncate max-w-[120px] md:max-w-[150px]">{ecoleActive.nom}</button></>}
                {profActif && <><ChevronRight className="h-4 w-4 text-stone shrink-0"/><button onClick={() => navVersGroupes(profActif)} className="hover:text-brand-red truncate max-w-[120px] md:max-w-[200px]">{profActif.email}</button></>}
                {groupeActif && <><ChevronRight className="h-4 w-4 text-stone shrink-0"/><button onClick={() => navVersEleves(groupeActif)} className="hover:text-brand-red truncate max-w-[120px] md:max-w-[150px]">{groupeActif.nom}</button></>}
                {eleveActif && <><ChevronRight className="h-4 w-4 text-stone shrink-0"/><span className="text-espresso font-bold truncate max-w-[120px] md:max-w-[150px]">{eleveActif.nom}</span></>}
              </>
            )}
          </div>
          {vueCourante === 'ecoles' && (
            <div className="flex items-center gap-2">
              <button onClick={() => { setDirectionError(''); setShowDirectionModal(true); }} className="flex items-center gap-1 md:gap-2 border border-brand-red text-brand-red hover:bg-brand-red-soft px-3 md:px-4 py-2 rounded-lg text-xs md:text-sm font-medium shrink-0"><UserPlus className="h-4 w-4"/> <span className="hidden md:inline">Accès direction</span></button>
              <button onClick={() => setShowCreationModal(true)} className="flex items-center gap-1 md:gap-2 bg-brand-red hover:bg-brand-red-hover text-white px-3 md:px-4 py-2 rounded-lg text-xs md:text-sm font-medium shadow-sm shrink-0"><PlusCircle className="h-4 w-4"/> <span className="hidden md:inline">Nouvelle école</span></button>
            </div>
          )}
        </header>

        <div className="flex-1 overflow-auto p-4 md:p-8 bg-sand pb-20">
          
          {vueCourante === 'ecoles' && (
            <div className="bg-white border border-line rounded-xl shadow-sm overflow-x-auto">
              <table className="w-full text-left text-sm min-w-[600px]">
                <thead className="bg-sand text-stone text-xs uppercase"><tr><th className="px-6 py-4">Établissement</th><th className="px-6 py-4">Préfixe</th><th className="px-6 py-4 text-center">Groupes</th><th className="px-6 py-4 text-right">Codes / Action</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {ecoles.map(e => (
                    <tr key={e.id} className="hover:bg-sand transition-colors">
                      <td className="px-6 py-4 font-bold text-espresso">{e.nom}</td>
                      <td className="px-6 py-4 font-mono text-brand-red bg-brand-red-soft inline-block mt-3 ml-6 px-2 py-0.5 rounded">{e.prefixe}</td>
                      <td className="px-6 py-4 text-center text-stone font-medium">{e.nbGroupes}</td>
                      <td className="px-6 py-4 text-right">
                         <div className="flex justify-end items-center gap-4">
                           <button onClick={() => setModalCodesEcole(e)} className="text-xs font-medium text-stone hover:text-espresso underline">{Object.keys(e.codesProfsUtilises || {}).length}/{e.codesProfs?.length} activés</button>
                           <button onClick={() => navVersProfs(e)} className="bg-white border border-line hover:border-brand-red/30 hover:text-brand-red px-3 md:px-4 py-2 rounded-lg font-medium shadow-sm transition-all flex items-center gap-2">Profs <ArrowRight className="h-4 w-4 hidden md:block"/></button>
                         </div>
                      </td>
                    </tr>
                  ))}
                  {ecoles.length === 0 && <tr><td colSpan={4} className="text-center py-10 text-stone">Aucune école. Créez-en une pour commencer.</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {vueCourante === 'stats' && (
            <div>
              <h2 className="text-xl font-bold mb-6 text-espresso flex items-center gap-2"><Activity className="h-6 w-6 text-brand-red"/> Toutes les statistiques</h2>
              <div className="bg-white border border-line rounded-xl shadow-sm overflow-hidden overflow-x-auto">
                <table className="w-full text-left text-sm min-w-[800px]">
                  <thead className="bg-sand text-stone text-xs uppercase">
                    <tr>
                      <th className="px-4 py-3 border-b">Date</th>
                      <th className="px-4 py-3 border-b">Élève</th>
                      <th className="px-4 py-3 border-b">Code d’accès</th>
                      <th className="px-4 py-3 border-b">Opération évaluée</th>
                      <th className="px-4 py-3 border-b">Résultat</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {resultatsGlobaux.sort((a,b) => (b.horodatage?.seconds || 0) - (a.horodatage?.seconds || 0)).map((r, i) => (
                      <tr key={i} className="hover:bg-sand transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap text-stone">{r.horodatage?.seconds ? new Date(r.horodatage.seconds * 1000).toLocaleString('fr-CA', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit' }) : '-'}</td>
                        <td className="px-4 py-3 font-medium text-espresso">{r.eleve}</td>
                        <td className="px-4 py-3 font-mono text-xs text-brand-red">{r.codeUtilise}</td>
                        <td className="px-4 py-3 text-espresso/90">{r.operation}</td>
                        <td className="px-4 py-3 font-bold">{r.resultat}</td>
                      </tr>
                    ))}
                    {resultatsGlobaux.length === 0 && <tr><td colSpan={5} className="text-center py-10 text-stone">Aucun résultat enregistré globalement.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {vueCourante === 'profs' && ecoleActive && (
            <div>
              <h2 className="text-xl font-bold mb-6 text-espresso flex items-center gap-2"><Users className="h-6 w-6 text-brand-red"/> Professeurs ({ecoleActive.nom})</h2>
              <div className="bg-white border border-line rounded-xl shadow-sm overflow-x-auto">
                <table className="w-full text-left text-sm min-w-[600px]">
                  <thead className="bg-sand text-stone text-xs uppercase"><tr><th className="px-6 py-4">Courriel</th><th className="px-6 py-4">Code d’activation</th><th className="px-6 py-4 text-right">Actions</th></tr></thead>
                  <tbody className="divide-y divide-line">
                    {profsFiltres.map(p => {
                      const nbGroupesDuProf = groupesAdmin.filter(g => g.profId === p.uid).length;
                      return (
                        <tr key={p.id} className="hover:bg-sand transition-colors">
                          <td className="px-6 py-4 font-medium text-espresso">{p.email}</td>
                          <td className="px-6 py-4 font-mono text-stone">{p.codeUtilise}</td>
                          <td className="px-6 py-4 text-right">
                             <div className="flex justify-end items-center gap-3">
                               <button onClick={() => onImpersonate(p.uid, p.email)} className="text-xs font-medium text-brand-red bg-brand-red-soft px-3 py-1.5 rounded hover:bg-brand-red-soft flex items-center gap-1"><Eye className="h-3 w-3"/> Voir comme</button>
                               <button onClick={() => navVersGroupes(p)} className="bg-white border border-line hover:border-brand-red/30 hover:text-brand-red px-3 md:px-4 py-2 rounded-lg font-medium shadow-sm transition-all flex items-center gap-2">Groupes ({nbGroupesDuProf}) <ArrowRight className="h-4 w-4 hidden md:block"/></button>
                             </div>
                          </td>
                        </tr>
                      );
                    })}
                    {profsFiltres.length === 0 && <tr><td colSpan={3} className="text-center py-10 text-stone">Aucun professeur inscrit pour cette école.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {vueCourante === 'groupes' && profActif && (
            <div>
              <h2 className="text-xl font-bold mb-6 text-espresso flex items-center gap-2"><BookOpen className="h-6 w-6 text-brand-red"/> Groupes de {profActif.email}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {groupesFiltres.map(g => {
                  const nbUtilises = Object.keys(g.codesUtilises || {}).length;
                  const totalCodes = g.codes?.length || 0;
                  return (
                    <div key={g.id} className="bg-white border border-line rounded-xl p-6 shadow-sm flex flex-col h-full">
                      <h3 className="font-bold text-lg text-espresso mb-1">{g.nom}</h3>
                      <div className="text-sm font-mono text-stone mb-4">{g.prefixeBase}</div>
                      <div className="w-full bg-sand-soft rounded-full h-1.5 mb-2"><div className="bg-brand-red-soft h-1.5 rounded-full" style={{ width: `${totalCodes > 0 ? (nbUtilises / totalCodes) * 100 : 0}%` }}></div></div>
                      <div className="text-xs text-stone mb-6">{nbUtilises} élèves inscrits sur {totalCodes} codes</div>
                      <button onClick={() => navVersEleves(g)} className="mt-auto w-full bg-sand hover:bg-brand-red-soft text-brand-red border border-line hover:border-brand-red/30 py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2">Dossiers des élèves <ArrowRight className="h-4 w-4"/></button>
                    </div>
                  );
                })}
                {groupesFiltres.length === 0 && <div className="col-span-full text-center py-10 text-stone bg-white rounded-xl border border-line">Ce professeur n’a pas encore créé de groupe.</div>}
              </div>
            </div>
          )}

          {vueCourante === 'eleves' && groupeActif && (
            <div>
              <h2 className="text-xl font-bold mb-6 text-espresso flex items-center gap-2"><Users className="h-6 w-6 text-brand-red"/> Élèves inscrits ({groupeActif.nom})</h2>
              <div className="bg-white border border-line rounded-xl shadow-sm overflow-x-auto">
                <table className="w-full text-left text-sm min-w-[600px]">
                  <thead className="bg-sand text-stone text-xs uppercase"><tr><th className="px-6 py-4">Nom de l’élève</th><th className="px-6 py-4">Courriel</th><th className="px-6 py-4">Code d’accès</th><th className="px-6 py-4 text-center">Exercices</th><th className="px-6 py-4 text-right">Action</th></tr></thead>
                  <tbody className="divide-y divide-line">
                    {Object.entries(groupeActif.codesUtilises || {}).map(([code, eleveData]: any) => {
                       const nbResultats = resultatsGlobaux.filter(r => r.codeUtilise === code && r.eleve === eleveData.nom).length;
                       return (
                         <tr key={code} className="hover:bg-sand transition-colors">
                           <td className="px-6 py-4 font-bold text-espresso">{eleveData.nom}</td>
                           <td className="px-6 py-4 text-stone">{eleveData.email}</td>
                           <td className="px-6 py-4 font-mono text-stone/70">{code}</td>
                           <td className="px-6 py-4 text-center font-bold text-brand-red">{nbResultats}</td>
                           <td className="px-6 py-4 text-right">
                              <button onClick={() => navVersResultats({...eleveData, code})} className="bg-white border border-line hover:border-brand-red/30 hover:text-brand-red px-3 md:px-4 py-2 rounded-lg font-medium shadow-sm transition-all flex ml-auto items-center gap-2">Dossier <FileText className="h-4 w-4 hidden md:block"/></button>
                           </td>
                         </tr>
                       );
                    })}
                    {Object.keys(groupeActif.codesUtilises || {}).length === 0 && <tr><td colSpan={5} className="text-center py-10 text-stone">Aucun élève n’a encore activé son code dans ce groupe.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {vueCourante === 'resultats' && eleveActif && (
            <div>
              <h2 className="text-xl font-bold mb-2 text-espresso flex items-center gap-2"><FileText className="h-6 w-6 text-brand-red"/> Dossier complet de {eleveActif.nom}</h2>
              <p className="text-stone mb-6 font-mono text-sm">Code : {eleveActif.code}</p>
              {resultatsEleve.some((r: any) => r.sourceQuestion === 'reserve') && (
                <p className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                  <strong>{resultatsEleve.filter((r: any) => r.sourceQuestion === 'reserve').length} réponse(s) sur des questions de réserve.</strong>{' '}
                  La génération automatique avait échoué; l’élève a reçu un lot déjà validé, sans message d’erreur.
                </p>
              )}
              
              <div className="space-y-4">
                {resultatsEleve.map((r, i) => {
                  const isReussi = String(r.resultat).toLowerCase().includes('réussi') || r.note === '2/2' || r.note === '1/1';
                  const dateFormatee = r.horodatage?.seconds ? new Date(r.horodatage.seconds * 1000).toLocaleString('fr-CA', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit' }) : 'Date inconnue';
                  return (
                    <div key={i} className="bg-white border border-line rounded-xl shadow-sm overflow-hidden flex flex-col">
                      <div className={`p-4 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${isReussi ? 'bg-brand-pine-soft/50 border-brand-pine-soft' : 'bg-brand-navy-soft/50 border-brand-navy-soft'}`}>
                         <div>
                           <div className="flex items-center gap-2 mb-1">
                              <span className={`text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded ${isReussi ? 'bg-brand-pine-soft text-brand-pine' : 'bg-brand-navy-soft text-brand-navy'}`}>{r.section}</span>
                             <span className="text-sm font-bold text-espresso">{r.operation}</span>
                             {r.sourceQuestion === 'reserve' && <span className="text-xs font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-900">Question de réserve</span>}
                           </div>
                           <div className="text-xs text-stone">{dateFormatee}</div>
                         </div>
                         <div className="flex items-center gap-3">
                            <span className={`font-bold text-sm ${isReussi ? 'text-brand-pine' : 'text-brand-navy'}`}>{r.resultat}</span>
                           <span className="bg-white border border-line px-3 py-1 rounded-lg text-sm font-bold text-espresso/90 shadow-sm">{r.note}</span>
                         </div>
                      </div>
                      <div className="p-4 bg-white grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <div className="text-xs font-bold text-stone/70 uppercase mb-2">Question / Consigne</div>
                          {(r.periode || r.format) && <div className="flex flex-wrap gap-2 mb-2">{r.periode && <span className="text-[11px] font-semibold bg-brand-red-soft text-brand-red-hover px-2 py-1 rounded">{afficherDatesPeriode(r.periode, r.periodeId)}</span>}{r.format && <span className="text-[11px] font-semibold bg-sand-soft text-stone px-2 py-1 rounded">{r.format}</span>}</div>}
                          <p className="text-sm text-espresso/90 leading-relaxed italic border-l-2 border-line pl-3">{r.consigne}</p>
                        </div>
                        <div>
                          <div className="text-xs font-bold text-stone/70 uppercase mb-2">Réponse soumise</div>
                          <p className="text-sm text-espresso leading-relaxed font-medium bg-sand p-3 rounded-lg border border-line">{r.reponse}</p>
                        </div>
                      </div>
                      {(r.commentaire || r.diagnosticPlan || r.detailCorrection) && (
                        <div className="px-4 pb-4 bg-white">
                          <div className="border-t border-line pt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <div className="text-xs font-bold text-stone/70 uppercase mb-2">Rétroaction pédagogique</div>
                              <p className="text-sm text-espresso/90 leading-relaxed">{r.commentaire || r.detailCorrection?.commentaireGlobal || "Aucun commentaire."}</p>
                              {r.detailCorrection?.pointFort && <p className="text-sm text-brand-pine mt-2"><strong>Point fort :</strong> {r.detailCorrection.pointFort}</p>}
                              {r.detailCorrection?.elementATravailler && <p className="text-sm text-brand-navy mt-2"><strong>À travailler :</strong> {r.detailCorrection.elementATravailler}</p>}
                            </div>
                            <div>
                              {r.diagnosticPlan && <div className="rounded-lg border border-brand-navy-soft bg-brand-navy-soft p-3 text-sm text-brand-navy"><strong>Diagnostic du plan — hors note officielle</strong><p className="mt-1">{r.diagnosticPlan.note} : {r.diagnosticPlan.commentaire}</p></div>}
                              {Array.isArray(r.associationsDocuments) && r.associationsDocuments.length > 0 && <div className="rounded-lg border border-line bg-sand p-3 text-sm text-espresso/90"><strong>Analyse documentaire</strong><p className="mt-1">{r.associationsDocuments.length} élément(s) de réponse analysé(s), avec les documents pertinents et hors sujet.</p></div>}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                {resultatsEleve.length === 0 && <div className="text-center py-10 text-stone bg-white rounded-xl border border-line">L’élève n’a soumis aucune réponse pour le moment.</div>}
              </div>
            </div>
          )}

        </div>
        <FooterGlobale />
      </main>

      {/* MODALS ADMIN */}
      {showDirectionModal && (
        <div className="fixed inset-0 bg-espresso/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <div className="flex items-start justify-between mb-5"><div><span className="text-xs font-extrabold uppercase tracking-[.14em] text-brand-red">Super Admin seulement</span><h2 className="text-xl font-bold text-espresso">Accès initial d’une direction</h2></div><button type="button" onClick={() => setShowDirectionModal(false)} className="p-2 bg-sand-soft rounded-lg"><X className="h-5 w-5" /></button></div>
            <p className="text-sm text-stone mb-5">La direction recevra un compte autonome limité à l’école choisie. Elle pourra ensuite gérer son environnement scolaire.</p>
            <form onSubmit={creerAccesDirection} className="space-y-4">
              <div><label className="block text-sm font-medium mb-1">École</label><select required value={directionEcoleId} onChange={(event) => setDirectionEcoleId(event.target.value)} className="w-full border border-line p-2.5 rounded-lg bg-white"><option value="">Choisir une école</option>{ecoles.map((ecole) => <option key={ecole.id} value={ecole.id}>{ecole.nom}</option>)}</select></div>
              <div><label className="block text-sm font-medium mb-1">Courriel de la direction</label><input required type="email" value={directionEmail} onChange={(event) => setDirectionEmail(event.target.value)} className="w-full border border-line p-2.5 rounded-lg" /></div>
              <div><label className="block text-sm font-medium mb-1">Mot de passe temporaire</label><input required minLength={8} type="password" value={directionPassword} onChange={(event) => setDirectionPassword(event.target.value)} className="w-full border border-line p-2.5 rounded-lg" /><p className="text-xs text-stone mt-1">Au moins 8 caractères. La direction pourra le modifier depuis son compte.</p></div>
              {directionError && <p className="text-sm text-error-text bg-error-surface rounded-lg p-3">{directionError}</p>}
              <div className="flex justify-end gap-3 pt-2"><button type="button" onClick={() => setShowDirectionModal(false)} className="px-4 py-2 bg-sand-soft rounded-lg font-medium">Annuler</button><button type="submit" disabled={directionBusy || !directionEcoleId} className="px-4 py-2 bg-brand-red text-white rounded-lg font-medium disabled:opacity-50">{directionBusy ? 'Création…' : 'Créer l’accès'}</button></div>
            </form>
          </div>
        </div>
      )}

      {showCreationModal && (
        <div className="fixed inset-0 bg-espresso/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <h2 className="text-xl font-bold mb-4 text-espresso">Créer une école</h2>
            <form onSubmit={ajouterEcole} className="space-y-4">
              <div><label className="block text-sm font-medium text-espresso/90 mb-1">Nom / Commission Scolaire</label><input type="text" required value={nomEcole} onChange={e => setNomEcole(e.target.value)} className="w-full border border-line p-2.5 rounded-lg focus:ring-2 focus:ring-brand-red outline-none" /></div>
              <div className="flex gap-4">
                <div className="flex-1"><label className="block text-sm font-medium text-espresso/90 mb-1">Préfixe (3 lettres)</label><input type="text" required maxLength={3} minLength={3} value={prefixe} onChange={e => setPrefixe(e.target.value.toUpperCase())} className="w-full border border-line p-2.5 rounded-lg font-mono uppercase focus:ring-2 focus:ring-brand-red outline-none" placeholder="ABC" /></div>
                <div className="w-1/3"><label className="block text-sm font-medium text-espresso/90 mb-1">Nb Profs</label><input type="number" min="1" max="100" value={nbProfs} onChange={e => setNbProfs(Number(e.target.value))} className="w-full border border-line p-2.5 rounded-lg focus:ring-2 focus:ring-brand-red outline-none" /></div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setShowCreationModal(false)} className="px-4 py-2 bg-sand-soft text-espresso/90 hover:bg-line rounded-lg font-medium">Annuler</button>
                <button type="submit" className="px-4 py-2 bg-brand-red text-white hover:bg-brand-red-hover rounded-lg font-medium shadow-sm">Générer les codes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {modalCodesEcole && (
        <div className="fixed inset-0 bg-espresso/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-xl flex flex-col max-h-[80vh]">
            <div className="flex justify-between items-center mb-6 shrink-0">
              <div><h2 className="font-bold text-xl text-espresso">{modalCodesEcole.nom}</h2><p className="text-sm font-mono text-brand-red">{modalCodesEcole.prefixe}</p></div>
              <button onClick={() => setModalCodesEcole(null)} className="p-2 bg-sand-soft hover:bg-line text-stone rounded-lg transition-colors"><X className="h-5 w-5" /></button>
            </div>
            <div className="overflow-auto flex-1 space-y-2 pr-2">
              {(modalCodesEcole.codesProfs || []).map(c => {
                const utilise = modalCodesEcole.codesProfsUtilises?.[c];
                return (
                  <div key={c} className={`p-3 border rounded-lg flex justify-between items-center ${utilise ? 'bg-sand border-line' : 'bg-white border-line'}`}>
                    <span className={`font-mono text-sm ${utilise ? 'text-stone/70 line-through' : 'text-espresso/90 font-bold'}`}>{c}</span>
                    {utilise ? <span className="text-xs font-bold text-brand-pine bg-brand-pine-soft px-2 py-1 rounded">{utilise.email}</span> : <span className="text-xs font-bold text-stone/70 uppercase bg-sand-soft px-2 py-1 rounded">Libre</span>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DashboardAdminEcole({ user, surDeconnexion }: { user: User; surDeconnexion: () => void }) {
  const [ecole, setEcole] = useState<Ecole | null>(null);
  const [profs, setProfs] = useState<ProfProfil[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState("");
  const [codesAjoutes, setCodesAjoutes] = useState(5);
  const [generationEnCours, setGenerationEnCours] = useState(false);

  useEffect(() => {
    async function chargerEcole() {
      try {
        const profil = await getDoc(doc(db, "admins_ecole", user.uid));
        if (!profil.exists() || !profil.data().ecoleId) throw new Error("Profil d’administration scolaire introuvable.");
        const ecoleId = profil.data().ecoleId;
        const [ecoleSnap, profsSnap] = await Promise.all([
          getDoc(doc(db, "codes_ecole", ecoleId)),
          getDocs(query(collection(db, "profs"), where("ecoleId", "==", ecoleId)))
        ]);
        if (!ecoleSnap.exists()) throw new Error("École introuvable.");
        setEcole({ id: ecoleSnap.id, ...(ecoleSnap.data() as any) });
        setProfs(profsSnap.docs.map((item) => ({ id: item.id, ...(item.data() as any) })));
      } catch (error: any) {
        setErreur(error?.message || "Impossible de charger l’espace de l’école.");
      } finally {
        setChargement(false);
      }
    }
    chargerEcole();
  }, [user.uid]);

  async function genererCodesEnseignants() {
    if (!ecole || codesAjoutes < 1) return;
    setGenerationEnCours(true); setErreur("");
    try {
      const codesExistants = ecole.codesProfs || [];
      const codes = [...codesExistants];
      let numero = 1;
      while (codes.length < codesExistants.length + codesAjoutes) {
        const code = `${ecole.prefixe}-PROF-${String(numero).padStart(2, "0")}`;
        if (!codes.includes(code)) codes.push(code);
        numero++;
      }
      await updateDoc(doc(db, "codes_ecole", ecole.id), { codesProfs: codes });
      setEcole({ ...ecole, codesProfs: codes });
    } catch {
      setErreur("Les codes enseignants n’ont pas pu être générés.");
    } finally { setGenerationEnCours(false); }
  }

  return (
    <div className="min-h-screen bg-sand text-espresso">
      <header className="bg-white border-b border-line px-5 md:px-10 py-5 flex items-center justify-between">
        <div><span className="text-xs font-extrabold uppercase tracking-[.16em] text-brand-red">Administration scolaire</span><h1 className="text-2xl font-black">{ecole?.nom || "Mon école"}</h1></div>
        <button onClick={surDeconnexion} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-line text-sm font-bold hover:bg-sand-soft"><LogOut className="h-4 w-4" /> Déconnexion</button>
      </header>
      <main className="max-w-5xl mx-auto p-5 md:p-10">
        {chargement && <div className="flex items-center gap-3 text-stone"><Loader2 className="h-5 w-5 animate-spin" /> Chargement de l’école…</div>}
        {erreur && <div className="rounded-2xl border border-error-border bg-error-surface p-5 text-error-text">{erreur}</div>}
        {!chargement && !erreur && (
          <>
            <section className="grid sm:grid-cols-2 gap-4 mb-8">
              <div className="bg-white border border-line rounded-2xl p-6"><Building className="h-6 w-6 text-brand-red mb-4" /><span className="text-sm text-stone">École</span><strong className="block text-xl mt-1">{ecole?.nom}</strong></div>
              <div className="bg-white border border-line rounded-2xl p-6"><Users className="h-6 w-6 text-brand-red mb-4" /><span className="text-sm text-stone">Enseignants inscrits</span><strong className="block text-3xl mt-1">{profs.length}</strong></div>
            </section>
            <section className="bg-white border border-line rounded-2xl overflow-hidden">
              <div className="p-5 border-b border-line flex flex-col md:flex-row md:items-center md:justify-between gap-4"><div><h2 className="text-lg font-black">Équipe enseignante</h2><p className="text-sm text-stone">Cet espace ne donne accès qu’aux comptes rattachés à cette école.</p></div><div className="flex items-center gap-2"><input aria-label="Nombre de codes enseignants" type="number" min="1" max="50" value={codesAjoutes} onChange={(event) => setCodesAjoutes(Number(event.target.value))} className="w-16 border border-line rounded-lg px-2 py-2 text-sm" /><button type="button" onClick={genererCodesEnseignants} disabled={generationEnCours} className="inline-flex items-center gap-2 rounded-lg bg-brand-red px-3 py-2 text-sm font-bold text-white disabled:opacity-50"><Key className="h-4 w-4" /> {generationEnCours ? "Génération…" : "Générer des codes"}</button></div></div>
              {profs.length === 0 ? <p className="p-6 text-stone">Aucun enseignant inscrit.</p> : profs.map((prof) => <div key={prof.id} className="p-5 border-b last:border-b-0 border-line flex items-center gap-3"><Mail className="h-4 w-4 text-brand-red" /><span className="font-medium">{prof.email}</span></div>)}
              <div className="p-5 bg-sand-soft text-sm text-stone"><strong className="text-espresso">{(ecole?.codesProfs || []).length}</strong> codes enseignants disponibles au total. Les codes déjà utilisés restent associés à leur compte.</div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function CouverturePFEQProf({
  resultats,
  groupes,
  groupeFiltre,
  onFiltreChange,
}: {
  resultats: any[];
  groupes: Groupe[];
  groupeFiltre: string;
  onFiltreChange: (value: string) => void;
}) {
  const resultatsVisibles = filtrerResultatsPFEQParGroupe(resultats, groupes, groupeFiltre);
  const resultatsNonRattaches = filtrerResultatsPFEQNonRattaches(resultatsVisibles);
  const nombreResultatsNonRattaches = compterResultatsPFEQNonRattaches(resultatsVisibles);
  const resultatsDuNiveau = (niveau: 3 | 4) => filtrerResultatsPFEQParNiveau(resultatsVisibles, niveau);
  const groupeFiltreNom = groupeFiltre === "Tous"
    ? "Tous les groupes"
    : groupes.find((groupe) => groupe.id === groupeFiltre)?.nom || groupeFiltre;
  const [detailsNonRattachesOuverts, setDetailsNonRattachesOuverts] = useState(false);

  const exporterResultatsNonRattaches = () => {
    const lignes = resultatsNonRattaches.map((resultat) => {
      const groupe = groupePourCode(groupes, resultat?.codeUtilise);
      const eleve = String(resultat?.eleve || "").trim()
        || elevePourCode(groupe, resultat?.codeUtilise)?.nom
        || "Élève non précisé";
      return {
        groupe: groupe?.nom || "Groupe non précisé",
        eleve,
        date: formaterDateResultat(resultat?.horodatage || resultat?.date),
        operation: String(resultat?.operation || "Opération non précisée"),
        periodeDisponible: libellePeriodeHistorique(resultat),
      };
    });
    const suffixeGroupe = groupeFiltre === "Tous" ? "tous-groupes" : groupeFiltreNom
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase();
    telechargerCSV(
      `resultats-historiques-non-rattaches-${suffixeGroupe || "groupe"}.csv`,
      genererCSVResultatsPFEQNonRattaches(lignes),
    );
  };

  return (
    <>
      <header className="bg-white border-b border-line px-4 md:px-8 py-4 md:py-5 shrink-0 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-espresso">Couverture PFEQ</h1>
          <p className="text-sm text-stone mt-1">Les concepts sont comptés seulement lorsqu’une activité enregistrée porte ses balises officielles.</p>
        </div>
        <select
          value={groupeFiltre}
          onChange={(event) => onFiltreChange(event.target.value)}
          aria-label="Filtrer la couverture PFEQ par groupe"
          className="w-full md:w-auto border border-line px-4 py-2 rounded-lg text-sm font-medium focus:ring-2 focus:ring-brand-red bg-sand"
        >
          <option value="Tous">Tous les groupes</option>
          {groupes.map((groupe) => <option key={groupe.id} value={groupe.id}>{groupe.nom}</option>)}
        </select>
      </header>

      <div className="flex-1 overflow-auto p-4 md:p-8 pb-20">
        <div className="rounded-2xl border border-brand-navy/15 bg-brand-navy-soft/40 p-5 mb-6 flex gap-3 items-start">
          <BookOpen className="h-5 w-5 text-brand-navy shrink-0 mt-0.5" />
          <div className="text-sm text-stone leading-relaxed">
            <strong className="text-espresso">Lire cet indicateur avec prudence.</strong>{" "}
            La couverture décrit les balises PFEQ déclarées dans les résultats enregistrés. Une activité ancienne sans balises n’est pas transformée en couverture par déduction.
          </div>
        </div>
        {nombreResultatsNonRattaches > 0 && (
          <div role="status" className="rounded-2xl border border-amber-200 bg-amber-50 p-5 mb-6 flex gap-3 items-start text-amber-950">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5 text-amber-700" />
            <div className="text-sm leading-relaxed flex-1">
              <strong className="block">Résultats historiques non rattachés</strong>
              <span>
                {nombreResultatsNonRattaches} résultat{nombreResultatsNonRattaches !== 1 ? "s" : ""} reste{nombreResultatsNonRattaches !== 1 ? "nt" : ""} visible{nombreResultatsNonRattaches !== 1 ? "s" : ""} dans l’historique, mais sans période PFEQ reconnue.{" "}
                {nombreResultatsNonRattaches === 1 ? "Il n’entre" : "Ils n’entrent"} pas dans la couverture des secondaires 3 ou 4.
              </span>
              <button
                type="button"
                onClick={() => setDetailsNonRattachesOuverts(true)}
                className="mt-4 inline-flex items-center gap-2 rounded-lg border border-amber-700/30 bg-white px-3 py-2 text-xs font-extrabold text-amber-950 transition-colors hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-700/40"
              >
                <FileText className="h-4 w-4" />
                Consulter le détail
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {([3, 4] as const).map((niveau) => {
            const resultatsNiveau = resultatsDuNiveau(niveau);
            const audit = auditerCouverturePFEQ(resultatsNiveau, niveau);
            const nombreConcepts = audit.periodes.reduce((total, periode) => total + periode.conceptsCouverts.length, 0);
            const totalConcepts = audit.periodes.reduce((total, periode) => {
              const realite = PFEQ_REALITES.find((item) => item.id === periode.periodeId);
              return total + (realite?.concepts.length || 0);
            }, 0);
            const activitesBalisees = audit.periodes.reduce((total, periode) => total + periode.activitesAvecBalises, 0);
            const activitesSansBalises = audit.periodes.reduce((total, periode) => total + periode.activitesSansBalises, 0);
            const operationsCouverts = [...new Set(audit.periodes.flatMap((periode) => periode.operationsCouverts))];
            const operationsManquants = audit.periodes.length > 0
              ? audit.periodes[0].operationsManquants.filter((operation) => !operationsCouverts.includes(operation))
              : [];

            return (
              <section key={niveau} className="bg-white border border-line rounded-2xl shadow-sm overflow-hidden">
                <div className="p-5 md:p-6 border-b border-line bg-sand-soft">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <span className="text-xs uppercase tracking-[.14em] font-extrabold text-brand-red">Référentiel officiel</span>
                      <h2 className="text-xl font-black text-espresso mt-1">Secondaire {niveau}</h2>
                      <p className="text-sm text-stone mt-1">{resultatsNiveau.length} résultat{resultatsNiveau.length !== 1 ? "s" : ""} enregistré{resultatsNiveau.length !== 1 ? "s" : ""} dans ce parcours</p>
                    </div>
                    <div className={`shrink-0 rounded-xl px-3 py-2 text-right ${activitesBalisees > 0 ? "bg-brand-pine-soft text-brand-pine" : "bg-amber-50 text-amber-800"}`}>
                      {activitesBalisees > 0 ? (
                        <>
                          <strong className="block text-xl leading-none">{nombreConcepts}/{totalConcepts}</strong>
                          <span className="text-[11px] font-bold uppercase tracking-wide">concepts couverts</span>
                        </>
                      ) : (
                        <>
                          <strong className="block text-sm leading-tight">Données<br />insuffisantes</strong>
                          <span className="text-[11px] font-bold uppercase tracking-wide">balises absentes</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="mt-4 h-2 rounded-full bg-white overflow-hidden" aria-label={`${nombreConcepts} concepts couverts sur ${totalConcepts}`}>
                    <div className="h-full rounded-full bg-brand-pine transition-all" style={{ width: `${totalConcepts ? (nombreConcepts / totalConcepts) * 100 : 0}%` }} />
                  </div>
                  <p className="text-xs text-stone mt-2">
                    {activitesBalisees > 0
                       ? `${activitesBalisees} résultat${activitesBalisees !== 1 ? "s" : ""} avec balises PFEQ${activitesSansBalises > 0 ? ` · ${activitesSansBalisesLabel(activitesSansBalises)} exclus de l’audit` : ""}.`
                      : "Les résultats de ce niveau ne contiennent pas encore les balises PFEQ nécessaires pour mesurer la couverture."}
                  </p>
                  <div className="mt-4 border-t border-line pt-3">
                    <span className="text-xs font-bold uppercase tracking-wide text-brand-navy">Opérations intellectuelles observées</span>
                    <div className="flex flex-wrap gap-2 mt-2" aria-label={`${operationsCouverts.length} opérations PFEQ couvertes sur ${OPERATIONS_PFEQ.length}`}>
                      {operationsCouverts.length > 0
                        ? operationsCouverts.map((operation) => <span key={operation} className="rounded-full bg-brand-navy-soft px-2.5 py-1 text-xs font-semibold text-brand-navy">{operation}</span>)
                        : <span className="text-xs text-stone">Aucune opération balisée pour le moment.</span>}
                    </div>
                    {operationsManquants.length > 0 && <p className="text-xs text-stone mt-2">À pratiquer : {operationsManquants.join(" · ")}</p>}
                  </div>
                </div>

                <div className="p-4 md:p-6 space-y-4">
                  {audit.periodes.map((periode) => {
                    const realite = PFEQ_REALITES.find((item) => item.id === periode.periodeId);
                    if (!realite) return null;
                    return (
                      <article key={periode.periodeId} className="rounded-xl border border-line p-4">
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div>
                            <span className="text-xs font-bold text-brand-red">{realite.periode}</span>
                            <h3 className="font-bold text-espresso mt-0.5">{realite.titre}</h3>
                          </div>
                          <span className="text-xs font-bold text-stone whitespace-nowrap">{periode.activitesEnregistrees} activité{periode.activitesEnregistrees !== 1 ? "s" : ""}</span>
                        </div>
                        {periode.donneesInsuffisantes ? (
                          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
                            <strong className="block">Données insuffisantes</strong>
                            <span>{periode.activitesEnregistrees > 0 ? "Les activités enregistrées pour cette période n’ont pas de balises PFEQ complètes. Les notions couvertes et manquantes ne sont pas déduites." : "Aucun résultat balisé n’est enregistré pour cette période."}</span>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <div>
                              <span className="text-xs font-bold uppercase tracking-wide text-brand-pine">Concepts couverts</span>
                              <div className="flex flex-wrap gap-2 mt-2">
                                {periode.conceptsCouverts.map((concept) => <span key={concept} className="rounded-full bg-brand-pine-soft px-2.5 py-1 text-xs font-semibold text-brand-pine">{concept}</span>)}
                              </div>
                            </div>
                            <div>
                              <span className="text-xs font-bold uppercase tracking-wide text-brand-red">Encore à pratiquer</span>
                              <div className="flex flex-wrap gap-2 mt-2">
                                {periode.conceptsManquants.length > 0
                                  ? periode.conceptsManquants.map((concept) => <span key={concept} className="rounded-full bg-brand-red-soft px-2.5 py-1 text-xs font-semibold text-brand-red-hover">{concept}</span>)
                                  : <span className="text-sm text-brand-pine font-semibold">Les trois concepts sont couverts.</span>}
                              </div>
                            </div>
                            {periode.activitesSansBalises > 0 && <p className="text-xs text-stone border-t border-line pt-3">{periode.activitesSansBalises} ancienne{periode.activitesSansBalises !== 1 ? "s" : ""} activité{periode.activitesSansBalises !== 1 ? "s" : ""} sans balises exclue{periode.activitesSansBalises !== 1 ? "s" : ""} de cette mesure.</p>}
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      {detailsNonRattachesOuverts && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-espresso/80 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="details-resultats-non-rattaches"
        >
          <div className="flex max-h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-2xl">
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-line bg-sand p-5 md:p-6">
              <div>
                <span className="text-xs font-extrabold uppercase tracking-[.14em] text-brand-red">Historique conservé</span>
                <h2 id="details-resultats-non-rattaches" className="mt-1 text-xl font-black text-espresso md:text-2xl">Résultats historiques non rattachés</h2>
                <p className="mt-2 text-sm text-stone">
                  {nombreResultatsNonRattaches} résultat{nombreResultatsNonRattaches !== 1 ? "s" : ""} · {groupeFiltreNom}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={exporterResultatsNonRattaches}
                  className="inline-flex items-center gap-2 rounded-lg border border-brand-red/30 bg-white px-3 py-2 text-xs font-extrabold text-brand-red transition-colors hover:bg-brand-red-soft focus:outline-none focus:ring-2 focus:ring-brand-red/40"
                >
                  <Download className="h-4 w-4" />
                  Exporter le groupe
                </button>
                <button
                  type="button"
                  onClick={() => setDetailsNonRattachesOuverts(false)}
                  aria-label="Fermer le détail des résultats non rattachés"
                  className="shrink-0 rounded-lg border border-line bg-white p-2 text-stone transition-colors hover:bg-sand-soft hover:text-espresso"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4 md:p-6">
              <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-950">
                <strong>Aucun rattachement PFEQ n’est déduit ici.</strong>{" "}
                Le groupe, l’élève, la date, l’opération et le libellé de période sont repris tels qu’ils sont disponibles dans l’historique. L’export contient uniquement le groupe sélectionné.
              </div>
              <div className="overflow-x-auto rounded-xl border border-line">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="bg-sand text-xs uppercase text-stone">
                    <tr>
                      <th className="border-b border-line px-4 py-3 font-extrabold">Groupe</th>
                      <th className="border-b border-line px-4 py-3 font-extrabold">Élève</th>
                      <th className="border-b border-line px-4 py-3 font-extrabold">Date</th>
                      <th className="border-b border-line px-4 py-3 font-extrabold">Opération</th>
                      <th className="border-b border-line px-4 py-3 font-extrabold">Période disponible</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {resultatsNonRattaches.map((resultat, index) => {
                       const groupe = groupePourCode(groupes, resultat?.codeUtilise);
                      const eleve = String(resultat?.eleve || "").trim()
                         || elevePourCode(groupe, resultat?.codeUtilise)?.nom
                        || "Élève non précisé";
                      return (
                        <tr key={resultat?.id || `${resultat?.codeUtilise || "resultat"}-${index}`} className="align-top">
                          <td className="px-4 py-4 font-semibold text-espresso">{groupe?.nom || "Groupe non précisé"}</td>
                          <td className="px-4 py-4 text-espresso/90">{eleve}</td>
                          <td className="whitespace-nowrap px-4 py-4 text-stone">{formaterDateResultat(resultat?.horodatage || resultat?.date)}</td>
                          <td className="px-4 py-4 text-espresso/90">{String(resultat?.operation || "Opération non précisée")}</td>
                          <td className="px-4 py-4 text-stone">{libellePeriodeHistorique(resultat)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function activitesSansBalisesLabel(nombre: number) {
  return `${nombre} résultat${nombre !== 1 ? "s" : ""} sans balises`;
}

// --- 6. TABLEAU DE BORD PROFESSEUR ---
function DashboardProf({ user, surDeconnexion, modeImpersonation = false }: { user: User; surDeconnexion: () => void, modeImpersonation?: boolean }) {
  const [activeTab, setActiveTab] = useState<'groupes' | 'statistiques' | 'couverture'>('groupes');
  const [menuOuvert, setMenuOuvert] = useState(false);
  const [showCodeModal, setShowCodeModal] = useState(false);
  const [groupes, setGroupes] = useState<Groupe[]>([]);
  const [resultats, setResultats] = useState<any[]>([]);
  
  const [profEcolePrefixe, setProfEcolePrefixe] = useState('');
  const [isPrefixeEditable, setIsPrefixeEditable] = useState(false);
  
  const [nouveauGroupeNom, setNouveauGroupeNom] = useState('');
  const [prefixeGroupe, setPrefixeGroupe] = useState('');
  const [nbEleves, setNbEleves] = useState<number>(30);
  const [creationEnCours, setCreationEnCours] = useState(false);
  const [groupeDetail, setGroupeDetail] = useState<Groupe | null>(null);
  
  const [activeModalTab, setActiveModalTab] = useState<'periodes' | 'codes'>('periodes');
  const [groupeFiltre, setGroupeFiltre] = useState<string>('Tous');
  const [eleveBilanDetail, setEleveBilanDetail] = useState<{ nom: string, groupe: string, resultats: any[], bilan: string, loading: boolean } | null>(null);

  async function chargerDonnees() {
    const snapEcoles = await getDocs(collection(db, 'codes_ecole'));
    const ecolesData = snapEcoles.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

    const snapGroupes = await getDocs(query(collection(db, 'groupes'), where('profId', '==', user.uid)));
    const listeGroupes = snapGroupes.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    listeGroupes.sort((a, b) => (b.dateCreation?.seconds || 0) - (a.dateCreation?.seconds || 0));
    // Une période doit être explicitement activée par l'enseignant, y compris
    // pour les groupes créés avant l'ajout de ce réglage.
    const groupesMigres = listeGroupes.map(g => ({
      ...g,
      periodesDebloquees: Array.isArray(g.periodesDebloquees) ? g.periodesDebloquees : [],
    }));
    setGroupes(groupesMigres);

    let detectedPrefix = '';
    try {
      const profSnap = await getDoc(doc(db, 'profs', user.uid));
      if (profSnap.exists()) {
        const pData = profSnap.data();
        const monEcole = ecolesData.find((e: any) => e.id === pData.ecoleId);
        if (monEcole && monEcole.prefixe) {
          detectedPrefix = monEcole.prefixe;
        } else if (pData.codeUtilise) {
          detectedPrefix = pData.codeUtilise.split('-')[0];
        }
      }
    } catch(e) { console.error("Erreur détection", e); }

    if (!detectedPrefix && listeGroupes.length > 0) {
      const g = listeGroupes.find(gr => gr.prefixeBase);
      if (g) detectedPrefix = g.prefixeBase.split('-')[0];
    }

    if (detectedPrefix) {
      setProfEcolePrefixe(detectedPrefix);
      setIsPrefixeEditable(false);
    } else {
      setProfEcolePrefixe('');
      setIsPrefixeEditable(true);
    }

    const snapResultats = await getDocs(collection(db, 'resultats_eleves'));
    setResultats(snapResultats.docs.map(d => ({ id: d.id, ...d.data() })));
  }

  useEffect(() => { chargerDonnees(); }, []);

  const limiteGroupesAtteinte = groupes.length >= 6;

  async function creerGroupe() {
    if (limiteGroupesAtteinte || !nouveauGroupeNom.trim() || !profEcolePrefixe.trim() || !prefixeGroupe.trim()) return;
    setCreationEnCours(true);
    try {
      const g = prefixeGroupe.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      const base = `${profEcolePrefixe.toUpperCase()}-${g}`;
      const listeCodes = Array.from({length: nbEleves}, (_, i) => `${base}-${(i+1).toString().padStart(2, '0')}`);
      await addDoc(collection(db, 'groupes'), { 
        nom: nouveauGroupeNom.trim(), prefixeBase: base, codes: listeCodes, profId: user.uid, 
        dateCreation: serverTimestamp(), periodesDebloquees: []
      });
      setNouveauGroupeNom(''); setPrefixeGroupe(''); setShowCodeModal(false); chargerDonnees();
    } catch(err) {} finally { setCreationEnCours(false); }
  }

  async function togglePeriode(groupeId: string, periodeId: number, currentList: number[]) {
    let newList = [...currentList];
    if (newList.includes(periodeId)) {
      newList = newList.filter(id => id !== periodeId);
    } else { newList.push(periodeId); }
    newList.sort((a, b) => a - b);
    try {
      await updateDoc(doc(db, 'groupes', groupeId), { periodesDebloquees: newList });
      setGroupes(prev => prev.map(g => g.id === groupeId ? { ...g, periodesDebloquees: newList } : g));
      if (groupeDetail && groupeDetail.id === groupeId) setGroupeDetail({ ...groupeDetail, periodesDebloquees: newList });
    } catch (e) {}
  }

  const genererStatistiques = () => {
    let stats: any[] = [];
    groupes.forEach(g => {
      if (groupeFiltre !== 'Tous' && g.id !== groupeFiltre) return;
      Object.entries(g.codesUtilises || {}).forEach(([codeEleve, eleve]) => {
        const codeNormalise = normaliserCodeUtilise(codeEleve);
        const resEleve = resultats.filter((r) => normaliserCodeUtilise(r.codeUtilise) === codeNormalise);
        const nbTotal = resEleve.length;
        const nbReussis = resEleve.filter(r => r.resultat === 'Réussi' || r.note === '2/2' || r.note === '1/1' || String(r.resultat).includes('Réussi')).length;
        const taux = nbTotal > 0 ? Math.round((nbReussis / nbTotal) * 100) : 0;
        let couleur = "bg-error-border";
        if (taux >= 75) couleur = "bg-brand-pine"; else if (taux >= 50) couleur = "bg-brand-navy";
        stats.push({ nom: eleve.nom, groupe: g.nom, nbTotal, taux, couleur, resultatsEleve: resEleve });
      });
    });
    return stats.sort((a, b) => a.groupe.localeCompare(b.groupe) || a.nom.localeCompare(b.nom));
  };

  async function genererBilan(statEleve: any) {
    setEleveBilanDetail({ nom: statEleve.nom, groupe: statEleve.groupe, resultats: statEleve.resultatsEleve, bilan: "", loading: true });
    if (!statEleve.resultatsEleve || statEleve.resultatsEleve.length === 0) {
      setEleveBilanDetail(prev => prev ? {...prev, loading: false, bilan: "Cet élève n’a pas encore fait d’exercices."} : null);
      return;
    }
    const infos = statEleve.resultatsEleve.map((r: any) => `Opération: ${r.operation}, Période: ${r.periode || "non précisée"}, Note: ${r.note}, Verdict: ${r.resultat}, Point fort: ${r.detailCorrection?.pointFort || "non précisé"}, À travailler: ${r.detailCorrection?.elementATravailler || "non précisé"}`).join(" | ");
    const prompt = `Tu es un assistant pédagogique pour un enseignant d'histoire du Québec et du Canada. Voici l'historique récent de l'élève ${statEleve.nom} : ${infos}. Fais un bilan direct (3-4 phrases maximum) de ses forces et indique 1 ou 2 points précis à travailler. Sois encourageant. Pas de balises markdown.`;
    
    try {
      const resp = await callGenerationService('generer', { prompt });
      let texte = resp.text.replace(/```json/gi, "").replace(/```/g, "").trim();
      // Le service répond en JSON (ex. {"feedback": "…"}) : on garde le texte du bilan.
      try {
        const objet = JSON.parse(texte);
        const valeur = typeof objet === "string" ? objet : Object.values(objet ?? {}).find((v) => typeof v === "string" && v.trim());
        if (typeof valeur === "string") texte = valeur.trim();
      } catch { /* texte brut : on le garde tel quel */ }
      setEleveBilanDetail(prev => prev ? {...prev, loading: false, bilan: texte} : null);
    } catch(e) {
      setEleveBilanDetail(prev => prev ? {...prev, loading: false, bilan: "Erreur lors de la génération du bilan. Veuillez réessayer."} : null);
    }
  }

  const peutCreerGroupe = !creationEnCours && nouveauGroupeNom.trim() !== '' && prefixeGroupe.trim() !== '' && profEcolePrefixe.trim() !== '';

  return (
    <div className="flex flex-col md:flex-row h-screen bg-sand font-sans text-espresso overflow-hidden">
      {modeImpersonation && (
        <div className="absolute top-0 left-0 w-full bg-error-text text-sand px-4 py-2 text-sm font-bold flex justify-between z-50 shadow-md">
          <span className="flex items-center gap-2"><Eye className="h-4 w-4"/> Mode Impersonation actif : Compte de {user.email}</span>
          <button onClick={surDeconnexion} className="underline hover:text-error-surface">Quitter et retourner à l’Admin</button>
        </div>
      )}
      
      <aside className={`w-full md:w-64 bg-white border-b md:border-b-0 md:border-r border-line flex flex-col shrink-0 z-20 ${modeImpersonation ? 'md:mt-10' : ''}`}>
        <div className="p-4 md:p-6 flex justify-between items-center border-b border-line">
          <div className="text-brand-red font-bold text-xl flex items-center gap-2"><BookOpen className="h-6 w-6"/> Corrige.moi</div>
          <button className="md:hidden p-2 rounded hover:bg-sand-soft" onClick={() => setMenuOuvert(!menuOuvert)}><Menu className="h-6 w-6" /></button>
        </div>
        <nav className={`flex-1 p-4 space-y-2 ${menuOuvert ? 'block' : 'hidden md:block'} overflow-y-auto`}>
          <button onClick={() => {setActiveTab('groupes'); setMenuOuvert(false);}} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium ${activeTab === 'groupes' ? 'bg-brand-red-soft text-brand-red-hover' : 'text-stone hover:bg-sand-soft'}`}><Users className="h-5 w-5" /> Mes Groupes ({groupes.length}/6)</button>
          <button onClick={() => {setActiveTab('statistiques'); setMenuOuvert(false);}} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium ${activeTab === 'statistiques' ? 'bg-brand-red-soft text-brand-red-hover' : 'text-stone hover:bg-sand-soft'}`}><Activity className="h-5 w-5" /> Statistiques élèves</button>
           <button onClick={() => {setActiveTab('couverture'); setMenuOuvert(false);}} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium ${activeTab === 'couverture' ? 'bg-brand-red-soft text-brand-red-hover' : 'text-stone hover:bg-sand-soft'}`}><Target className="h-5 w-5" /> Couverture PFEQ</button>
          {!modeImpersonation && (
            <div className="pt-6 md:hidden">
              <button onClick={surDeconnexion} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-stone hover:text-espresso/90"><LogOut className="h-5 w-5" /> Déconnexion</button>
            </div>
          )}
        </nav>
        {!modeImpersonation && (
          <div className="p-4 border-t border-line hidden md:block">
            <div className="px-4 pb-2 text-xs text-stone/70 truncate">{user.email}</div>
            <button onClick={surDeconnexion} className="w-full flex items-center gap-3 px-4 py-2 text-sm font-medium text-stone hover:text-espresso/90 transition-colors"><LogOut className="h-5 w-5" /> Déconnexion</button>
          </div>
        )}
      </aside>

      <main className={`flex-1 flex flex-col h-full overflow-hidden relative ${modeImpersonation ? 'md:mt-10' : ''}`}>
        {activeTab === 'groupes' && (
          <>
            <header className="bg-white border-b border-line px-4 md:px-8 py-4 md:py-5 flex items-center justify-between shrink-0">
              <h1 className="text-xl md:text-2xl font-bold text-espresso">Mes Groupes</h1>
              <button onClick={() => setShowCodeModal(true)} disabled={limiteGroupesAtteinte} className="px-3 md:px-4 py-2 rounded-lg text-xs md:text-sm font-medium bg-brand-red hover:bg-brand-red-hover text-white shadow-sm transition-colors">+ Générer des codes</button>
            </header>
            <div className="flex-1 overflow-auto p-4 md:p-8 pb-20">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                {groupes.map(g => {
                  const nbUtilises = Object.keys(g.codesUtilises || {}).length;
                  const totalCodes = g.codes?.length || 0;
                  return (
                    <button key={g.id} onClick={() => { setGroupeDetail(g); setActiveModalTab('periodes'); }} className="text-left bg-white border border-line rounded-xl p-5 shadow-sm hover:shadow-md hover:border-brand-red/30 transition-all">
                      <h3 className="font-bold text-lg text-espresso mb-1">{g.nom}</h3>
                      <div className="text-sm font-mono text-brand-red bg-brand-red-soft inline-block px-2 py-1 rounded mb-4">{g.prefixeBase}</div>
                      <div className="text-sm text-stone mb-2">{nbUtilises}/{totalCodes} codes attribués</div>
                      <div className="w-full bg-sand-soft rounded-full h-1.5"><div className="bg-brand-pine h-1.5 rounded-full transition-all" style={{ width: `${totalCodes > 0 ? (nbUtilises / totalCodes) * 100 : 0}%` }}></div></div>
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {activeTab === 'statistiques' && (
          <>
            <header className="bg-white border-b border-line px-4 md:px-8 py-4 md:py-5 shrink-0 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <h1 className="text-xl md:text-2xl font-bold text-espresso">Statistiques globales</h1>
              <select value={groupeFiltre} onChange={(e) => setGroupeFiltre(e.target.value)} className="w-full md:w-auto border border-line px-4 py-2 rounded-lg text-sm font-medium focus:ring-2 focus:ring-brand-red bg-sand">
                <option value="Tous">Tous les groupes</option>
                {groupes.map(g => <option key={g.id} value={g.id}>{g.nom}</option>)}
              </select>
            </header>
            <div className="flex-1 overflow-auto p-4 md:p-8 pb-20">
              <div className="bg-white border border-line rounded-xl shadow-sm overflow-x-auto">
                <table className="w-full text-left text-sm min-w-[500px]">
                  <thead className="bg-sand text-stone text-xs uppercase">
                    <tr><th className="px-4 md:px-6 py-4 border-b">Élève</th><th className="px-4 md:px-6 py-4 border-b">Groupe</th><th className="px-4 md:px-6 py-4 border-b text-center">Exercices</th><th className="px-4 md:px-6 py-4 border-b text-center">Réussite</th></tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {genererStatistiques().map((stat, i) => (
                      <tr key={i} onClick={() => genererBilan(stat)} className="hover:bg-brand-red-soft cursor-pointer transition-colors group">
                        <td className="px-4 md:px-6 py-4 font-medium text-espresso flex items-center gap-3">
                          <div className={`w-3 h-3 rounded-full ${stat.couleur} shadow-sm shrink-0`}></div>
                          {stat.nom}
                        </td>
                        <td className="px-4 md:px-6 py-4 text-stone">{stat.groupe}</td>
                        <td className="px-4 md:px-6 py-4 text-center font-bold text-espresso/90">{stat.nbTotal}</td>
                        <td className="px-4 md:px-6 py-4 text-center">
                          <span className="bg-sand-soft group-hover:bg-white px-3 py-1 rounded-full text-espresso/90 font-medium transition-colors border border-line group-hover:border-brand-red/30">{stat.taux} %</span>
                        </td>
                      </tr>
                    ))}
                    {genererStatistiques().length === 0 && (
                      <tr><td colSpan={4} className="px-6 py-8 text-center text-stone">Aucun résultat trouvé pour ce groupe.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <p className="text-sm text-stone mt-4 italic">Astuce : Cliquez sur un élève pour générer un diagnostic du modèle de langage sur ses forces et faiblesses.</p>
            </div>
          </>
        )}
        {activeTab === 'couverture' && (
          <CouverturePFEQProf resultats={resultats} groupes={groupes} groupeFiltre={groupeFiltre} onFiltreChange={setGroupeFiltre} />
        )}
        <FooterGlobale />
      </main>

      {/* MODAL CODES */}
      {showCodeModal && (
        <div className="fixed inset-0 bg-espresso/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-xl">
            <h2 className="text-xl font-bold mb-4 text-espresso">Générer des codes élèves</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-espresso/90 mb-1">Nom d’affichage</label>
                <input type="text" placeholder="Ex: Histoire 401" value={nouveauGroupeNom} onChange={e => setNouveauGroupeNom(e.target.value)} className="w-full border p-2 rounded-lg" />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-espresso/90 mb-1">École</label>
                  {isPrefixeEditable ? (
                    <input type="text" maxLength={3} placeholder="ABC" value={profEcolePrefixe} onChange={e => setProfEcolePrefixe(e.target.value.toUpperCase())} className="w-full border border-brand-red/30 p-2 rounded-lg font-mono uppercase h-[42px] focus:ring-2 focus:ring-brand-red outline-none" />
                  ) : (
                    <div className="w-full border p-2 rounded-lg bg-sand-soft text-stone font-mono flex items-center h-[42px]">
                      {profEcolePrefixe}
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-espresso/90 mb-1">Numéro du groupe</label>
                  <input type="text" maxLength={4} placeholder="Ex: 401" value={prefixeGroupe} onChange={e => setPrefixeGroupe(e.target.value.toUpperCase())} className="w-full border p-2 rounded-lg uppercase font-mono h-[42px]" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-espresso/90 mb-1">Nombre d’élèves</label>
                <input type="number" min="1" max="40" placeholder="Nb élèves" value={nbEleves} onChange={e => setNbEleves(Number(e.target.value))} className="w-full border p-2 rounded-lg h-[42px]" />
              </div>
              <div className="flex justify-end gap-2 mt-6 pt-2">
                <button onClick={() => setShowCodeModal(false)} className="px-5 py-2 bg-line text-espresso/90 hover:bg-line/80 rounded-lg font-medium">Annuler</button>
                <button onClick={creerGroupe} disabled={!peutCreerGroupe} className="px-5 py-2 bg-brand-red hover:bg-brand-red-hover text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed">{creationEnCours ? 'Création...' : 'Créer'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DÉTAIL GROUPE */}
      {groupeDetail && (
        <div className="fixed inset-0 bg-espresso/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden border border-line">
            <div className="p-4 md:p-6 border-b border-line flex justify-between shrink-0 bg-white">
              <div><h2 className="text-xl font-bold text-espresso">{groupeDetail.nom}</h2><p className="text-sm font-mono text-brand-red">{groupeDetail.prefixeBase}</p></div>
              <button onClick={() => setGroupeDetail(null)} className="p-2 bg-sand-soft hover:bg-line text-stone rounded-lg transition-colors"><X className="h-5 w-5" /></button>
            </div>

            <div className="flex border-b border-line bg-sand px-4 md:px-6 pt-2 shrink-0 overflow-x-auto hide-scrollbar">
              <button onClick={() => setActiveModalTab('periodes')} className={`px-4 md:px-6 py-3 text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${activeModalTab === 'periodes' ? 'border-brand-red text-brand-red-hover' : 'border-transparent text-stone hover:text-espresso/90'}`}>Périodes déverrouillées</button>
              <button onClick={() => setActiveModalTab('codes')} className={`px-4 md:px-6 py-3 text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${activeModalTab === 'codes' ? 'border-brand-red text-brand-red-hover' : 'border-transparent text-stone hover:text-espresso/90'}`}>Codes élèves</button>
            </div>

            <div className="flex-1 overflow-auto p-4 md:p-6 bg-white">
              {activeModalTab === 'periodes' && (
                <div>
                  <label className="block text-sm text-stone mb-4">Cochez les périodes auxquelles vos élèves auront accès pour s’exercer.</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {PERIODES_HISTORIQUES.map(p => {
                      const estCochee = (groupeDetail.periodesDebloquees || []).includes(p.id);
                      return (
                        <label key={p.id} className={`flex items-start gap-3 p-4 border-2 rounded-xl cursor-pointer transition-all ${estCochee ? 'bg-brand-red-soft/50 border-brand-red shadow-sm' : 'bg-white border-line hover:border-brand-red/30'}`}>
                          <input type="checkbox" checked={estCochee} onChange={() => togglePeriode(groupeDetail.id, p.id, groupeDetail.periodesDebloquees || [])} className="mt-0.5 h-4 w-4 text-brand-red rounded border-line focus:ring-brand-red" />
                          <span className={`text-sm font-medium leading-snug ${estCochee ? 'text-espresso' : 'text-stone'}`}>{p.titre.split(' : ')[0]}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {activeModalTab === 'codes' && (
                <div className="space-y-2">
                  {(groupeDetail.codes || []).map(code => {
                    const utilise = groupeDetail.codesUtilises?.[code];
                    return (
                      <div key={code} className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-xl border ${utilise ? 'bg-brand-pine-soft/50 border-brand-pine-soft' : 'bg-sand border-line'}`}>
                        <span className={`font-mono text-sm font-medium mb-2 sm:mb-0 ${utilise ? 'line-through text-stone/70' : 'text-espresso/90'}`}>{code}</span>
                        {utilise ? (
                          <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
                            <span className="text-sm font-medium text-brand-pine">{utilise.nom}</span>
                            <button onClick={() => sendPasswordResetEmail(auth, utilise.email).then(()=>alert("Courriel de réinitialisation envoyé !"))} className="text-xs font-medium text-brand-red hover:text-brand-red-hover bg-white border border-brand-red-soft px-3 py-1.5 rounded-lg shadow-sm">Mot de passe oublié ?</button>
                          </div>
                        ) : <span className="text-xs text-stone/70 font-medium uppercase tracking-wider bg-white px-2 py-1 rounded border border-line">Non attribué</span>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL BILAN IA ÉLÈVE */}
      {eleveBilanDetail && (
        <div className="fixed inset-0 bg-espresso/80 flex items-center justify-center z-[60] p-4 backdrop-blur-sm">
           <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-line">
             <div className="p-6 border-b border-line flex justify-between bg-sand">
                <div>
                   <h2 className="text-xl font-bold text-espresso">{eleveBilanDetail.nom}</h2>
                   <p className="text-sm font-medium text-stone">{eleveBilanDetail.groupe}</p>
                </div>
                <button onClick={() => setEleveBilanDetail(null)} className="p-2 bg-white hover:bg-sand-soft text-stone rounded-lg shadow-sm border border-line"><X className="h-5 w-5"/></button>
             </div>
             <div className="p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="bg-brand-red-soft text-brand-red p-2.5 rounded-xl"><Activity className="h-5 w-5" /></div>
                  <h3 className="text-lg font-bold text-espresso">Diagnostic du modèle de langage</h3>
                </div>
                {eleveBilanDetail.loading ? (
                   <div className="flex flex-col items-center justify-center py-8 text-stone">
                     <Loader2 className="h-10 w-10 animate-spin mb-4 text-brand-red"/>
                     <p className="text-sm font-medium">Analyse des {eleveBilanDetail.resultats.length} exercices en cours...</p>
                   </div>
                ) : (
                   <div className="bg-brand-red-soft/50 p-5 rounded-2xl border border-brand-red-soft relative">
                     <div className="absolute -top-3 -left-3 text-4xl opacity-20">✨</div>
                     <p className="text-espresso leading-relaxed text-[15px] relative z-10 font-medium">
                       {eleveBilanDetail.bilan}
                     </p>
                   </div>
                )}
             </div>
           </div>
        </div>
      )}

    </div>
  );
}

function EcranAccesRefuse({ surDeconnexion }: { surDeconnexion: () => void }) {
  return (
    <div className="min-h-screen bg-sand flex items-center justify-center p-5 text-espresso">
      <div className="max-w-md rounded-3xl border border-line bg-white p-8 text-center shadow-sm">
        <span className="mx-auto mb-5 inline-flex rounded-2xl bg-error-surface p-4 text-error-text"><Lock className="h-8 w-8" /></span>
        <h1 className="text-2xl font-black">Accès refusé</h1>
        <p className="mt-3 text-sm leading-relaxed text-stone">Ton compte est bien connecté, mais son rôle ne permet pas d’ouvrir cet espace d’administration.</p>
        <button type="button" onClick={surDeconnexion} className="mt-6 rounded-xl bg-brand-red px-5 py-3 text-sm font-extrabold text-white hover:bg-brand-red-hover">Se déconnecter</button>
      </div>
    </div>
  );
}

// --- 7. RACINE ---
export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [userType, setUserType] = useState<AppRole | null>(null);
  const [verificationEnCours, setVerificationEnCours] = useState(true);
  const [role, setRole] = useState<'eleve' | 'enseignant' | null>(null);
  const [showSplash, setShowSplash] = useState(true);
  const [isFading, setIsFading] = useState(false);
  
  const [impersonatedProf, setImpersonatedProf] = useState<{uid: string, email: string} | null>(null);
  const route = routeDemandee();
  const demoEleveParams = new URLSearchParams(window.location.search);
  const sessionEleveDemo = import.meta.env.DEV
    && ["section-a", "section-b"].includes(demoEleveParams.get("demo") || "")
    && demoEleveParams.get("code") === "HB_-423-01"
    && Boolean(demoEleveParams.get("nom"));

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('action') === 'logout') {
      void signOut(auth).finally(() => {
        window.history.replaceState(null, '', '/');
      });
    }
  }, []);

  useEffect(() => {
    const timerFade = setTimeout(() => setIsFading(true), 2000);
    const timerRemove = setTimeout(() => setShowSplash(false), 3000);
    return () => { clearTimeout(timerFade); clearTimeout(timerRemove); };
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      if (!u) { setUser(null); setUserType(null); setVerificationEnCours(false); return; }
      setUser(u);
      try {
        const serveur = await roleAutoriseParServeur(u).catch(() => null);
        if (serveur) {
          setUserType(serveur.role);
          setVerificationEnCours(false);
          return;
        }
        const token = await u.getIdTokenResult();
        const roleClaim = String(token.claims.role || "");
        if (roleClaim === "superAdmin" || roleClaim === "superadmin") {
          setUserType("superadmin");
        } else if (roleClaim === "adminEcole") {
          setUserType("adminEcole");
        } else if (roleClaim === "enseignant") {
          setUserType("prof");
        } else if (roleClaim === "eleve") {
          setUserType("eleve");
        } else {
          const [adminSnap, profSnap] = await Promise.all([
            getDoc(doc(db, "admins_ecole", u.uid)),
            getDoc(doc(db, "profs", u.uid))
          ]);
          setUserType(adminSnap.exists() ? "adminEcole" : profSnap.exists() ? "prof" : "eleve");
        }
      } catch {
        setUserType("eleve");
      }
      setVerificationEnCours(false);
    });
    return () => unsubscribe();
  }, []);

  if (verificationEnCours) return <div className="min-h-screen bg-sand flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-brand-red" /></div>;

  if (!user && sessionEleveDemo) {
    return <HistoireApp />;
  }

  return (
    <>
      {showSplash && <div className={`fixed inset-0 z-[9999] bg-sand flex flex-col items-center justify-center transition-opacity duration-1000 pointer-events-none ${isFading ? 'opacity-0' : 'opacity-100'}`}><img src="/corrige.moi.transparent.png" alt="Logo" className="w-64 md:w-96 object-contain" /></div>}
      
      {user && userType && !rolePeutOuvrirRoute(userType, route) ? (
        <EcranAccesRefuse surDeconnexion={() => { void signOut(auth); setRole(null); }} />
      ) : null}

      {user && userType && rolePeutOuvrirRoute(userType, route) && userType === 'superadmin' ? (
         impersonatedProf ? (
           <DashboardProf user={{ uid: impersonatedProf.uid, email: impersonatedProf.email } as User} surDeconnexion={() => setImpersonatedProf(null)} modeImpersonation={true} />
         ) : (
           <DashboardAdmin surDeconnexion={() => signOut(auth)} onImpersonate={(uid, email) => setImpersonatedProf({uid, email})} />
         )
      ) : null}

      {user && userType && rolePeutOuvrirRoute(userType, route) && userType === 'adminEcole' ? <DashboardAdminEcole user={user} surDeconnexion={() => { void signOut(auth); setRole(null); }} /> : null}
      {user && userType && rolePeutOuvrirRoute(userType, route) && userType === 'prof' ? <DashboardProf user={user} surDeconnexion={() => { void signOut(auth); setRole(null); }} /> : null}
      {user && userType && rolePeutOuvrirRoute(userType, route) && userType === 'eleve' ? <RedirectionEleve user={user} surDeconnexion={() => { void signOut(auth); setRole(null); }} /> : null}
      {!user && role === 'eleve' ? <EcranConnexionEleve surRetour={() => setRole(null)} /> : null}
      {!user && role === 'enseignant' ? <EcranConnexionProf surRetour={() => setRole(null)} /> : null}
      {!user && !role && route === 'public' ? <EcranAccueil onChoisirRole={setRole} /> : null}
      {!user && !role && route !== 'public' ? <EcranConnexionProf surRetour={() => { window.history.replaceState(null, '', '/'); setRole(null); }} /> : null}
    </>
  );
}