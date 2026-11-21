export type HistoireScene = {
  id: string;
  level: "sec3" | "sec4";
  levelLabel: string;
  era: string;
  shortLabel: string;
  subtitle: string;
  message: string;
  duration: number;
};

export const HISTOIRE_SCENES: HistoireScene[];

export class HistoireLoader {
  constructor(canvas: HTMLCanvasElement, options?: {
    theme?: "light" | "dark";
    sketchMode?: boolean;
    autoCycle?: boolean;
    level?: "all" | "sec3" | "sec4";
    initialSceneId?: string | null;
    randomStart?: boolean;
    reduceMotion?: boolean;
    onSceneChange?: (scene: HistoireScene, index: number, total: number) => void;
    onProgress?: (ratio: number) => void;
  });
  start(): void;
  stop(): void;
  destroy(): void;
  setTheme(theme: "light" | "dark"): void;
}
