import { useEffect, useRef, useState } from "react";
import { HistoireLoader, HISTOIRE_SCENES, type HistoireScene } from "./histoireLoaderEngine.js";

const DUREE_TOTALE_MS = HISTOIRE_SCENES.reduce((total, scene) => total + scene.duration, 0);

function themeCourant(): "light" | "dark" {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function mouvementReduit(): boolean {
  return typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Attente commune à toute l'appli : un bonhomme traverse les 8 périodes du
 * programme en une minute, avec une barre chronologique. Au-delà d'une minute,
 * l'animation continue et le message indique les dernières vérifications.
 */
export default function AttenteHistorique({
  titre,
  detail,
  compact = false,
}: {
  /** Ce que l'on attend, ex. « Préparation de ton lot de 10 questions ». */
  titre: string;
  /** Précision facultative (progression réelle, consigne de patience…). */
  detail?: string;
  /** Version réduite pour les attentes affichées sous un contenu existant. */
  compact?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [scene, setScene] = useState<HistoireScene>(HISTOIRE_SCENES[0]);
  const [ecoule, setEcoule] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const loader = new HistoireLoader(canvas, {
      theme: themeCourant(),
      level: "all",
      autoCycle: true,
      reduceMotion: mouvementReduit(),
      onSceneChange: (nouvelle) => setScene(nouvelle),
    });
    loader.start();
    const debut = performance.now();
    const minuterie = window.setInterval(() => {
      setEcoule(performance.now() - debut);
      loader.setTheme(themeCourant());
    }, 250);
    return () => {
      window.clearInterval(minuterie);
      loader.destroy();
    };
  }, []);

  const progression = Math.min(1, ecoule / DUREE_TOTALE_MS);
  const prolonge = ecoule >= DUREE_TOTALE_MS;

  return (
    <div className={`attente-historique ${compact ? "attente-historique--compact" : ""}`} role="status" aria-live="polite">
      <strong className="attente-historique-titre">{titre}</strong>
      <canvas ref={canvasRef} className="attente-historique-canvas" aria-hidden="true" />
      <p className="attente-historique-scene" aria-hidden="true">
        <span className="attente-historique-epoque">{scene.era}</span>
        <span>{prolonge ? "Presque terminé — dernières vérifications…" : `${scene.message}…`}</span>
      </p>
      <div
        className="attente-historique-frise"
        role="progressbar"
        aria-label="Temps d’attente écoulé"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progression * 100)}
      >
        <div className="attente-historique-frise-remplie" style={{ width: `${progression * 100}%` }} />
        {HISTOIRE_SCENES.slice(1).map((repere, index) => (
          <span
            key={repere.id}
            className="attente-historique-repere"
            style={{ left: `${((index + 1) / HISTOIRE_SCENES.length) * 100}%` }}
          />
        ))}
      </div>
      {detail && <small className="attente-historique-detail">{detail}</small>}
    </div>
  );
}
