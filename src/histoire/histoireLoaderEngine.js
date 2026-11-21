// @ts-nocheck
/*
 * Moteur de l'animation d'attente « À travers notre histoire » : un bonhomme
 * dessiné à l'encre traverse les 8 périodes du programme (sec. 3 et 4).
 * Canvas 2D pur, sans dépendance ni accès réseau.
 *
 * Origine : module HistoireLoader produit avec Gemini (fourni par l'enseignant).
 * Adaptations : 7,5 s par scène (60 s en tout), drapeau britannique de la
 * Conquête corrigé (Union Jack de 1606), polices de l'appli, option
 * reduceMotion (image fixe), module ES au lieu d'une variable globale.
 */
export const HISTOIRE_SCENES = [
  // --- SECONDAIRE 3 ---
  {
    id: 'origines',
    level: 'sec3',
    levelLabel: 'Sec. 3',
    era: 'Des origines à 1608',
    shortLabel: 'Premiers occupants',
    subtitle: "L'expérience des Autochtones et le projet de colonie",
    message: 'Navigation sur le Saint-Laurent',
    duration: 7500
  },
  {
    id: 'nouvelle_france',
    level: 'sec3',
    levelLabel: 'Sec. 3',
    era: '1608–1760',
    shortLabel: 'Nouvelle-France',
    subtitle: 'La société coloniale et la traite des fourrures',
    message: 'En route avec les coureurs des bois',
    duration: 7500
  },
  {
    id: 'conquete',
    level: 'sec3',
    levelLabel: 'Sec. 3',
    era: '1760–1791',
    shortLabel: "Changement d'empire",
    subtitle: "La Conquête et l'Acte de Québec",
    message: "Réflexion sur le changement d'empire",
    duration: 7500
  },
  {
    id: 'patriotes',
    level: 'sec3',
    levelLabel: 'Sec. 3',
    era: '1791–1840',
    shortLabel: 'Luttes & Patriotes',
    subtitle: 'Revendications démocratiques et rébellions de 1837-1838',
    message: 'Mobilisation des Patriotes',
    duration: 7500
  },
  // --- SECONDAIRE 4 ---
  {
    id: 'federation',
    level: 'sec4',
    levelLabel: 'Sec. 4',
    era: '1840–1896',
    shortLabel: 'Fédération & Rail',
    subtitle: 'La formation de la fédération canadienne (1867)',
    message: 'Construction du chemin de fer',
    duration: 7500
  },
  {
    id: 'industrialisation',
    level: 'sec4',
    levelLabel: 'Sec. 4',
    era: '1896–1945',
    shortLabel: 'Industrialisation & Vote',
    subtitle: "Essor industriel, autonomie et droit de vote (1940)",
    message: 'Transformation des villes et des droits',
    duration: 7500
  },
  {
    id: 'revolution_tranquille',
    level: 'sec4',
    levelLabel: 'Sec. 4',
    era: '1945–1980',
    shortLabel: 'Révolution tranquille',
    subtitle: 'Modernisation, Hydro-Québec et Expo 67',
    message: 'Mise en marche de la Révolution tranquille',
    duration: 7500
  },
  {
    id: 'contemporain',
    level: 'sec4',
    levelLabel: 'Sec. 4',
    era: 'De 1980 à nos jours',
    shortLabel: 'Québec contemporain',
    subtitle: 'Choix de société, démocratie et ère numérique',
    message: 'Exploration du Québec contemporain',
    duration: 7500
  }
];

// Utilitaires mathématiques
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

export class HistoireLoader {
  constructor(canvas, options = {}) {
    if (!canvas) {
      throw new Error('HistoireLoader requiert un élément <canvas> valide.');
    }
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    this.options = {
      theme: options.theme || 'light',
      sketchMode: options.sketchMode !== undefined ? options.sketchMode : true,
      autoCycle: options.autoCycle !== undefined ? options.autoCycle : true,
      level: options.level || 'all',
      initialSceneId: options.initialSceneId || null,
      randomStart: options.randomStart || false,
      onSceneChange: typeof options.onSceneChange === 'function' ? options.onSceneChange : null,
      onProgress: typeof options.onProgress === 'function' ? options.onProgress : null,
      reduceMotion: Boolean(options.reduceMotion)
    };

    this.scenes = this._getFilteredScenes(this.options.level);
    this.sceneIndex = 0;

    if (this.options.initialSceneId) {
      const idx = this.scenes.findIndex((s) => s.id === this.options.initialSceneId);
      if (idx >= 0) this.sceneIndex = idx;
    } else if (this.options.randomStart) {
      this.sceneIndex = Math.floor(Math.random() * this.scenes.length);
    }

    this.sceneElapsed = 0;
    this.lastTimestamp = 0;
    this.wobbleSeed = 0;
    this.wobbleTimer = 0;
    this.particles = [];
    this.rafId = null;
    this.running = false;

    this._boundTick = this._tick.bind(this);
    this._boundResize = this.resize.bind(this);
    window.addEventListener('resize', this._boundResize);
    this.resize();
  }

  // ---------------------------------------------------------------------
  // API PUBLIQUE
  // ---------------------------------------------------------------------
  start() {
    if (this.running) return;
    this.running = true;
    this.lastTimestamp = 0;
    this._emitSceneChange();
    this.rafId = requestAnimationFrame(this._boundTick);
  }

  stop() {
    this.running = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  destroy() {
    this.stop();
    window.removeEventListener('resize', this._boundResize);
    this.particles = [];
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const dpr = window.devicePixelRatio || 1;
    const targetW = Math.round(rect.width * dpr);
    const targetH = Math.round(rect.height * dpr);
    if (this.canvas.width !== targetW || this.canvas.height !== targetH) {
      this.canvas.width = targetW;
      this.canvas.height = targetH;
    }
  }

  setTheme(theme) {
    this.options.theme = theme === 'dark' ? 'dark' : 'light';
  }

  setSketchMode(enabled) {
    this.options.sketchMode = Boolean(enabled);
  }

  setAutoCycle(enabled) {
    this.options.autoCycle = Boolean(enabled);
  }

  setLevel(level) {
    this.options.level = level;
    const currentId = this.getCurrentScene()?.id;
    this.scenes = this._getFilteredScenes(level);
    const sameIdx = this.scenes.findIndex((s) => s.id === currentId);
    this.sceneIndex = sameIdx >= 0 ? sameIdx : 0;
    this.sceneElapsed = 0;
    this.particles = [];
    this._emitSceneChange();
  }

  setSceneById(id) {
    const idx = this.scenes.findIndex((s) => s.id === id);
    if (idx >= 0) {
      this.sceneIndex = idx;
      this.sceneElapsed = 0;
      this.particles = [];
      this._emitSceneChange();
    }
  }

  getCurrentScene() {
    return this.scenes[this.sceneIndex] || HISTOIRE_SCENES[0];
  }

  // ---------------------------------------------------------------------
  // GESTION INTERNE ET PALETTE
  // ---------------------------------------------------------------------
  _getFilteredScenes(level) {
    if (level === 'sec3' || level === 'sec4') {
      return HISTOIRE_SCENES.filter((s) => s.level === level);
    }
    return HISTOIRE_SCENES.slice();
  }

  _emitSceneChange() {
    if (this.options.onSceneChange) {
      this.options.onSceneChange(this.getCurrentScene(), this.sceneIndex, this.scenes.length);
    }
  }

  _getPalette() {
    if (this.options.theme === 'dark') {
      return {
        ink: '#ede3cf',
        muted: 'rgba(237, 227, 207, 0.35)',
        accent: '#e6a23c',
        warm: '#d9534f',
        blue: '#4da3ff',
        green: '#4caf73',
        glow: 'rgba(230, 162, 60, 0.25)',
        ground: 'rgba(237, 227, 207, 0.22)',
        paper: '#241f1b',
        bgFill: '#171412'
      };
    }
    return {
      ink: '#2c241e',
      muted: 'rgba(44, 36, 30, 0.32)',
      accent: '#b87314',
      warm: '#b83b2a',
      blue: '#1e5aa8',
      green: '#2b7a4b',
      glow: 'rgba(217, 138, 28, 0.22)',
      ground: 'rgba(44, 36, 30, 0.2)',
      paper: '#fffcf4',
      bgFill: '#f6f1e3'
    };
  }

  _hash(n) {
    const x = Math.sin(n * 127.1 + this.wobbleSeed * 311.7) * 43758.5453123;
    return x - Math.floor(x);
  }

  // ---------------------------------------------------------------------
  // PRIMITIVES DE DESSIN (EFFET ENCRE DESSINÉE À LA MAIN)
  // ---------------------------------------------------------------------
  _line(x1, y1, x2, y2, seedId = 1, lineWidth = 2.6, color = null) {
    const ctx = this.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = lineWidth;
    if (color) ctx.strokeStyle = color;

    if (!this.options.sketchMode) {
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.restore();
      return;
    }

    const j = 0.8;
    const mx = (x1 + x2) / 2 + (this._hash(seedId + 1) - 0.5) * j * 1.8;
    const my = (y1 + y2) / 2 + (this._hash(seedId + 2) - 0.5) * j * 1.8;
    ctx.moveTo(x1 + (this._hash(seedId + 3) - 0.5) * j, y1 + (this._hash(seedId + 4) - 0.5) * j);
    ctx.quadraticCurveTo(mx, my, x2 + (this._hash(seedId + 5) - 0.5) * j, y2 + (this._hash(seedId + 6) - 0.5) * j);
    ctx.stroke();
    ctx.restore();
  }

  _circle(cx, cy, r, seedId = 10, lineWidth = 2.6, strokeColor = null, fillColor = null) {
    const ctx = this.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.lineWidth = lineWidth;
    if (strokeColor) ctx.strokeStyle = strokeColor;
    if (fillColor) ctx.fillStyle = fillColor;

    if (!this.options.sketchMode) {
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
    } else {
      const steps = 14;
      for (let i = 0; i <= steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        const jitter = (this._hash(seedId + i * 3) - 0.5) * 1.05;
        const px = cx + Math.cos(a) * (r + jitter);
        const py = cy + Math.sin(a) * (r + jitter);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
    }
    if (fillColor) ctx.fill();
    if (strokeColor) ctx.stroke();
    ctx.restore();
  }

  _drawStickMan(ox, oy, pose, palette) {
    const ink = palette.ink;
    const lw = 2.6;

    const hx = ox + pose.head[0];
    const hy = oy + pose.head[1];
    const nx = ox + pose.neck[0];
    const ny = oy + pose.neck[1];
    const px = ox + pose.hip[0];
    const py = oy + pose.hip[1];

    // Torse
    this._line(nx, ny, px, py, 101, lw, ink);
    // Jambe gauche
    this._line(px, py, ox + pose.lKnee[0], oy + pose.lKnee[1], 102, lw, ink);
    this._line(ox + pose.lKnee[0], oy + pose.lKnee[1], ox + pose.lFoot[0], oy + pose.lFoot[1], 103, lw, ink);
    // Jambe droite
    this._line(px, py, ox + pose.rKnee[0], oy + pose.rKnee[1], 104, lw, ink);
    this._line(ox + pose.rKnee[0], oy + pose.rKnee[1], ox + pose.rFoot[0], oy + pose.rFoot[1], 105, lw, ink);
    // Bras gauche
    this._line(nx, ny, ox + pose.lElbow[0], oy + pose.lElbow[1], 106, lw, ink);
    this._line(ox + pose.lElbow[0], oy + pose.lElbow[1], ox + pose.lHand[0], oy + pose.lHand[1], 107, lw, ink);
    // Bras droit
    this._line(nx, ny, ox + pose.rElbow[0], oy + pose.rElbow[1], 108, lw, ink);
    this._line(ox + pose.rElbow[0], oy + pose.rElbow[1], ox + pose.rHand[0], oy + pose.rHand[1], 109, lw, ink);

    // Tête
    this._circle(hx, hy, 9.5, 110, lw, ink, palette.bgFill);

    // Petit œil expressif
    const faceDir = pose.faceDir !== undefined ? pose.faceDir : 1;
    if (faceDir !== 0) {
      this.ctx.fillStyle = ink;
      this.ctx.beginPath();
      this.ctx.arc(hx + faceDir * 3.3, hy - 1.4, 1.35, 0, Math.PI * 2);
      this.ctx.fill();
    }
  }

  // Petite tuque traditionnelle (coureur des bois / Patriote)
  _drawTuque(hx, hy, color, palette, sway = 0) {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = color;
    ctx.strokeStyle = palette.ink;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(hx - 9, hy - 6);
    ctx.quadraticCurveTo(hx - 6, hy - 20, hx + 6, hy - 15 + sway);
    ctx.quadraticCurveTo(hx + 12, hy - 11 + sway, hx + 9, hy - 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Pompon
    ctx.beginPath();
    ctx.arc(hx + 9, hy - 14 + sway, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // ---------------------------------------------------------------------
  // SYSTÈME DE PARTICULES LÉGER
  // ---------------------------------------------------------------------
  _spawnParticle(p) {
    if (this.options.reduceMotion) return;
    if (this.particles.length > 55) this.particles.shift();
    this.particles.push({
      x: p.x,
      y: p.y,
      vx: p.vx || 0,
      vy: p.vy || 0,
      life: p.life || 0.7,
      maxLife: p.life || 0.7,
      size: p.size || 2.2,
      color: p.color || '#b87314',
      type: p.type || 'dot'
    });
  }

  _updateAndDrawParticles(dt, ox, oy) {
    const ctx = this.ctx;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      if (p.type === 'spark') p.vy += 120 * dt;
      if (p.type === 'smoke') p.size += 5.5 * dt;

      const alpha = clamp(p.life / p.maxLife, 0, 1);
      ctx.save();
      ctx.globalAlpha = alpha;
      if (p.type === 'smoke') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(ox + p.x, oy + p.y, p.size, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(ox + p.x, oy + p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  // ---------------------------------------------------------------------
  // LES 8 VIGNETTES HISTORIQUES (SECONDAIRE 3 ET 4)
  // ---------------------------------------------------------------------

  // 1. DES ORIGINES À 1608 — Canot d'écorce sur le Saint-Laurent
  _drawOrigines(ox, oy, t, dt, palette) {
    const ctx = this.ctx;
    // Rive lointaine avec petits sapins
    this._line(ox + 38, oy - 16, ox + 90, oy - 16, 200, 1.4, palette.muted);
    [54, 72].forEach((tx, idx) => {
      const bx = ox + tx;
      const by = oy - 16;
      this._line(bx, by, bx, by - 22, 201 + idx, 1.5, palette.green);
      this._line(bx - 7, by - 6, bx, by - 22, 203 + idx, 1.5, palette.green);
      this._line(bx + 7, by - 6, bx, by - 22, 205 + idx, 1.5, palette.green);
    });

    // Vagues du Saint-Laurent
    ctx.save();
    ctx.strokeStyle = palette.blue;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = -90; x <= 90; x += 6) {
      const wy = oy + 4 + Math.sin(x * 0.08 + t * 14) * 2.5;
      if (x === -90) ctx.moveTo(ox + x, wy);
      else ctx.lineTo(ox + x, wy);
    }
    ctx.stroke();
    ctx.restore();

    // Mouvement du canot et du pagayeur
    const glideX = lerp(-24, 12, Math.sin(t * Math.PI));
    const bob = Math.sin(t * Math.PI * 6) * 2;
    const paddlePhase = t * Math.PI * 8;
    const greeting = t > 0.72;

    ctx.save();
    ctx.translate(ox + glideX, oy - 2 + bob);

    const handX = greeting ? 14 : 6 + Math.cos(paddlePhase) * 9;
    const handY = greeting ? -68 + Math.sin(t * 25) * 3 : -24 + Math.sin(paddlePhase) * 7;

    const pose = {
      head: [-2, -52],
      neck: [-2, -41],
      hip: [-4, -18],
      lKnee: [4, -12],
      lFoot: [-2, -6],
      rKnee: [-8, -12],
      rFoot: [-12, -6],
      lElbow: greeting ? [8, -52] : [2, -32],
      lHand: [handX, handY],
      rElbow: [-8, -32],
      rHand: greeting ? [-4, -22] : [-2 + Math.cos(paddlePhase) * 5, -34 + Math.sin(paddlePhase) * 4],
      faceDir: 1
    };
    this._drawStickMan(0, 0, pose, palette);

    // Pagaie en bois
    if (!greeting) {
      const px1 = pose.rHand[0];
      const py1 = pose.rHand[1];
      const px2 = pose.lHand[0] + 6;
      const py2 = pose.lHand[1] + 22;
      this._line(px1, py1, px2, py2, 208, 2.2, palette.accent);

      // Petites gouttelettes d'eau
      if (Math.sin(paddlePhase) > 0.65 && Math.random() < dt * 16) {
        this._spawnParticle({
          x: glideX + px2,
          y: 2,
          vx: -18 - Math.random() * 14,
          vy: -22 - Math.random() * 16,
          size: 1.8,
          life: 0.45,
          color: palette.blue,
          type: 'spark'
        });
      }
    }

    // Canot d'écorce (courbes relevées aux extrémités)
    ctx.fillStyle = palette.paper;
    ctx.strokeStyle = palette.ink;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-42, -16);
    ctx.quadraticCurveTo(-34, 4, -18, 4);
    ctx.lineTo(18, 4);
    ctx.quadraticCurveTo(34, 4, 42, -16);
    ctx.quadraticCurveTo(32, -8, 18, -8);
    ctx.lineTo(-18, -8);
    ctx.quadraticCurveTo(-32, -8, -42, -16);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  // 2. 1608–1760 — La Nouvelle-France (Coureur des bois & traite des fourrures)
  _drawNouvelleFrance(ox, oy, t, dt, palette) {
    this._line(ox - 88, oy, ox + 88, oy, 210, 1.8, palette.ground);

    // Poste de traite / poteau fleurdelysé à droite
    const postX = ox + 46;
    this._line(postX, oy, postX, oy - 68, 211, 2.4, palette.ink);
    // Bannière bleue royale
    const wave = Math.sin(t * 14) * 2;
    this.ctx.save();
    this.ctx.fillStyle = palette.blue;
    this.ctx.strokeStyle = palette.ink;
    this.ctx.lineWidth = 1.6;
    this.ctx.beginPath();
    this.ctx.moveTo(postX, oy - 68);
    this.ctx.quadraticCurveTo(postX + 14, oy - 71 + wave, postX + 28, oy - 67 - wave * 0.5);
    this.ctx.lineTo(postX + 28, oy - 50 - wave * 0.5);
    this.ctx.quadraticCurveTo(postX + 14, oy - 54 + wave, postX, oy - 51);
    this.ctx.closePath();
    this.ctx.fill();
    this.ctx.stroke();
    // Petite fleur stylisée dorée
    this.ctx.fillStyle = '#f6f1e3';
    this.ctx.beginPath();
    this.ctx.arc(postX + 14, oy - 59, 3, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.restore();

    // Coureur des bois qui marche avec un baluchon de fourrures, puis fait un bond content
    const arrived = t > 0.62;
    let mx = -42;
    let hop = 0;
    let walk = 0;

    if (!arrived) {
      const p = t / 0.62;
      mx = lerp(-48, 8, p);
      walk = Math.sin(p * Math.PI * 6) * 9;
    } else {
      const localT = (t - 0.62) / 0.38;
      mx = 8;
      hop = Math.abs(Math.sin(localT * Math.PI * 2)) * 10;
    }

    const pose = {
      head: [mx, -62 - hop],
      neck: [mx, -50 - hop],
      hip: [mx, -26 - hop],
      lKnee: [mx - 4 - walk * 0.5, -13 - hop * 0.7],
      lFoot: [mx - 5 - walk, -hop * 0.5],
      rKnee: [mx + 4 + walk * 0.5, -13 - hop * 0.7],
      rFoot: [mx + 5 + walk, -hop * 0.5],
      lElbow: arrived ? [mx - 14, -60 - hop] : [mx - 12, -46],
      lHand: arrived ? [mx - 18, -74 - hop] : [mx - 10, -56],
      rElbow: arrived ? [mx + 14, -60 - hop] : [mx + 10, -38],
      rHand: arrived ? [mx + 18, -74 - hop] : [mx + 16, -32],
      faceDir: 1
    };

    // Baluchon de fourrures sur le dos (ou déposé au sol à l'arrivée)
    const packX = arrived ? ox + mx - 24 : ox + mx - 17;
    const packY = arrived ? oy - 10 : oy - 44;
    this._circle(packX, packY, 10, 214, 2, palette.ink, palette.accent);
    this._line(packX - 7, packY - 4, packX + 7, packY + 4, 215, 1.4, palette.ink);

    this._drawStickMan(ox, oy, pose, palette);
    // Ceinture fléchée (petit trait rouge à la taille)
    this._line(ox + pose.hip[0] - 5, oy + pose.hip[1] - 4, ox + pose.hip[0] + 6, oy + pose.hip[1] - 4, 216, 3.2, palette.warm);
    // Tuque rouge
    this._drawTuque(ox + pose.head[0], oy + pose.head[1], palette.warm, palette, Math.sin(t * 20) * 1.5);
  }

  // 3. 1760–1791 — La Conquête et le changement d'empire (Moment « réflexion »)
  _drawConquete(ox, oy, t, dt, palette) {
    this._line(ox - 88, oy, ox + 88, oy, 220, 1.8, palette.ground);

    // Mât central
    const poleX = ox + 26;
    this._line(poleX, oy, poleX, oy - 82, 221, 2.5, palette.ink);

    // Transition des drapeaux (0..0.45 baisse, 0.45..0.85 monte le nouveau)
    const isNewRegime = t >= 0.45;
    const flagY = !isNewRegime
      ? lerp(oy - 80, oy - 24, t / 0.45)
      : lerp(oy - 24, oy - 80, clamp((t - 0.45) / 0.35, 0, 1));

    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = isNewRegime ? '#1f3a7a' : palette.blue;
    ctx.strokeStyle = palette.ink;
    ctx.lineWidth = 1.6;
    ctx.fillRect(poleX, flagY, 28, 17);
    if (isNewRegime) {
      // Union Jack simplifié (1606) : sautoir blanc et croix de Saint-Georges.
      ctx.save();
      ctx.beginPath();
      ctx.rect(poleX, flagY, 28, 17);
      ctx.clip();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3.4;
      ctx.beginPath();
      ctx.moveTo(poleX, flagY); ctx.lineTo(poleX + 28, flagY + 17);
      ctx.moveTo(poleX + 28, flagY); ctx.lineTo(poleX, flagY + 17);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(poleX + 11, flagY, 6, 17);
      ctx.fillRect(poleX, flagY + 5.5, 28, 6);
      ctx.fillStyle = '#c8102e';
      ctx.fillRect(poleX + 12.5, flagY, 3, 17);
      ctx.fillRect(poleX, flagY + 7, 28, 3);
      ctx.restore();
      ctx.strokeStyle = palette.ink;
      ctx.lineWidth = 1.6;
      ctx.strokeRect(poleX, flagY, 28, 17);
    } else {
      ctx.strokeRect(poleX, flagY, 28, 17);
      ctx.fillStyle = '#f6f1e3';
      ctx.beginPath();
      ctx.arc(poleX + 14, flagY + 8.5, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Petit bonhomme qui observe et se gratte le menton (« little thinks »)
    const breathe = Math.sin(t * 12) * 1.2;
    const headTilt = Math.sin(t * 6) * 1.5;
    const pose = {
      head: [-24 + headTilt, -60 + breathe],
      neck: [-24, -48 + breathe],
      hip: [-26, -24],
      lKnee: [-32, -12],
      lFoot: [-34, 0],
      rKnee: [-18, -12],
      rFoot: [-16, 0],
      lElbow: [-36, -36],
      lHand: [-30, -26],
      rElbow: [-10, -40 + breathe],
      rHand: [-17 + headTilt, -51 + breathe],
      faceDir: 1
    };
    this._drawStickMan(ox, oy, pose, palette);

    // Bulle de pensée avec « ? » puis « 1774 » (Acte de Québec)
    const bx = ox - 48;
    const by = oy - 78;
    this._circle(bx + 15, by + 13, 2.2, 224, 1.5, palette.muted);
    this._circle(bx + 9, by + 6, 3.2, 225, 1.5, palette.muted);
    this._circle(bx - 5, by - 4, 13.5, 226, 1.8, palette.ink, palette.paper);

    ctx.save();
    ctx.fillStyle = palette.accent;
    ctx.font = 'bold 11px "Source Serif 4", Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(t > 0.72 ? '1774' : '?', bx - 5, by - 3 + Math.sin(t * 14) * 1.2);
    ctx.restore();
  }

  // 4. 1791–1840 — Revendications & Patriotes (Discours et drapeau patriote)
  _drawPatriotes(ox, oy, t, dt, palette) {
    this._line(ox - 88, oy, ox + 88, oy, 230, 1.8, palette.ground);

    // Petite caisse en bois sur laquelle il grimpe pour haranguer la foule
    const cx = ox - 16;
    this.ctx.save();
    this.ctx.fillStyle = palette.paper;
    this.ctx.strokeStyle = palette.ink;
    this.ctx.lineWidth = 2;
    this.ctx.fillRect(cx - 16, oy - 18, 32, 18);
    this.ctx.strokeRect(cx - 16, oy - 18, 32, 18);
    this._line(cx - 16, oy - 18, cx + 16, oy, 231, 1.2, palette.muted);
    this.ctx.restore();

    // Mouvement énergique du bras qui brandit le drapeau vert-blanc-rouge
    const waveArm = Math.sin(t * 18) * 10;
    const gesture = Math.cos(t * 24) * 6;
    const pose = {
      head: [-16, -78],
      neck: [-16, -66],
      hip: [-16, -42],
      lKnee: [-22, -30],
      lFoot: [-24, -18],
      rKnee: [-10, -30],
      rFoot: [-8, -18],
      lElbow: [-28, -56],
      lHand: [-34 + gesture * 0.5, -66 - Math.abs(gesture)],
      rElbow: [-2, -62],
      rHand: [10 + waveArm * 0.4, -74],
      faceDir: 1
    };

    this._drawStickMan(ox, oy, pose, palette);
    // Tuque des Patriotes
    this._drawTuque(ox + pose.head[0], oy + pose.head[1], palette.warm, palette, waveArm * 0.15);

    // Drapeau des Patriotes (Vert, Blanc, Rouge)
    const fx = ox + pose.rHand[0];
    const fy = oy + pose.rHand[1];
    const topX = fx + 12 + waveArm * 0.5;
    const topY = fy - 30;
    this._line(fx - 2, fy + 16, topX, topY, 232, 2.2, palette.ink);

    // 3 bandes horizontales
    const w = 28;
    const h = 6;
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(topX, topY);
    ctx.rotate(waveArm * 0.015);
    ctx.fillStyle = palette.green;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, h, w, h);
    ctx.fillStyle = palette.warm;
    ctx.fillRect(0, h * 2, w, h);
    ctx.strokeStyle = palette.ink;
    ctx.lineWidth = 1.4;
    ctx.strokeRect(0, 0, w, h * 3);
    ctx.restore();

    // Petites étincelles d'éloquence
    if (Math.random() < dt * 7) {
      this._spawnParticle({
        x: -36,
        y: -74,
        vx: -24 - Math.random() * 18,
        vy: -14 - Math.random() * 18,
        size: 1.8,
        life: 0.45,
        color: palette.accent,
        type: 'dot'
      });
    }
  }

  // 5. 1840–1896 — Fédération canadienne & Chemin de fer
  _drawFederation(ox, oy, t, dt, palette) {
    // Rails de chemin de fer
    this._line(ox - 92, oy, ox + 92, oy, 240, 2.4, palette.ink);
    for (let rx = -84; rx <= 84; rx += 14) {
      this._line(ox + rx, oy, ox + rx - 4, oy + 5, 241 + rx, 1.8, palette.muted);
    }

    const trainPhase = t > 0.54;

    if (!trainPhase) {
      // Phase 1 : Le bonhomme plante le dernier crampon avec un marteau
      const swing = Math.sin(t * 26);
      const impact = swing > 0.85;
      const armY = lerp(-76, -12, (swing + 1) / 2);
      const armX = lerp(-4, 24, (swing + 1) / 2);

      const pose = {
        head: [-16, -60 + (swing > 0 ? swing * 5 : 0)],
        neck: [-16, -48 + (swing > 0 ? swing * 5 : 0)],
        hip: [-22, -25],
        lKnee: [-30, -12],
        lFoot: [-34, 0],
        rKnee: [-10, -12],
        rFoot: [-6, 0],
        lElbow: [-4, -44],
        lHand: [armX - 4, armY],
        rElbow: [2, -40],
        rHand: [armX, armY],
        faceDir: 1
      };
      this._drawStickMan(ox, oy, pose, palette);

      // Marteau
      const hx = ox + pose.rHand[0];
      const hy = oy + pose.rHand[1];
      this._line(hx - 6, hy - 6, hx + 10, hy + 8, 245, 2.4, palette.accent);
      this._line(hx + 6, hy + 12, hx + 14, hy + 4, 246, 5, palette.ink);

      // Crampon sur le rail
      this._line(ox + 34, oy, ox + 34, oy - 7, 247, 3, palette.accent);

      if (impact && Math.random() < dt * 35) {
        this._spawnParticle({
          x: 34,
          y: -4,
          vx: (Math.random() - 0.5) * 65,
          vy: -35 - Math.random() * 35,
          size: 2,
          life: 0.4,
          color: palette.accent,
          type: 'spark'
        });
      }
    } else {
      // Phase 2 : Une petite locomotive à vapeur passe fièrement pendant qu'il salue !
      const p = (t - 0.54) / 0.46;
      const trainX = lerp(-110, 125, p);

      // Bonhomme en retrait qui salue
      const pose = {
        head: [-46, -62],
        neck: [-46, -50],
        hip: [-46, -26],
        lKnee: [-52, -13],
        lFoot: [-54, 0],
        rKnee: [-40, -13],
        rFoot: [-38, 0],
        lElbow: [-56, -40],
        lHand: [-58, -28],
        rElbow: [-36, -58],
        rHand: [-30 + Math.sin(t * 28) * 5, -72],
        faceDir: 1
      };
      this._drawStickMan(ox, oy, pose, palette);

      // Locomotive dessinée à l'encre
      const ctx = this.ctx;
      ctx.save();
      ctx.translate(ox + trainX, oy - 4);
      ctx.fillStyle = palette.paper;
      ctx.strokeStyle = palette.ink;
      ctx.lineWidth = 2.2;
      // Chaudière + cabine
      ctx.fillRect(-34, -28, 36, 20);
      ctx.strokeRect(-34, -28, 36, 20);
      ctx.fillRect(-44, -38, 16, 30);
      ctx.strokeRect(-44, -38, 16, 30);
      // Cheminée
      ctx.fillStyle = palette.ink;
      ctx.fillRect(-10, -40, 7, 12);
      // Roues
      this._circle(-34, -4, 5.5, 248, 2, palette.ink, palette.accent);
      this._circle(-18, -4, 5.5, 249, 2, palette.ink, palette.accent);
      this._circle(-4, -4, 4.5, 250, 2, palette.ink, palette.accent);
      ctx.restore();

      // Bouffées de vapeur
      if (Math.random() < dt * 16) {
        this._spawnParticle({
          x: trainX - 6,
          y: -44,
          vx: -12,
          vy: -24 - Math.random() * 14,
          size: 3.5,
          life: 0.85,
          color: palette.muted,
          type: 'smoke'
        });
      }
    }
  }

  // 6. 1896–1945 — Industrialisation, autonomie et droit de vote (1940)
  _drawIndustrialisation(ox, oy, t, dt, palette) {
    this._line(ox - 88, oy, ox + 88, oy, 260, 1.8, palette.ground);

    // Engrenage rotatif d'usine à gauche
    const gx = ox - 46;
    const gy = oy - 36;
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(gx, gy);
    ctx.rotate(t * Math.PI * 3);
    this._circle(0, 0, 16, 261, 2.2, palette.muted);
    this._circle(0, 0, 5, 262, 1.8, palette.muted);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      this._line(Math.cos(a) * 15, Math.sin(a) * 15, Math.cos(a) * 21, Math.sin(a) * 21, 263 + i, 3, palette.muted);
    }
    ctx.restore();

    // Urne électorale à droite (Droit de vote des femmes au Québec — 1940)
    const ux = ox + 36;
    ctx.save();
    ctx.fillStyle = palette.paper;
    ctx.strokeStyle = palette.ink;
    ctx.lineWidth = 2.2;
    ctx.fillRect(ux - 14, oy - 26, 28, 26);
    ctx.strokeRect(ux - 14, oy - 26, 28, 26);
    this._line(ux - 7, oy - 22, ux + 7, oy - 22, 272, 2.4, palette.ink);
    ctx.restore();

    // Le bonhomme dépose son bulletin puis lève les bras en victoire (« 1940 »)
    const voted = t > 0.56;
    const dropT = clamp(t / 0.56, 0, 1);
    const hop = voted ? Math.abs(Math.sin(((t - 0.56) / 0.44) * Math.PI * 2)) * 9 : 0;

    const pose = {
      head: [4, -62 - hop],
      neck: [4, -50 - hop],
      hip: [2, -26 - hop],
      lKnee: [-6, -13 - hop * 0.6],
      lFoot: [-8, -hop * 0.4],
      rKnee: [10, -13 - hop * 0.6],
      rFoot: [12, -hop * 0.4],
      lElbow: voted ? [-10, -60 - hop] : [-8, -40],
      lHand: voted ? [-14, -74 - hop] : [-10, -28],
      rElbow: voted ? [18, -60 - hop] : [18, -46],
      rHand: voted ? [22, -74 - hop] : [lerp(24, 34, dropT), lerp(-50, -34, dropT)],
      faceDir: 1
    };
    this._drawStickMan(ox, oy, pose, palette);

    // Bulletin de vote glissant dans l'urne
    if (!voted) {
      const bx = ox + pose.rHand[0] + 2;
      const by = oy + pose.rHand[1] + 4;
      ctx.save();
      ctx.fillStyle = palette.accent;
      ctx.fillRect(bx - 4, by - 5, 8, 10);
      ctx.restore();
    } else {
      ctx.save();
      ctx.fillStyle = palette.accent;
      ctx.font = 'bold 12px "Source Serif 4", Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillText('VOTE • 1940', ox + 36, oy - 36 - Math.sin(t * 14) * 2);
      ctx.restore();
    }
  }

  // 7. 1945–1980 — Révolution tranquille (Hydro-Québec & Expo 67)
  _drawRevolutionTranquille(ox, oy, t, dt, palette) {
    this._line(ox - 90, oy, ox + 90, oy, 280, 1.8, palette.ground);

    const powered = t > 0.42;

    // Pylône électrique Hydro-Québec au centre-droit
    const px = ox + 16;
    this._line(px - 12, oy, px, oy - 72, 281, 2.2, palette.ink);
    this._line(px + 12, oy, px, oy - 72, 282, 2.2, palette.ink);
    this._line(px - 16, oy - 52, px + 16, oy - 52, 283, 2, palette.ink);
    this._line(px - 11, oy - 34, px + 11, oy - 34, 284, 1.8, palette.ink);
    this._line(px - 7, oy - 18, px + 7, oy - 18, 285, 1.6, palette.ink);

    // Dôme géodésique d'Expo 67 à droite !
    const dx = ox + 64;
    const dy = oy;
    this.ctx.save();
    this.ctx.strokeStyle = powered ? palette.blue : palette.muted;
    this.ctx.lineWidth = 1.8;
    this.ctx.beginPath();
    this.ctx.arc(dx, dy, 20, Math.PI, 0);
    this.ctx.stroke();
    // Treillis géométrique du dôme
    this._line(dx - 16, dy - 10, dx + 16, dy - 10, 286, 1.2, powered ? palette.blue : palette.muted);
    this._line(dx - 10, dy - 17, dx, dy, 287, 1.1, powered ? palette.blue : palette.muted);
    this._line(dx + 10, dy - 17, dx, dy, 288, 1.1, powered ? palette.blue : palette.muted);
    this.ctx.restore();

    // Câble électrique vers le dôme
    this.ctx.save();
    this.ctx.strokeStyle = powered ? palette.accent : palette.muted;
    this.ctx.lineWidth = powered ? 2.2 : 1.4;
    this.ctx.beginPath();
    this.ctx.moveTo(px + 14, oy - 52);
    this.ctx.quadraticCurveTo(ox + 42, oy - 38, dx, dy - 20);
    this.ctx.stroke();
    this.ctx.restore();

    // Impulsion électrique qui parcourt le câble
    if (powered) {
      const zapT = ((t - 0.42) * 3.5) % 1;
      const zx = lerp(px + 14, dx, zapT);
      const zy = lerp(oy - 52, dy - 20, zapT) + Math.sin(zapT * Math.PI) * 8;
      this._circle(zx, zy, 3.8, 289, 1.5, palette.accent, palette.accent);

      // Halo lumineux au-dessus du dôme
      this.ctx.save();
      this.ctx.fillStyle = palette.glow;
      this.ctx.beginPath();
      this.ctx.arc(dx, dy - 10, 25 + Math.sin(t * 25) * 2, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.restore();
    }

    // Petit levier / interrupteur à gauche actionné par le bonhomme
    const lx = ox - 22;
    const leverAngle = powered ? 0.55 : -0.55;
    this._line(lx, oy, lx, oy - 20, 290, 2.4, palette.ink);
    this._line(lx, oy - 20, lx + Math.sin(leverAngle) * 16, oy - 20 - Math.cos(leverAngle) * 16, 291, 2.6, palette.warm);

    const pose = {
      head: [-44, -62],
      neck: [-44, -50],
      hip: [-44, -26],
      lKnee: [-50, -13],
      lFoot: [-52, 0],
      rKnee: [-36, -13],
      rFoot: [-34, 0],
      lElbow: powered ? [-56, -60] : [-54, -40],
      lHand: powered ? [-60, -74] : [-56, -28],
      rElbow: [-32, -42],
      rHand: [lx - ox + Math.sin(leverAngle) * 14, -20 - Math.cos(leverAngle) * 14],
      faceDir: 1
    };
    this._drawStickMan(ox, oy, pose, palette);

    if (powered && Math.random() < dt * 10) {
      this._spawnParticle({
        x: 16 + (Math.random() - 0.5) * 24,
        y: -52,
        vx: (Math.random() - 0.5) * 40,
        vy: -25 - Math.random() * 25,
        size: 2,
        life: 0.4,
        color: palette.accent,
        type: 'spark'
      });
    }
  }

  // 8. DE 1980 À NOS JOURS — Québec contemporain (Réflexion, numérique et avenir vert)
  _drawContemporain(ox, oy, t, dt, palette) {
    this._line(ox - 88, oy, ox + 88, oy, 300, 1.8, palette.ground);

    // Petit bureau moderne + ordinateur portable
    const dx = ox + 16;
    const dy = oy - 24;
    this._line(dx - 18, dy, dx + 22, dy, 301, 2.4, palette.ink);
    this._line(dx - 14, dy, dx - 14, oy, 302, 2, palette.ink);
    this._line(dx + 18, dy, dx + 18, oy, 303, 2, palette.ink);

    // Ordinateur portable
    this._line(dx - 6, dy - 1, dx + 10, dy - 1, 304, 2.5, palette.ink);
    this._line(dx + 10, dy - 1, dx + 15, dy - 15, 305, 2.5, palette.blue);

    // Bonhomme assis qui réfléchit puis a une idée lumineuse (feuille verte + globe)
    const idea = t > 0.52;
    const bob = Math.sin(t * 14) * 1.2;
    const pose = {
      head: [-18, -54 + bob],
      neck: [-20, -43 + bob],
      hip: [-28, -20],
      lKnee: [-12, -20],
      lFoot: [-12, 0],
      rKnee: [-16, -18],
      rFoot: [-18, 0],
      lElbow: [-8, -32],
      lHand: [8, -26 + Math.sin(t * 45) * 1.5],
      rElbow: idea ? [-6, -54] : [-6, -34],
      rHand: idea ? [0, -68] : [12, -26 + Math.cos(t * 45) * 1.5],
      faceDir: 1
    };
    // Tabouret
    this._line(ox - 36, oy - 18, ox - 20, oy - 18, 306, 2, palette.ink);
    this._line(ox - 28, oy - 18, ox - 28, oy, 307, 2, palette.ink);

    this._drawStickMan(ox, oy, pose, palette);

    // Constellation numérique + petite pousse verte qui éclôt au-dessus de l'écran
    const cx = ox + 36;
    const cy = oy - 62;
    const scale = idea ? clamp((t - 0.52) * 3.5, 0.2, 1) : 0.35 + Math.sin(t * 10) * 0.08;

    const ctx = this.ctx;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);

    // Globe minimaliste
    this._circle(0, 0, 14, 308, 1.8, palette.blue, palette.paper);
    this._line(-13, 0, 13, 0, 309, 1.2, palette.blue);
    ctx.strokeStyle = palette.blue;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(0, 0, 6.5, 13.5, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Petite feuille verte symbolisant l'avenir écologique
    if (idea) {
      ctx.fillStyle = palette.green;
      ctx.beginPath();
      ctx.moveTo(0, -14);
      ctx.quadraticCurveTo(10, -26, 16, -20);
      ctx.quadraticCurveTo(8, -12, 0, -14);
      ctx.fill();
    }
    ctx.restore();

    if (idea && Math.random() < dt * 8) {
      this._spawnParticle({
        x: 36 + (Math.random() - 0.5) * 20,
        y: -62 + (Math.random() - 0.5) * 16,
        vx: (Math.random() - 0.5) * 20,
        vy: -20 - Math.random() * 15,
        size: 1.8,
        life: 0.6,
        color: palette.green,
        type: 'dot'
      });
    }
  }

  // ---------------------------------------------------------------------
  // BOUCLE D'ANIMATION PRINCIPALE
  // ---------------------------------------------------------------------
  _tick(timestamp) {
    if (!this.running) return;
    if (!this.lastTimestamp) this.lastTimestamp = timestamp;
    const dt = Math.min((timestamp - this.lastTimestamp) / 1000, 0.05);
    this.lastTimestamp = timestamp;

    // Effet d'encre vivante (~10 ips)
    this.wobbleTimer += dt;
    if (this.wobbleTimer >= 0.1) {
      this.wobbleTimer = 0;
      this.wobbleSeed = (this.wobbleSeed + 1) % 1000;
    }

    const scene = this.getCurrentScene();
    this.sceneElapsed += dt * 1000;
    if (this.options.reduceMotion) {
      this.wobbleSeed = 0;
      this.particles = [];
    }

    if (this.sceneElapsed >= scene.duration) {
      this.sceneElapsed = 0;
      this.particles = [];
      if (this.options.autoCycle && this.scenes.length > 1) {
        this.sceneIndex = (this.sceneIndex + 1) % this.scenes.length;
        this._emitSceneChange();
      }
    }

    const t = clamp(this.sceneElapsed / scene.duration, 0, 1);
    if (this.options.onProgress) {
      const ratio = this.options.autoCycle
        ? (this.sceneIndex + t) / this.scenes.length
        : t;
      this.options.onProgress(ratio);
    }

    // Mouvement réduit : une image fixe, prise vers la fin de chaque scène.
    this._render(this.options.reduceMotion ? 0.85 : t, this.options.reduceMotion ? 0 : dt);
    this.rafId = requestAnimationFrame(this._boundTick);
  }

  _render(t, dt) {
    this.resize();
    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.width / dpr;
    const h = this.canvas.height / dpr;
    if (w === 0 || h === 0) return;

    const ctx = this.ctx;
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const palette = this._getPalette();
    const ox = w / 2;
    const oy = h * 0.78;
    const scale = Math.min(1.15, Math.max(0.8, w / 260));

    ctx.translate(ox, oy);
    ctx.scale(scale, scale);
    ctx.translate(-ox, -oy);

    const scene = this.getCurrentScene();
    switch (scene.id) {
      case 'origines':              this._drawOrigines(ox, oy, t, dt, palette); break;
      case 'nouvelle_france':       this._drawNouvelleFrance(ox, oy, t, dt, palette); break;
      case 'conquete':              this._drawConquete(ox, oy, t, dt, palette); break;
      case 'patriotes':             this._drawPatriotes(ox, oy, t, dt, palette); break;
      case 'federation':            this._drawFederation(ox, oy, t, dt, palette); break;
      case 'industrialisation':     this._drawIndustrialisation(ox, oy, t, dt, palette); break;
      case 'revolution_tranquille': this._drawRevolutionTranquille(ox, oy, t, dt, palette); break;
      case 'contemporain':          this._drawContemporain(ox, oy, t, dt, palette); break;
    }

    this._updateAndDrawParticles(dt, ox, oy);
    ctx.restore();
  }
}
