// MojAbble - Board Phase
// After the pile phase, players keep the words they made (whole, not broken
// back into letters) and take turns placing them on a crossword grid.
// Words must cross an existing word at a matching letter and may only touch
// where they cross. Each crossing letter earns a bonus.
(function() {
'use strict';

window.MojAbble = window.MojAbble || {};

const SIZE = 13;
const CENTER = Math.floor(SIZE / 2);
const CROSS_BONUS = 20;

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

class BoardPhase {
  // players: [{ name, words: [{w, pts, used}], pileScore, boardScore }]
  // opts.startTurn: which player places first (default 0)
  constructor(players, onFinish, opts = {}) {
    this.players = players;
    this.onFinish = onFinish;
    this.grid = Array.from({ length: SIZE }, () => new Array(SIZE).fill(null));
    this.turn = opts.startTurn || 0;
    this.passes = 0;
    this.firstPlaced = false;
    this.orientation = 'H';
    this.selectedIdx = -1;
    this.anchor = null;
    this._finished = false;
  }

  start() {
    this._el = document.getElementById('board-phase');
    this._gridEl = document.getElementById('bp-grid');
    this._rackEl = document.getElementById('bp-rack');

    // Build grid cells fresh each game
    this._gridEl.innerHTML = '';
    this._cells = [];
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const cell = document.createElement('div');
        cell.className = 'bp-cell';
        cell.onclick = () => this._tapCell(r, c);
        this._gridEl.appendChild(cell);
        this._cells.push(cell);
      }
    }

    // onclick assignment (not addEventListener) so repeat games don't stack handlers
    document.getElementById('bp-rotate').onclick = () => {
      this.orientation = this.orientation === 'H' ? 'V' : 'H';
      this._render();
    };
    document.getElementById('bp-place').onclick = () => this._place();
    document.getElementById('bp-pass').onclick = () => this._pass();

    this._el.style.display = 'flex';
    this._render();
    this._ensurePlayable();
  }

  _tapCell(r, c) {
    if (this.selectedIdx < 0) return;
    this.anchor = { r, c };
    this._render();
  }

  _selectWord(i) {
    const w = this.players[this.turn].words[i];
    if (!w || w.used) return;
    this.selectedIdx = this.selectedIdx === i ? -1 : i;
    if (this.selectedIdx < 0) this.anchor = null;
    this._render();
  }

  // Compute the placement preview for the current word/anchor/orientation.
  // Returns { cells, ok, reason, overlaps, wordRec } or null if nothing selected.
  _placement() {
    if (this.selectedIdx < 0 || !this.anchor) return null;
    const wordRec = this.players[this.turn].words[this.selectedIdx];
    if (!wordRec || wordRec.used) return null;
    const word = wordRec.w;
    const dr = this.orientation === 'V' ? 1 : 0;
    const dc = this.orientation === 'H' ? 1 : 0;
    const { r, c } = this.anchor;
    const endR = r + dr * (word.length - 1);
    const endC = c + dc * (word.length - 1);

    const cells = [];
    let ok = true, reason = '', overlaps = 0;

    if (endR >= SIZE || endC >= SIZE) {
      ok = false;
      reason = "Doesn't fit on the board";
    }

    const inWord = (rr, cc) => dr
      ? (cc === c && rr >= r && rr <= endR)
      : (rr === r && cc >= c && cc <= endC);

    for (let i = 0; i < word.length; i++) {
      const rr = r + dr * i, cc = c + dc * i;
      if (rr >= SIZE || cc >= SIZE) break;
      const cell = { r: rr, c: cc, letter: word[i], overlap: false };
      const ex = this.grid[rr][cc];
      if (ex) {
        if (ex.letter !== word[i]) {
          ok = false;
          if (!reason) reason = 'Letters clash there';
        } else {
          cell.overlap = true;
          overlaps++;
        }
      } else if (ok) {
        // New letters may only touch other words at crossing points
        const neigh = [[rr - 1, cc], [rr + 1, cc], [rr, cc - 1], [rr, cc + 1]];
        for (const [nr, nc] of neigh) {
          if (nr < 0 || nc < 0 || nr >= SIZE || nc >= SIZE) continue;
          if (inWord(nr, nc)) continue;
          if (this.grid[nr][nc]) {
            ok = false;
            reason = 'Words can only touch where they cross';
            break;
          }
        }
      }
      cells.push(cell);
    }

    if (ok) {
      // The squares just before and after the word must be open
      const br = r - dr, bc = c - dc;
      const ar = endR + dr, ac = endC + dc;
      if (br >= 0 && bc >= 0 && this.grid[br][bc]) { ok = false; reason = 'Would run into another word'; }
      if (ok && ar < SIZE && ac < SIZE && this.grid[ar][ac]) { ok = false; reason = 'Would run into another word'; }
    }

    if (ok) {
      if (!this.firstPlaced) {
        if (!cells.some(x => x.r === CENTER && x.c === CENTER)) {
          ok = false;
          reason = 'First word must cover the ★';
        }
      } else if (overlaps === 0) {
        ok = false;
        reason = 'Must cross an existing word';
      } else if (overlaps === word.length) {
        ok = false;
        reason = 'Must add new letters';
      }
    }

    return { cells, ok, reason, overlaps, wordRec };
  }

  _scoreFor(pv) {
    return MojAbble.WordValidator.getWordScore(pv.wordRec.w) + pv.overlaps * CROSS_BONUS;
  }

  _place() {
    if (this._finished) return;
    const pv = this._placement();
    if (!pv || !pv.ok) return;
    const pts = this._scoreFor(pv);
    for (const cl of pv.cells) {
      this.grid[cl.r][cl.c] = { letter: cl.letter, owner: this.turn };
    }
    pv.wordRec.used = true;
    this.players[this.turn].boardScore += pts;
    this.firstPlaced = true;
    this.passes = 0;
    this._nextTurn();
  }

  _pass() {
    if (this._finished) return;
    this.passes++;
    if (this.passes >= this.players.length) {
      this._finish();
      return;
    }
    this._nextTurn();
  }

  _nextTurn() {
    if (this.players.every(p => p.words.every(w => w.used))) {
      this._finish();
      return;
    }
    this.turn = (this.turn + 1) % this.players.length;
    this.selectedIdx = -1;
    this.anchor = null;
    this._render();
    this._ensurePlayable();
  }

  _ensurePlayable() {
    const cur = this.players[this.turn];
    if (cur.words.every(w => w.used)) this._pass();
  }

  _finish() {
    if (this._finished) return;
    this._finished = true;
    // Show the final board (incl. the last placed word) briefly before results
    this._render();
    setTimeout(() => {
      this._el.style.display = 'none';
      if (this.onFinish) this.onFinish();
    }, 900);
  }

  _render() {
    const cur = this.players[this.turn];
    const pv = this._placement();
    const pvMap = new Map();
    if (pv) for (const cl of pv.cells) pvMap.set(cl.r * SIZE + cl.c, cl);

    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const el = this._cells[r * SIZE + c];
        const g = this.grid[r][c];
        const p = pvMap.get(r * SIZE + c);
        let cls = 'bp-cell';
        let text = '';
        if (g) {
          text = g.letter;
          cls += ' filled p' + g.owner;
          if (p) cls += pv.ok ? ' pv-ok' : ' pv-bad';
        } else if (p) {
          text = p.letter;
          cls += pv.ok ? ' pv-ok' : ' pv-bad';
        } else if (r === CENTER && c === CENTER) {
          cls += ' center';
        }
        el.className = cls;
        el.textContent = text;
      }
    }

    document.getElementById('bp-turn').textContent = `${cur.name} — place a word`;
    document.getElementById('bp-scoreline').innerHTML = this.players.map((p, i) =>
      `<span class="${i === this.turn ? 'active' : ''}">${esc(p.name)}: ${(p.pileScore + p.boardScore).toLocaleString()}</span>`
    ).join('');

    document.getElementById('bp-rack-label').textContent = `${cur.name}'s words`;
    this._rackEl.innerHTML = '';
    cur.words.forEach((w, i) => {
      const chip = document.createElement('button');
      chip.className = 'bp-chip' + (w.used ? ' used' : '') + (i === this.selectedIdx ? ' sel' : '');
      chip.innerHTML = `${esc(w.w)}<span class="pts">${MojAbble.WordValidator.getWordScore(w.w)}</span>`;
      chip.onclick = () => this._selectWord(i);
      this._rackEl.appendChild(chip);
    });

    document.getElementById('bp-rotate').textContent = this.orientation === 'H' ? 'Across →' : 'Down ↓';
    document.getElementById('bp-place').disabled = !(pv && pv.ok);

    const hint = document.getElementById('bp-hint');
    if (!pv) {
      hint.textContent = this.selectedIdx < 0 ? 'Pick a word below, then tap a square' : 'Tap a square to place it';
    } else if (!pv.ok) {
      hint.textContent = pv.reason;
    } else {
      hint.textContent = `+${this._scoreFor(pv)} points (${pv.overlaps} crossing${pv.overlaps === 1 ? '' : 's'})`;
    }
  }
}

MojAbble.BoardPhase = BoardPhase;

})();
