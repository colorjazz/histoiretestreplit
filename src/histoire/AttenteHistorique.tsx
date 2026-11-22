import { useEffect, useState } from "react";

/** Au-delà de ce délai, le message rassure sur la fin de l'attente. */
const DELAI_PROLONGE_MS = 45_000;

/**
 * Attente commune à toute l'appli : un anneau discret, le titre de ce qui se
 * prépare et, au besoin, une précision. Rien d'autre ne bouge.
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
  const [prolonge, setProlonge] = useState(false);

  useEffect(() => {
    const minuterie = window.setTimeout(() => setProlonge(true), DELAI_PROLONGE_MS);
    return () => window.clearTimeout(minuterie);
  }, []);

  return (
    <div className={`attente-historique ${compact ? "attente-historique--compact" : ""}`} role="status" aria-live="polite">
      <span className="attente-historique-anneau" aria-hidden="true" />
      <div className="attente-historique-texte">
        <strong className="attente-historique-titre">{titre}</strong>
        <small className="attente-historique-detail">
          {detail ?? (prolonge ? "Presque terminé — dernières vérifications…" : "Un instant…")}
        </small>
      </div>
    </div>
  );
}
