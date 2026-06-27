// MojAbble - Game Engine (Board, Tiles, Layout)
(function() {
'use strict';

window.MojAbble = window.MojAbble || {};

// ─── Seeded PRNG (mulberry32) ───────────────────────────────────────
// Returns a function that produces deterministic 0-1 floats from a seed.
// Used for multiplayer so both players generate identical boards.
function mulberry32(seed) {
  return function() {
    seed |= 0;
    seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

MojAbble.mulberry32 = mulberry32;

// ─── Constants ───────────────────────────────────────────────────────
const C = {
  TILE_W: 52,
  TILE_H: 66,
  TILE_GAP: 1,
  TILE_RADIUS: 6,
  LAYER_DX: 6,
  LAYER_DY: 6,
  MIN_WORD: 3,
  COMBO_TIMEOUT: 8000,

  LETTER_DIST: {
    easy: {
      A:9, B:1, C:2, D:4, E:12, F:1, G:2, H:3, I:8, J:0,
      K:0, L:5, M:2, N:6, O:8, P:2, Q:0, R:6, S:6, T:6,
      U:4, V:0, W:1, X:0, Y:2, Z:0
    },
    normal: {
      A:8, B:2, C:2, D:3, E:11, F:2, G:3, H:2, I:8, J:1,
      K:1, L:4, M:2, N:5, O:7, P:2, Q:1, R:5, S:4, T:5,
      U:4, V:2, W:2, X:1, Y:2, Z:1
    },
    hard: {
      A:5, B:2, C:3, D:3, E:7, F:3, G:3, H:3, I:5, J:2,
      K:2, L:3, M:3, N:4, O:5, P:3, Q:1, R:4, S:3, T:4,
      U:3, V:3, W:3, X:2, Y:3, Z:2
    }
  },

  VOWEL_MIN: { easy: 0.40, normal: 0.35, hard: 0.25 },

  COLORS: {
    bg1: '#0a0e27',
    bg2: '#1a1040',
    tileFace: ['#f5e6c8','#f8ecd4','#faf0dc','#fcf4e4'],
    tileSide: '#c4a676',
    tileDark: '#a08050',
    shadow: 'rgba(0,0,0,0.25)',
    freeGlow: 'rgba(255,215,0,0.25)',
    freeBorder: 'rgba(255,215,0,0.6)',
    selectedGlow: 'rgba(255,165,0,0.5)',
    selectedBorder: '#ffa500',
    blocked: 'rgba(0,0,20,0.28)',
    hoverGlow: 'rgba(255,255,200,0.18)',
    letterHigh: '#8b0000',
    letterMid: '#5a3a1a',
    letterLow: '#2a1810',
  }
};

MojAbble.C = C;

// ─── Tile ────────────────────────────────────────────────────────────
class Tile {
  constructor(col, row, layer, letter) {
    this.col = col;
    this.row = row;
    this.layer = layer;
    this.letter = letter;
    this.score = MojAbble.WordValidator.getLetterScore(letter);
    this.id = `${col}_${row}_${layer}`;
    this.removed = false;
    this.selected = false;

    // Animation state
    this.animY = 0;       // vertical bounce offset
    this.animScale = 1;
    this.animAlpha = 1;
    this.glowPulse = Math.random() * Math.PI * 2; // phase offset for glow
    this.shakeX = 0;
    this.removing = false;
    this.removeTimer = 0;
    this.removeDelay = 0;

    // Flip animation (shuffle/swap)
    this.flipTimer = -1;      // -1 = inactive, 0..1 = progress
    this.flipDelay = 0;       // stagger delay in seconds
    this.pendingLetter = null; // letter to switch to at flip midpoint
    this.pendingScore = 0;

    // Selection punch
    this.punchTimer = -1;     // -1 = inactive, 0..1 = progress
  }

  getScreenPos(offsetX, offsetY) {
    const x = offsetX + this.col * (C.TILE_W + C.TILE_GAP) + this.layer * C.LAYER_DX;
    const y = offsetY + this.row * (C.TILE_H + C.TILE_GAP) - this.layer * C.LAYER_DY;
    return { x, y };
  }
}

MojAbble.Tile = Tile;

// ─── Layouts ─────────────────────────────────────────────────────────
const Layouts = {
  // Classic pyramid layout
  classic() {
    const positions = [];

    // Layer 0: Diamond shape (48 tiles)
    const l0 = [
      { r:0, cols:[3,4,5,6,7,8] },
      { r:1, cols:[2,3,4,5,6,7,8,9] },
      { r:2, cols:[1,2,3,4,5,6,7,8,9,10] },
      { r:3, cols:[1,2,3,4,5,6,7,8,9,10] },
      { r:4, cols:[2,3,4,5,6,7,8,9] },
      { r:5, cols:[3,4,5,6,7,8] },
    ];
    for (const row of l0) {
      for (const c of row.cols) {
        positions.push({ col: c, row: row.r, layer: 0 });
      }
    }

    // Layer 1: Smaller rectangle (12 tiles)
    const l1 = [
      { r:1, cols:[4,5,6,7] },
      { r:2, cols:[3,4,5,6,7,8] },
      { r:3, cols:[3,4,5,6,7,8] },
      { r:4, cols:[4,5,6,7] },
    ];
    for (const row of l1) {
      for (const c of row.cols) {
        positions.push({ col: c, row: row.r, layer: 1 });
      }
    }

    // Layer 2: Even smaller (6 tiles)
    const l2 = [
      { r:2, cols:[5,6] },
      { r:3, cols:[4,5,6,7] },
    ];
    for (const row of l2) {
      for (const c of row.cols) {
        positions.push({ col: c, row: row.r, layer: 2 });
      }
    }

    // Layer 3: Top (2 tiles)
    positions.push({ col: 5, row: 3, layer: 3 });
    positions.push({ col: 6, row: 3, layer: 3 });

    return positions;
  }
};

MojAbble.Layouts = Layouts;

// ─── Board ───────────────────────────────────────────────────────────
class Board {
  constructor() {
    this.tiles = [];
    this.selectedTiles = [];
    this.hoveredTile = null;
    this.offsetX = 0;
    this.offsetY = 0;
    this.scale = 1;
    this.showHighlight = true;
    this.difficulty = 'normal';
  }

  init(layoutName = 'classic', difficulty = 'normal', seed = null) {
    this.difficulty = difficulty;
    // Use seeded PRNG for multiplayer, Math.random for solo
    this._rng = seed != null ? mulberry32(seed) : Math.random;
    const positions = Layouts[layoutName]();
    const letters = this._generateLetters(positions.length);

    this.tiles = positions.map((pos, i) =>
      new Tile(pos.col, pos.row, pos.layer, letters[i])
    );
    this.selectedTiles = [];
    this.hoveredTile = null;

    // Calculate board bounds for centering
    this._computeBounds();
  }

  _generateLetters(count) {
    const rng = this._rng || Math.random;

    // Build letter pool from difficulty distribution
    const pool = [];
    const dist = C.LETTER_DIST[this.difficulty] || C.LETTER_DIST.normal;
    for (const [letter, freq] of Object.entries(dist)) {
      for (let i = 0; i < freq; i++) pool.push(letter);
    }

    // Need `count` letters - sample from pool, repeating if needed
    const letters = [];
    const available = [...pool];

    const vowels = 'AEIOU';
    let vowelCount = 0;

    for (let i = 0; i < count; i++) {
      if (available.length === 0) {
        available.push(...pool);
      }
      const idx = Math.floor(rng() * available.length);
      const letter = available[idx];
      available.splice(idx, 1);
      letters.push(letter);
      if (vowels.includes(letter)) vowelCount++;
    }

    // Ensure minimum vowels for this difficulty
    const minVowels = Math.floor(count * (C.VOWEL_MIN[this.difficulty] || 0.35));
    while (vowelCount < minVowels) {
      const consonantIndices = letters
        .map((l, i) => vowels.includes(l) ? -1 : i)
        .filter(i => i >= 0);
      if (consonantIndices.length === 0) break;
      const ri = consonantIndices[Math.floor(rng() * consonantIndices.length)];
      const vowelPool = 'AEIOAEIOEAEI';
      letters[ri] = vowelPool[Math.floor(rng() * vowelPool.length)];
      vowelCount++;
    }

    // Shuffle
    for (let i = letters.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [letters[i], letters[j]] = [letters[j], letters[i]];
    }

    return letters;
  }

  _computeBounds() {
    let minC = Infinity, maxC = -Infinity;
    let minR = Infinity, maxR = -Infinity;
    let maxLayer = 0;

    for (const t of this.tiles) {
      minC = Math.min(minC, t.col);
      maxC = Math.max(maxC, t.col);
      minR = Math.min(minR, t.row);
      maxR = Math.max(maxR, t.row);
      maxLayer = Math.max(maxLayer, t.layer);
    }

    this.boardWidth = (maxC - minC) * (C.TILE_W + C.TILE_GAP) + C.TILE_W + maxLayer * C.LAYER_DX;
    this.boardHeight = (maxR - minR) * (C.TILE_H + C.TILE_GAP) + C.TILE_H + maxLayer * C.LAYER_DY;
    this.minCol = minC;
    this.minRow = minR;
    this.maxLayer = maxLayer;
  }

  centerOnCanvas(canvasW, canvasH) {
    // Auto-scale board to fit any screen size
    const isMobile = canvasW < 768;
    const topUI = isMobile ? 30 : 60;
    const bottomUI = isMobile ? 60 : 150;
    const pad = 0;

    const availW = canvasW - pad * 2;
    const availH = canvasH - topUI - bottomUI;

    const scaleX = availW / this.boardWidth;
    const scaleY = availH / this.boardHeight;
    const maxScale = isMobile ? 2.0 : 1;
    this.scale = Math.min(maxScale, scaleX, scaleY);

    // Center board in available space (offsets are in pre-scale coords)
    const screenCenterX = canvasW / 2;
    const screenCenterY = topUI + availH / 2;

    this.offsetX = screenCenterX / this.scale - this.boardWidth / 2 - this.minCol * (C.TILE_W + C.TILE_GAP);
    if (canvasW < 768) this.offsetX += 5 / this.scale;
    this.offsetY = screenCenterY / this.scale - this.boardHeight / 2 - this.minRow * (C.TILE_H + C.TILE_GAP) + this.maxLayer * C.LAYER_DY;

  }

  // Check if a tile is free (can be selected)
  isFree(tile) {
    if (tile.removed || tile.removing) return false;

    // Check: no tile on top (same col, row, layer+1)
    const hasAbove = this.tiles.some(t =>
      !t.removed && !t.removing &&
      t.layer === tile.layer + 1 &&
      t.col === tile.col &&
      t.row === tile.row
    );
    if (hasAbove) return false;

    // Check: at least one side (left or right) is free
    const hasLeft = this.tiles.some(t =>
      !t.removed && !t.removing &&
      t.layer === tile.layer &&
      t.col === tile.col - 1 &&
      t.row === tile.row
    );
    const hasRight = this.tiles.some(t =>
      !t.removed && !t.removing &&
      t.layer === tile.layer &&
      t.col === tile.col + 1 &&
      t.row === tile.row
    );

    return !hasLeft || !hasRight;
  }

  getActiveTiles() {
    return this.tiles.filter(t => !t.removed);
  }

  getFreeTiles() {
    return this.getActiveTiles().filter(t => this.isFree(t));
  }

  selectTile(tile) {
    if (tile.selected || !this.isFree(tile)) return false;
    tile.selected = true;
    this.selectedTiles.push(tile);
    return true;
  }

  deselectTile(tile) {
    tile.selected = false;
    this.selectedTiles = this.selectedTiles.filter(t => t !== tile);
  }

  deselectAll() {
    for (const t of this.selectedTiles) {
      t.selected = false;
    }
    this.selectedTiles = [];
  }

  deselectLast() {
    if (this.selectedTiles.length === 0) return null;
    const tile = this.selectedTiles.pop();
    tile.selected = false;
    return tile;
  }

  removeSelected() {
    const removed = [...this.selectedTiles];
    for (const t of removed) {
      t.removing = true;
      t.removeTimer = 0;
      t.selected = false;
    }
    this.selectedTiles = [];
    return removed;
  }

  // Finalize removal after animation
  finalizeRemoval(tile) {
    tile.removed = true;
    tile.removing = false;
  }

  getCurrentWord() {
    return this.selectedTiles.map(t => t.letter).join('');
  }

  // Get tile at screen position (top layer first for click priority)
  getTileAtPos(sx, sy) {
    // Convert screen coords to board coords (un-scale)
    const bx = sx / this.scale;
    const by = sy / this.scale;

    // Sort by layer descending so top tiles are checked first
    const sorted = this.getActiveTiles()
      .filter(t => !t.removing)
      .sort((a, b) => b.layer - a.layer);

    for (const tile of sorted) {
      const pos = tile.getScreenPos(this.offsetX, this.offsetY);
      if (bx >= pos.x && bx <= pos.x + C.TILE_W &&
          by >= pos.y && by <= pos.y + C.TILE_H) {
        return tile;
      }
    }
    return null;
  }

  // Get tile's screen-space position (after scaling) for effects
  tileScreenXY(tile) {
    const pos = tile.getScreenPos(this.offsetX, this.offsetY);
    return {
      x: pos.x * this.scale,
      y: pos.y * this.scale,
      cx: (pos.x + C.TILE_W / 2) * this.scale,
      cy: (pos.y + C.TILE_H / 2) * this.scale,
    };
  }

  // Get sorted tiles for rendering (bottom layer first, then row, then col)
  getRenderOrder() {
    return this.tiles
      .filter(t => !t.removed)
      .sort((a, b) => {
        if (a.layer !== b.layer) return a.layer - b.layer;
        if (a.row !== b.row) return a.row - b.row;
        return a.col - b.col;
      });
  }

  // Check if any words can be formed from free tiles
  canFormWord() {
    const free = this.getFreeTiles();
    if (free.length < C.MIN_WORD) return false;

    // Only do dictionary check when 3 or fewer tiles remain on the board
    const remaining = this.getActiveTiles();
    if (remaining.length > C.MIN_WORD) return true;

    // Check if any valid word can be spelled from remaining tiles
    const letters = remaining.map(t => t.letter.toLowerCase());
    const avail = {};
    for (const l of letters) avail[l] = (avail[l] || 0) + 1;

    const WV = MojAbble.WordValidator;
    for (const word of WV._words) {
      if (word.length < C.MIN_WORD || word.length > letters.length) continue;
      let ok = true;
      const used = {};
      for (const ch of word) {
        used[ch] = (used[ch] || 0) + 1;
        if (used[ch] > (avail[ch] || 0)) { ok = false; break; }
      }
      if (ok) return true;
    }
    return false;
  }

  getRemainingPenalty() {
    const remaining = this.getActiveTiles();
    let sum = 0;
    for (const t of remaining) sum += t.score;
    return Math.round(sum * 0.5);
  }

  getRemainingCount() {
    return this.tiles.filter(t => !t.removed).length;
  }

  // Shuffle: redistribute ALL active tiles' letters (session pool preserved)
  // Free tiles get animated flip; blocked tiles change silently
  shuffleFreeLetters() {
    const active = this.getActiveTiles().filter(t => !t.selected && t.flipTimer < 0);
    if (active.length === 0) return;

    // Shuffle the ENTIRE active pool (same letters, new positions)
    const letters = active.map(t => t.letter);
    for (let i = letters.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [letters[i], letters[j]] = [letters[j], letters[i]];
    }

    // Identify free tiles for visible animation
    const free = this.getFreeTiles().filter(t => !t.selected && t.flipTimer < 0);
    const freeIds = new Set(free.map(t => t.id));

    // Spiral wave from center of free tiles
    const cx = free.length > 0 ? free.reduce((s, t) => s + t.col, 0) / free.length : 0;
    const cy = free.length > 0 ? free.reduce((s, t) => s + t.row, 0) / free.length : 0;
    const sortedFree = [...free].sort((a, b) =>
      Math.hypot(a.col - cx, a.row - cy) - Math.hypot(b.col - cx, b.row - cy)
    );

    for (let i = 0; i < active.length; i++) {
      const tile = active[i];
      const newLetter = letters[i];

      if (freeIds.has(tile.id)) {
        // Animated flip for visible free tiles
        const waveOrder = sortedFree.indexOf(tile);
        tile.pendingLetter = newLetter;
        tile.pendingScore = MojAbble.WordValidator.getLetterScore(newLetter);
        tile.flipTimer = 0;
        tile.flipDelay = waveOrder * 0.035;
      } else {
        // Silent change for blocked tiles
        tile.letter = newLetter;
        tile.score = MojAbble.WordValidator.getLetterScore(newLetter);
      }
    }
  }

  // Swap: replace selected tiles' letters with new random ones (animated)
  swapSelectedLetters() {
    if (this.selectedTiles.length === 0) return 0;

    const pool = [];
    const dist = C.LETTER_DIST[this.difficulty] || C.LETTER_DIST.normal;
    for (const [letter, freq] of Object.entries(dist)) {
      for (let i = 0; i < freq; i++) pool.push(letter);
    }

    const count = this.selectedTiles.length;
    for (let i = 0; i < this.selectedTiles.length; i++) {
      const tile = this.selectedTiles[i];
      const newLetter = pool[Math.floor(Math.random() * pool.length)];
      tile.pendingLetter = newLetter;
      tile.pendingScore = MojAbble.WordValidator.getLetterScore(newLetter);
      tile.flipTimer = 0;
      tile.flipDelay = i * 0.06;
      tile.selected = false;
    }
    this.selectedTiles = [];
    return count;
  }
}

MojAbble.Board = Board;

// ─── Score Manager ───────────────────────────────────────────────────
class ScoreManager {
  constructor() {
    this.reset();
  }

  reset() {
    this.score = 0;
    this.displayScore = 0;  // for smooth animation
    this.combo = 0;
    this.maxCombo = 0;
    this.lastWordTime = 0;
    this.wordsFound = 0;
    this.bestWord = '';
    this.bestWordScore = 0;
    this.totalLetters = 0;
  }

  submitWord(word, time) {
    const WV = MojAbble.WordValidator;
    const baseScore = WV.getWordScore(word);
    const lengthBonus = WV.getLengthBonus(word.length);

    // Check combo
    if (time - this.lastWordTime < C.COMBO_TIMEOUT && this.lastWordTime > 0) {
      this.combo++;
    } else {
      this.combo = 1;
    }

    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.lastWordTime = time;

    const comboMultiplier = this.combo;
    const wordTotal = (baseScore + lengthBonus) * comboMultiplier;

    this.score += wordTotal;
    this.wordsFound++;
    this.totalLetters += word.length;

    if (wordTotal > this.bestWordScore) {
      this.bestWord = word;
      this.bestWordScore = wordTotal;
    }

    return {
      baseScore,
      lengthBonus,
      combo: this.combo,
      comboMultiplier,
      total: wordTotal,
    };
  }

  updateDisplay(dt) {
    // Smooth score counting
    const diff = this.score - this.displayScore;
    if (Math.abs(diff) < 1) {
      this.displayScore = this.score;
    } else {
      this.displayScore += diff * Math.min(1, dt * 8);
    }
  }

  checkComboTimeout(time) {
    if (this.combo > 0 && time - this.lastWordTime >= C.COMBO_TIMEOUT) {
      this.combo = 0;
    }
  }
}

MojAbble.ScoreManager = ScoreManager;

})();
