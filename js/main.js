// MojAbble - Main Game Controller
(function() {
'use strict';

// API base URL: empty for same-origin (web), set to your server for native app
// e.g. 'https://yourdomain.com/mojabble'
const API_BASE = '';

const { Board, ScoreManager, Renderer, Effects, AudioManager, WordValidator, C } = MojAbble;

class Game {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.board = new Board();
    this.score = new ScoreManager();
    this.renderer = new Renderer(this.canvas);
    this.effects = new Effects();
    this.audio = new AudioManager();
    this.state = 'menu'; // menu, playing, gameover
    this.lastTime = 0;
    this.removingTiles = [];
    this._statsTimer = null;
    this.difficulty = 'normal';

    this._boardMode = 'global';
    this._globalScores = [];
    this._globalRare = [];
    this._sessionBestRare = null;

    // Multiplayer state
    this._mp = {
      active: false,
      roomCode: null,
      playerId: null,
      seed: null,
      opponentName: '',
      opponentScore: 0,
      opponentWords: 0,
      opponentStatus: 'playing',
      pollTimer: null,
      waitTimer: null,
      countdown: null,
      countdownTimer: null,
    };

    this._bindUI();
    this._bindInput();

    // Load saved player name
    try {
      const savedName = localStorage.getItem('mojabble_name');
      if (savedName) {
        const nameEl = document.getElementById('player-name');
        if (nameEl) nameEl.value = savedName;
      }
    } catch(e) {}

    // Re-center board on resize
    window.addEventListener('resize', () => {
      if (this.state === 'playing') {
        this.board.centerOnCanvas(this.renderer.width, this.renderer.height);
      }
    });

    // Init board tabs
    this._initBoardTabs('start');
    this._initBoardTabs('go');

    // Fetch global scores, then populate boards
    this._fetchGlobalScores().then(() => {
      this._updateBoards('start');
    });

    // Also show local best
    const best = this._getScores();
    if (best.length > 0) {
      document.getElementById('start-best').textContent = `Best: ${best[0].s.toLocaleString()} (${best[0].d})`;
    }

    this._loop(0);
  }

  _bindUI() {
    this._bindBtn("btn-start", () => this.startGame());
    this._bindBtn("btn-restart", () => this.startGame());
    this._bindBtn("btn-submit", () => this.submitWord());
    this._bindBtn("btn-clear", () => this.clearSelection());
    this._bindBtn("btn-shuffle", () => this.shuffleFreeTiles());
    this._bindBtn("btn-swap", () => this.swapTiles());
    this._bindBtn("btn-light", () => this.toggleHighlight());
    this._bindBtn("btn-giveup", () => this.giveUp());

    // Multiplayer UI
    this._bindBtn("btn-multiplayer", () => this._mpShowLobby());
    this._bindBtn("mp-create", () => this._mpCreateRoom());
    this._bindBtn("mp-join", () => this._mpJoinRoom());
    this._bindBtn("mp-back", () => this._mpHideAll());
    this._bindBtn("mp-cancel", () => this._mpCancel());
    this._bindBtn("btn-match-menu", () => this._mpBackToMenu());
    document.getElementById('mp-join-code').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this._mpJoinRoom();
    });

    // Difficulty selection
    document.querySelectorAll('.diff-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        this.difficulty = btn.dataset.diff;
      });
    });

    document.addEventListener('keydown', (e) => {
      if (this.state !== 'playing') {
        // Don't trigger start when typing in inputs or on MP screens
        if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
        const mpVisible = document.getElementById('mp-lobby').style.display === 'flex'
          || document.getElementById('mp-waiting').style.display === 'flex'
          || document.getElementById('match-result').style.display === 'flex';
        if (mpVisible) return;
        if (e.key === 'Enter' || e.key === ' ') this.startGame();
        return;
      }
      if (e.key === 'Enter') this.submitWord();
      if (e.key === 'Escape') this.clearSelection();
      if (e.key === 'Backspace') {
        e.preventDefault();
        this.deselectLast();
      }
    });
  }

  _bindBtn(id, fn) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("click", fn);
    el.addEventListener("touchend", (e) => { e.preventDefault(); fn(); });
  }

  _bindInput() {
    let lastTouchTime = 0;
    const getMousePos = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    };

    this.canvas.addEventListener('mousemove', (e) => {
      if (this.state !== 'playing') return;
      const pos = getMousePos(e);
      const tile = this.board.getTileAtPos(pos.x, pos.y);
      if (tile !== this.board.hoveredTile) {
        this.board.hoveredTile = tile;
        if (tile && this.board.isFree(tile)) {
          this.canvas.style.cursor = 'pointer';
        } else {
          this.canvas.style.cursor = 'default';
        }
      }
    });

    // Shared tile-tap handler (mouse + touch)
    const handleTileTap = (sx, sy) => {
      this.audio._ensureContext();
      const tile = this.board.getTileAtPos(sx, sy);
      if (!tile) return;

      if (tile.selected) {
        this.board.deselectTile(tile);
        this.audio.playDeselect();
        this._updateWordArea();
        return;
      }

      if (this.board.isFree(tile)) {
        if (this.board.selectTile(tile)) {
          tile.punchTimer = 0;
          this.audio.playSelect(this.board.selectedTiles.length);
          const sp = this.board.tileScreenXY(tile);
          this.effects.sparkleTile(sp.x, sp.y);
          this.effects.ringBurst(sp.cx, sp.cy, '#ffd700', 32 * this.board.scale);
          this._updateWordArea();
        }
      }
    };

    this.canvas.addEventListener('click', (e) => {
      if (Date.now() - lastTouchTime < 500) return;
      if (this.state !== 'playing') return;
      const pos = getMousePos(e);
      handleTileTap(pos.x, pos.y);
    });

    // Touch support — full suite
    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (this.state !== 'playing') return;
      const touch = e.touches[0];
      const rect = this.canvas.getBoundingClientRect();
      lastTouchTime = Date.now();
      handleTileTap(touch.clientX - rect.left, touch.clientY - rect.top);
    }, { passive: false });

    this.canvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
    this.canvas.addEventListener('touchend', (e) => e.preventDefault(), { passive: false });
  }

  startGame(seed = null) {
    document.getElementById('start-screen').style.display = 'none';
    document.getElementById('game-over').style.display = 'none';
    document.getElementById('mp-waiting').style.display = 'none';

    // Refresh start screen boards for next time
    this._boardMode = 'global';
    this._fetchGlobalScores().then(() => this._updateBoards('start'));
    const best = this._getScores();
    if (best.length > 0) {
      document.getElementById('start-best').textContent = `Personal best: ${best[0].s.toLocaleString()} (${best[0].d})`;
    }

    this.board.init('classic', this.difficulty, seed);
    this.board.centerOnCanvas(this.renderer.width, this.renderer.height);
    this.score.reset();
    this.removingTiles = [];
    this.renderer.bgWord = '';
    this._sessionBestRare = null;
    this.state = 'playing';

    // Show opponent bar if multiplayer
    const oppBar = document.getElementById('opponent-bar');
    if (this._mp.active) {
      document.getElementById('opp-name').textContent = this._mp.opponentName;
      document.getElementById('opp-score').textContent = '0';
      document.getElementById('opp-words').textContent = '0 words';
      oppBar.classList.add('visible');
      this._mpStartPolling();
    } else {
      oppBar.classList.remove('visible');
    }

    this._updateUI();
    this._updateWordArea();
  }

  submitWord() {
    if (this.state !== 'playing') return;
    const word = this.board.getCurrentWord();

    if (word.length < C.MIN_WORD) {
      this._invalidWord();
      return;
    }

    if (!WordValidator.isValid(word)) {
      this._invalidWord();
      return;
    }

    // Valid word!
    const result = this.score.submitWord(word, performance.now());

    // Visual juice
    this._wordSuccess(result);

    // Remove tiles with staggered timing
    const removed = this.board.removeSelected();
    for (let i = 0; i < removed.length; i++) {
      removed[i].removeDelay = i * 0.08;
    }
    this.removingTiles.push(...removed);

    this._updateWordArea();
    this._updateUI();

    // Check game over
    setTimeout(() => {
      if (this.board.getRemainingCount() === 0) {
        this._boardCleared();
      } else if (!this.board.canFormWord()) {
        this._gameOver();
      }
    }, 800);
  }

  clearSelection() {
    this.board.deselectAll();
    this._updateWordArea();
  }

  deselectLast() {
    const tile = this.board.deselectLast();
    if (tile) {
      this.audio.playDeselect();
      this._updateWordArea();
    }
  }

  shuffleFreeTiles() {
    if (this.state !== 'playing') return;

    const SHUFFLE_COST = 50;
    this.board.shuffleFreeLetters();

    // Penalty
    this.score.score -= SHUFFLE_COST;
    this.score.combo = 0;
    this._updateComboDisplay();

    // Visual feedback: sparkle all free tiles + penalty popup
    const freeTiles = this.board.getFreeTiles();
    for (const tile of freeTiles) {
      const sp = this.board.tileScreenXY(tile);
      this.effects.sparkleTile(sp.x, sp.y);
    }
    this.effects.shake(4, 0.2);
    this.effects.flashScreen('#6666ff', 0.12);

    const wordArea = document.getElementById('word-area');
    const rect = wordArea.getBoundingClientRect();
    this.effects.addPopup(rect.left + rect.width / 2, rect.top - 20, `-${SHUFFLE_COST} SHUFFLE`, '#8888ff', 22);

    this.audio.playDeselect();
    this._updateWordArea();
  }

  swapTiles() {
    if (this.state !== 'playing') return;
    if (this.board.selectedTiles.length === 0) return;

    const PER_TILE_COST = 25;
    const count = this.board.selectedTiles.length;
    const totalCost = count * PER_TILE_COST;

    // Visual feedback from selected tile positions before swap
    for (const tile of this.board.selectedTiles) {
      const sp = this.board.tileScreenXY(tile);
      this.effects.sparkleTile(sp.x, sp.y);
    }

    this.board.swapSelectedLetters();

    // Penalty
    this.score.score -= totalCost;
    this.score.combo = 0;
    this._updateComboDisplay();

    this.effects.shake(3, 0.15);
    this.effects.flashScreen('#ffaa00', 0.1);

    const wordArea = document.getElementById('word-area');
    const rect = wordArea.getBoundingClientRect();
    this.effects.addPopup(rect.left + rect.width / 2, rect.top - 20, `-${totalCost} SWAP`, '#ffaa44', 22);

    this.audio.playDeselect();
    this._updateWordArea();
    this._updateUI();
  }

  giveUp() {
    if (this.state !== 'playing') return;
    this.board.deselectAll();
    this._updateWordArea();
    this._gameOver();
  }

  toggleHighlight() {
    this.board.showHighlight = !this.board.showHighlight;
    document.getElementById('btn-light').classList.toggle('off', !this.board.showHighlight);
  }

  _invalidWord() {
    this.audio.playWordFail();

    // Shake the word area
    const wordArea = document.getElementById('word-area');
    wordArea.classList.add('shake', 'flash-invalid');
    setTimeout(() => wordArea.classList.remove('shake', 'flash-invalid'), 500);

    // Shake selected tiles + red particles
    for (const tile of this.board.selectedTiles) {
      const startTime = performance.now();
      const shakeTile = () => {
        const elapsed = performance.now() - startTime;
        if (elapsed > 500) {
          tile.shakeX = 0;
          return;
        }
        const progress = elapsed / 500;
        tile.shakeX = Math.sin(progress * Math.PI * 8) * 8 * (1 - progress);
        requestAnimationFrame(shakeTile);
      };
      shakeTile();

      // Red particle spray from each tile (scaled coords)
      const sp = this.board.tileScreenXY(tile);
      for (let i = 0; i < 5; i++) {
        this.effects.particles.push(new MojAbble.Particle(
          sp.cx, sp.cy,
          (Math.random() - 0.5) * 120,
          -(40 + Math.random() * 60),
          `hsl(${350 + Math.random() * 20}, 80%, ${50 + Math.random() * 20}%)`,
          3 + Math.random() * 3,
          0.4 + Math.random() * 0.3,
          200
        ));
      }
    }

    this.effects.flashScreen('#ff2244', 0.2);

    // Reset combo
    this.score.combo = 0;
    this._updateComboDisplay();
  }

  _wordSuccess(result) {
    // Sound
    this.audio.playWordSuccess(result.total, result.combo);

    // Combo sound
    if (result.combo > 1) {
      setTimeout(() => this.audio.playCombo(result.combo), 150);
    }

    // Staggered particle explosions from each tile (scaled coords)
    const intensity = Math.min(3, result.total / 20);
    const selectedCopy = [...this.board.selectedTiles];
    for (let i = 0; i < selectedCopy.length; i++) {
      const tile = selectedCopy[i];
      const delay = i * 80;
      setTimeout(() => {
        const sp = this.board.tileScreenXY(tile);
        const hue = tile.score >= 8 ? 0 : tile.score >= 4 ? 30 : 45;
        this.effects.explodeTile(sp.x, sp.y, `hsl(${hue}, 90%, 60%)`, intensity);
        this.effects.ringBurst(sp.cx, sp.cy, `hsl(${hue}, 90%, 70%)`, (40 + intensity * 10) * this.board.scale);
        if (tile.score >= 4) {
          this.effects.addPopup(sp.cx, sp.y - 5, `+${tile.score}`, `hsl(${hue}, 90%, 70%)`, 16);
        }
      }, delay);
    }

    // Screen shake based on score
    const shakeIntensity = Math.min(15, 3 + result.total / 8);
    this.effects.shake(shakeIntensity, 0.3 + intensity * 0.1);

    // Flash
    const flashAlpha = Math.min(0.35, 0.1 + result.total / 100);
    this.effects.flashScreen('#ffd700', flashAlpha);

    // Background pulse
    this.effects.pulseBg(0.2 + intensity * 0.1);

    // Score popup
    const wordArea = document.getElementById('word-area');
    const rect = wordArea.getBoundingClientRect();
    const popupX = rect.left + rect.width / 2;
    const popupY = rect.top - 20;

    // Main score popup
    this.effects.addPopup(popupX, popupY, `+${result.total}`, '#ffd700', 36 + intensity * 6);

    // Word popup + background tiling
    const word = this.board.getCurrentWord();
    this.effects.addPopup(popupX, popupY - 40, word.toUpperCase(), '#ffffff', 20);
    this.renderer.setBgWord(word);

    // Combo popup
    if (result.combo > 1) {
      setTimeout(() => {
        this.effects.addPopup(
          popupX, popupY + 30,
          `${result.combo}x COMBO!`,
          result.combo >= 5 ? '#ff4400' : '#ff8800',
          24 + result.combo * 2
        );
      }, 200);
    }

    // Length bonus popup
    if (result.lengthBonus > 0) {
      setTimeout(() => {
        this.effects.addPopup(
          popupX + 80, popupY,
          `+${result.lengthBonus} LENGTH`,
          '#88ff88',
          18
        );
      }, 100);
    }

    // Combo display
    this._updateComboDisplay();

    // Track rarest words + show stats toast
    const rawRarity = result.baseScore + result.lengthBonus;
    this._saveRareWord(word, rawRarity);
    this._showWordStats(word, result);
  }

  _showWordStats(word, result) {
    const panel = document.getElementById('word-stats');
    const wordEl = panel.querySelector('.ws-word');
    const rarityEl = panel.querySelector('.ws-rarity');
    const scoreLine = panel.querySelector('.ws-score-line');
    const factEl = panel.querySelector('.ws-fact');

    // Rarity based on base score + length bonus (before combo)
    const raw = result.baseScore + result.lengthBonus;
    const rarity = raw >= 51 ? { label: '\u2605\u2605\u2605\u2605\u2605 LEGENDARY', bg: 'rgba(255,215,0,0.2)', color: '#ffd700' }
                 : raw >= 29 ? { label: '\u2605\u2605\u2605\u2605 EPIC', bg: 'rgba(255,140,0,0.2)', color: '#ff8c00' }
                 : raw >= 16 ? { label: '\u2605\u2605\u2605 RARE', bg: 'rgba(168,85,247,0.2)', color: '#a855f7' }
                 : raw >= 8  ? { label: '\u2605\u2605 UNCOMMON', bg: 'rgba(59,130,246,0.2)', color: '#3b82f6' }
                 :             { label: '\u2605 COMMON', bg: 'rgba(34,197,94,0.2)', color: '#22c55e' };

    wordEl.textContent = word.toUpperCase();
    rarityEl.textContent = rarity.label;
    rarityEl.style.background = rarity.bg;
    rarityEl.style.color = rarity.color;

    // Score breakdown
    let line = `+${result.baseScore}`;
    if (result.lengthBonus > 0) line += ` +${result.lengthBonus} length`;
    if (result.combo > 1) line += ` \u00d7${result.combo} combo`;
    line += ` = ${result.total}`;
    scoreLine.textContent = line;

    // Show immediately, fetch fact async
    factEl.textContent = '\u2022\u2022\u2022';
    panel.classList.add('visible');

    if (this._statsTimer) clearTimeout(this._statsTimer);

    // Fetch definition + origin
    fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word.toLowerCase()}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data || !data[0]) { factEl.textContent = this._fallbackFact(word); return; }
        const entry = data[0];
        let html = '';
        const m = entry.meanings && entry.meanings[0];
        if (m) {
          const def = m.definitions && m.definitions[0] && m.definitions[0].definition;
          if (def) html += `<em>${m.partOfSpeech}</em> \u2014 ${def}`;
        }
        if (entry.origin) {
          html += `<span class="ws-origin">${entry.origin}</span>`;
        }
        factEl.innerHTML = html || this._fallbackFact(word);
      })
      .catch(() => { factEl.textContent = this._fallbackFact(word); });

    this._statsTimer = setTimeout(() => panel.classList.remove('visible'), 6000);
  }

  _fallbackFact(word) {
    const vowels = word.split('').filter(c => 'aeiou'.includes(c.toLowerCase())).length;
    const unique = new Set(word.toLowerCase()).size;
    return `${word.length}-letter word \u00b7 ${Math.round((vowels / word.length) * 100)}% vowels \u00b7 ${unique} unique letters`;
  }

  // ── Scoreboard & Rare Words (localStorage + server) ─────────────

  _getPlayerName() {
    const el = document.getElementById('player-name');
    const name = (el ? el.value.trim() : '') || 'Anonymous';
    try { localStorage.setItem('mojabble_name', name); } catch(e) {}
    return name;
  }

  _saveScore() {
    const entry = {
      n: this._getPlayerName(),
      s: Math.round(this.score.score),
      w: this.score.wordsFound,
      bw: this.score.bestWord.toUpperCase(),
      bws: this.score.bestWordScore,
      mc: this.score.maxCombo,
      d: this.difficulty,
      dt: new Date().toLocaleDateString()
    };

    // Save locally
    let list = [];
    try { list = JSON.parse(localStorage.getItem('mojabble_scores') || '[]'); } catch(e) {}
    list.push(entry);
    list.sort((a, b) => b.s - a.s);
    list = list.slice(0, 10);
    localStorage.setItem('mojabble_scores', JSON.stringify(list));

    // Submit to server (best rare word for this session too)
    const payload = { ...entry };
    if (this._sessionBestRare) {
      payload.rw = this._sessionBestRare.w;
      payload.rr = this._sessionBestRare.r;
    }
    this._submitToServer(payload);

    return { list, rank: list.findIndex(e => e === entry) };
  }

  _submitToServer(payload) {
    fetch(`${API_BASE}/scores.php?action=submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      if (data && data.ok) {
        // Refresh global boards after submission
        this._fetchGlobalScores().then(() => {
          if (this._boardMode === 'global') {
            const prefix = this.state === 'gameover' ? 'go' : 'start';
            this._renderBoards(prefix, this._boardMode, Math.round(this.score.score));
          }
        });
      }
    })
    .catch(() => {});
  }

  _fetchGlobalScores() {
    return fetch(`${API_BASE}/scores.php?action=scores`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          this._globalScores = (data.scores || []).slice(0, 10);
          this._globalRare = (data.rare || []).slice(0, 10);
        }
      })
      .catch(() => {});
  }

  _saveRareWord(word, rarity) {
    const key = word.toUpperCase();

    // Track session best rare word for server submission
    if (!this._sessionBestRare || rarity > this._sessionBestRare.r) {
      this._sessionBestRare = { w: key, r: rarity };
    }

    let list = [];
    try { list = JSON.parse(localStorage.getItem('mojabble_rare') || '[]'); } catch(e) {}
    if (!list.find(e => e.w === key)) {
      list.push({ w: key, r: rarity, d: this.difficulty, dt: new Date().toLocaleDateString() });
      list.sort((a, b) => b.r - a.r);
      list = list.slice(0, 10);
      localStorage.setItem('mojabble_rare', JSON.stringify(list));
    }
    return list;
  }

  _getScores() {
    try { return JSON.parse(localStorage.getItem('mojabble_scores') || '[]'); } catch(e) { return []; }
  }

  _getRareWords() {
    try { return JSON.parse(localStorage.getItem('mojabble_rare') || '[]'); } catch(e) { return []; }
  }

  _renderBoardList(olEl, items, mode, highlightScore) {
    olEl.innerHTML = '';
    if (items.length === 0) {
      olEl.innerHTML = '<div class="board-empty">No entries yet</div>';
      return;
    }
    for (let i = 0; i < items.length; i++) {
      const li = document.createElement('li');
      const e = items[i];
      if (mode === 'score') {
        const isHl = highlightScore !== undefined && e.s === highlightScore && !li.classList.contains('highlight');
        if (isHl && i === items.findIndex(x => x.s === highlightScore)) li.classList.add('highlight');
        const nameTag = e.n ? `<span class="bl-player">${this._escHtml(e.n)}</span>` : '';
        li.innerHTML = `<span class="bl-rank">${i+1}.</span><span class="bl-name">${this._escHtml(e.bw || '-')}${nameTag}</span><span class="bl-val">${e.s.toLocaleString()}</span><span class="bl-diff">${e.d}</span>`;
      } else {
        const nameTag = e.n ? `<span class="bl-player">${this._escHtml(e.n)}</span>` : '';
        li.innerHTML = `<span class="bl-rank">${i+1}.</span><span class="bl-name">${this._escHtml(e.w)}${nameTag}</span><span class="bl-val">${e.r} pts</span><span class="bl-diff">${e.d}</span>`;
      }
      olEl.appendChild(li);
    }
  }

  _escHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  _renderBoards(targetPrefix, mode, currentScore) {
    let scores, rare;
    if (mode === 'global') {
      scores = this._globalScores || [];
      rare = this._globalRare || [];
    } else {
      scores = this._getScores();
      rare = this._getRareWords();
    }
    this._renderBoardList(document.getElementById(targetPrefix + '-scores'), scores, 'score', currentScore);
    this._renderBoardList(document.getElementById(targetPrefix + '-rare'), rare, 'rare');
  }

  _updateBoards(targetPrefix, currentScore) {
    this._renderBoards(targetPrefix, this._boardMode || 'global', currentScore);
  }

  _initBoardTabs(prefix) {
    const tabsEl = document.getElementById(prefix + '-board-tabs');
    if (!tabsEl) return;
    tabsEl.querySelectorAll('.board-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        tabsEl.querySelectorAll('.board-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this._boardMode = btn.dataset.board;
        const score = this.state === 'gameover' ? Math.round(this.score.score) : undefined;
        this._renderBoards(prefix, this._boardMode, score);
      });
    });
  }

  // ── Multiplayer ─────────────────────────────────────────────────

  _mpShowLobby() {
    document.getElementById('start-screen').style.display = 'none';
    document.getElementById('mp-lobby').style.display = 'flex';
    document.getElementById('mp-error').textContent = '';
    document.getElementById('mp-join-code').value = '';
  }

  _mpHideAll() {
    document.getElementById('mp-lobby').style.display = 'none';
    document.getElementById('mp-waiting').style.display = 'none';
    document.getElementById('match-result').style.display = 'none';
    document.getElementById('start-screen').style.display = 'flex';
  }

  _mpBackToMenu() {
    this._mpCleanup();
    document.getElementById('match-result').style.display = 'none';
    document.getElementById('start-screen').style.display = 'flex';
  }

  _mpCancel() {
    this._mpCleanup();
    document.getElementById('mp-waiting').style.display = 'none';
    document.getElementById('mp-lobby').style.display = 'flex';
  }

  _mpCleanup() {
    if (this._mp.pollTimer) clearInterval(this._mp.pollTimer);
    if (this._mp.waitTimer) clearInterval(this._mp.waitTimer);
    if (this._mp.countdownTimer) clearInterval(this._mp.countdownTimer);
    this._mp.active = false;
    this._mp.roomCode = null;
    this._mp.playerId = null;
    this._mp.pollTimer = null;
    this._mp.waitTimer = null;
    this._mp.countdown = null;
    this._mp.countdownTimer = null;
    document.getElementById('opponent-bar').classList.remove('visible');
    document.getElementById('mp-countdown').classList.remove('visible');
  }

  _mpCreateRoom() {
    const name = this._getPlayerName();
    const errEl = document.getElementById('mp-error');
    errEl.textContent = '';

    fetch(`${API_BASE}/room.php?action=create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, difficulty: this.difficulty })
    })
    .then(r => r.ok ? r.json() : Promise.reject(r))
    .then(data => {
      this._mp.roomCode = data.room;
      this._mp.playerId = data.playerId;
      this._mp.seed = data.seed;

      // Show waiting screen
      document.getElementById('mp-lobby').style.display = 'none';
      document.getElementById('mp-waiting').style.display = 'flex';
      document.getElementById('mp-room-display').textContent = data.room;

      // Poll for opponent joining
      this._mp.waitTimer = setInterval(() => this._mpPollWaiting(), 1500);
    })
    .catch(() => {
      errEl.textContent = 'Could not create room. Is the server running?';
    });
  }

  _mpJoinRoom() {
    const code = document.getElementById('mp-join-code').value.trim().toUpperCase();
    const errEl = document.getElementById('mp-error');
    errEl.textContent = '';

    if (code.length !== 4) {
      errEl.textContent = 'Enter a 4-character room code';
      return;
    }

    const name = this._getPlayerName();

    fetch(`${API_BASE}/room.php?action=join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, room: code })
    })
    .then(r => {
      if (!r.ok) return r.json().then(d => Promise.reject(d));
      return r.json();
    })
    .then(data => {
      this._mp.active = true;
      this._mp.roomCode = code;
      this._mp.playerId = data.playerId;
      this._mp.seed = data.seed;
      this._mp.opponentName = data.opponent;
      this.difficulty = data.difficulty;

      // Update difficulty selector to match room
      document.querySelectorAll('.diff-btn').forEach(b => {
        b.classList.toggle('selected', b.dataset.diff === data.difficulty);
      });

      // Hide lobby, start game
      document.getElementById('mp-lobby').style.display = 'none';
      this.startGame(this._mp.seed);
    })
    .catch(err => {
      errEl.textContent = err.error || 'Could not join room';
    });
  }

  _mpPollWaiting() {
    fetch(`${API_BASE}/room.php?action=poll&room=${this._mp.roomCode}&player=${this._mp.playerId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        if (data.status === 'playing' && data.opponent) {
          // Opponent joined! Start the game
          clearInterval(this._mp.waitTimer);
          this._mp.waitTimer = null;
          this._mp.active = true;
          this._mp.opponentName = data.opponent.name;

          this.startGame(this._mp.seed);
        }
      })
      .catch(() => {});
  }

  _mpStartPolling() {
    // Poll opponent state every 2 seconds
    this._mp.pollTimer = setInterval(() => this._mpPollGame(), 2000);
  }

  _mpPollGame() {
    if (!this._mp.active || !this._mp.roomCode) return;

    // Send our current stats
    fetch(`${API_BASE}/room.php?action=update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        room: this._mp.roomCode,
        player: this._mp.playerId,
        score: Math.round(this.score.score),
        words: this.score.wordsFound,
        bestWord: this.score.bestWord.toUpperCase(),
        bestWordScore: this.score.bestWordScore,
        maxCombo: this.score.maxCombo
      })
    }).catch(() => {});

    // Fetch opponent state
    fetch(`${API_BASE}/room.php?action=poll&room=${this._mp.roomCode}&player=${this._mp.playerId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data || !data.opponent) return;

        this._mp.opponentScore = data.opponent.score;
        this._mp.opponentWords = data.opponent.words;
        this._mp.opponentStatus = data.opponent.status;

        // Update opponent bar
        document.getElementById('opp-score').textContent = data.opponent.score.toLocaleString();
        document.getElementById('opp-words').textContent = `${data.opponent.words} words`;

        // Handle countdown (opponent finished, we have 30s)
        if (data.countdown != null && data.countdown > 0 && this.state === 'playing') {
          this._mpShowCountdown(data.countdown);
        }

        // Both finished
        if (data.status === 'finished') {
          this._mpShowResult(data.opponent);
        }

        // Opponent disconnected
        if (data.disconnected && this.state === 'playing') {
          this._mpOpponentLeft();
        }
      })
      .catch(() => {});
  }

  _mpShowCountdown(seconds) {
    const el = document.getElementById('mp-countdown');
    el.classList.add('visible');
    el.textContent = seconds;

    if (!this._mp.countdownTimer) {
      this._mp.countdown = seconds;
      this._mp.countdownTimer = setInterval(() => {
        this._mp.countdown--;
        el.textContent = this._mp.countdown;
        if (this._mp.countdown <= 0) {
          clearInterval(this._mp.countdownTimer);
          this._mp.countdownTimer = null;
          el.classList.remove('visible');
          if (this.state === 'playing') {
            this.state = 'gameover';
            document.getElementById('opponent-bar').classList.remove('visible');
            this._mpFinish();
          }
        }
      }, 1000);
    }
  }

  _mpFinish() {
    if (this._mp.pollTimer) clearInterval(this._mp.pollTimer);
    this._mp.pollTimer = null;

    // Deduct remaining tile penalty
    const penalty = this.board.getRemainingPenalty();
    if (penalty > 0) {
      this.score.score -= penalty;
    }

    // Send final score
    fetch(`${API_BASE}/room.php?action=finish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        room: this._mp.roomCode,
        player: this._mp.playerId,
        score: Math.round(this.score.score),
        words: this.score.wordsFound,
        bestWord: this.score.bestWord.toUpperCase(),
        bestWordScore: this.score.bestWordScore,
        maxCombo: this.score.maxCombo
      })
    })
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      if (data && data.finished) {
        // Both done - fetch final state and show result
        return fetch(`${API_BASE}/room.php?action=poll&room=${this._mp.roomCode}&player=${this._mp.playerId}`)
          .then(r => r.ok ? r.json() : null);
      }
      // We finished first - wait for opponent via polling
      this._mp.pollTimer = setInterval(() => {
        fetch(`${API_BASE}/room.php?action=poll&room=${this._mp.roomCode}&player=${this._mp.playerId}`)
          .then(r => r.ok ? r.json() : null)
          .then(pollData => {
            if (pollData && pollData.status === 'finished' && pollData.opponent) {
              this._mpShowResult(pollData.opponent);
            }
          })
          .catch(() => {});
      }, 1500);
      return null;
    })
    .then(data => {
      if (data && data.opponent) {
        this._mpShowResult(data.opponent);
      }
    })
    .catch(() => {});
  }

  _mpShowResult(opponent) {
    if (this._mp.pollTimer) clearInterval(this._mp.pollTimer);
    this._mp.pollTimer = null;

    this.state = 'gameover';
    document.getElementById('opponent-bar').classList.remove('visible');
    document.getElementById('mp-countdown').classList.remove('visible');

    const myScore = Math.round(this.score.score);
    const oppScore = opponent.score;
    const myName = this._getPlayerName();

    const titleEl = document.getElementById('match-title');
    if (myScore > oppScore) {
      titleEl.textContent = 'You Win!';
      titleEl.style.color = '#ffd700';
      document.getElementById('match-you').classList.add('winner');
      document.getElementById('match-opp').classList.remove('winner');
    } else if (oppScore > myScore) {
      titleEl.textContent = 'You Lose';
      titleEl.style.color = '#f87171';
      document.getElementById('match-opp').classList.add('winner');
      document.getElementById('match-you').classList.remove('winner');
    } else {
      titleEl.textContent = 'Tie!';
      titleEl.style.color = '#60a5fa';
      document.getElementById('match-you').classList.remove('winner');
      document.getElementById('match-opp').classList.remove('winner');
    }

    document.getElementById('match-you-name').textContent = myName;
    document.getElementById('match-you-score').textContent = myScore.toLocaleString();
    document.getElementById('match-you-stats').innerHTML =
      `${this.score.wordsFound} words<br>Best: ${this.score.bestWord.toUpperCase()} (${this.score.bestWordScore})<br>${this.score.maxCombo}x max combo`;

    document.getElementById('match-opp-name').textContent = opponent.name;
    document.getElementById('match-opp-score').textContent = oppScore.toLocaleString();
    document.getElementById('match-opp-stats').innerHTML =
      `${opponent.words} words<br>Best: ${opponent.bestWord || '-'} (${opponent.bestWordScore || 0})<br>${opponent.maxCombo || 0}x max combo`;

    document.getElementById('match-result').style.display = 'flex';

    // Also save score locally
    this._saveScore();
  }

  _mpOpponentLeft() {
    if (this._mp.pollTimer) clearInterval(this._mp.pollTimer);
    this._mp.pollTimer = null;

    // Opponent disconnected - end match, you win by default
    this.state = 'gameover';
    document.getElementById('opponent-bar').classList.remove('visible');
    document.getElementById('mp-countdown').classList.remove('visible');

    const titleEl = document.getElementById('match-title');
    titleEl.textContent = 'Opponent Left';
    titleEl.style.color = '#ffd700';

    const myName = this._getPlayerName();
    const myScore = Math.round(this.score.score);

    document.getElementById('match-you').classList.add('winner');
    document.getElementById('match-opp').classList.remove('winner');
    document.getElementById('match-you-name').textContent = myName;
    document.getElementById('match-you-score').textContent = myScore.toLocaleString();
    document.getElementById('match-you-stats').innerHTML =
      `${this.score.wordsFound} words<br>Best: ${this.score.bestWord.toUpperCase()} (${this.score.bestWordScore})<br>${this.score.maxCombo}x max combo`;

    document.getElementById('match-opp-name').textContent = this._mp.opponentName;
    document.getElementById('match-opp-score').textContent = '-';
    document.getElementById('match-opp-stats').innerHTML = 'Disconnected';

    document.getElementById('match-result').style.display = 'flex';
    this._saveScore();
    this._mpCleanup();
  }

  _boardCleared() {
    this.effects.celebrate(this.renderer.width / 2, this.renderer.height / 2);
    this.audio.playCelebration();

    // Bonus score
    const clearBonus = 500;
    this.score.score += clearBonus;
    this.effects.addPopup(
      this.renderer.width / 2, this.renderer.height / 2 - 50,
      `BOARD CLEARED! +${clearBonus}`,
      '#00ffaa',
      40
    );

    setTimeout(() => this._gameOver(), 2000);
  }

  _gameOver() {
    this.state = 'gameover';
    document.getElementById('opponent-bar').classList.remove('visible');
    document.getElementById('mp-countdown').classList.remove('visible');

    if (this._mp.active) {
      // Multiplayer: send finish, then show match result
      this._mpFinish();
      return;
    }

    // Solo: show normal game-over screen
    this._showSoloGameOver();
  }

  _showSoloGameOver() {
    // Deduct remaining tile penalty
    const penalty = this.board.getRemainingPenalty();
    if (penalty > 0) {
      this.score.score -= penalty;
    }

    const go = document.getElementById('game-over');
    go.style.display = 'flex';
    const finalScore = Math.round(this.score.score);
    document.getElementById('final-score').textContent = finalScore.toLocaleString();
    const penaltyLine = penalty > 0 ? `Remaining tiles penalty: -${penalty}<br>` : '';
    document.getElementById('game-stats').innerHTML =
      `Words found: ${this.score.wordsFound}<br>` +
      `Best word: ${this.score.bestWord.toUpperCase()} (${this.score.bestWordScore} pts)<br>` +
      `Max combo: ${this.score.maxCombo}x<br>` +
      `Letters used: ${this.score.totalLetters}<br>` +
      penaltyLine +
      `Difficulty: ${this.difficulty}`;

    // Save score locally + submit to server
    this._saveScore();

    // Reset to global view for game-over boards
    this._boardMode = 'global';
    const goTabs = document.getElementById('go-board-tabs');
    if (goTabs) {
      goTabs.querySelectorAll('.board-tab').forEach(b => {
        b.classList.toggle('active', b.dataset.board === 'global');
      });
    }
    this._updateBoards('go', finalScore);
  }

  _updateWordArea() {
    const area = document.getElementById('word-area');
    const placeholder = document.getElementById('word-area-placeholder');
    const selected = this.board.selectedTiles;
    const submitBtn = document.getElementById('btn-submit');
    const swapBtn = document.getElementById('btn-swap');

    // Clear existing letter tiles
    area.querySelectorAll('.letter-tile').forEach(el => el.remove());

    if (selected.length === 0) {
      placeholder.style.display = 'block';
      submitBtn.disabled = true;
      swapBtn.disabled = true;
      return;
    }

    placeholder.style.display = 'none';
    submitBtn.disabled = selected.length < C.MIN_WORD;
    swapBtn.disabled = false;

    for (let i = 0; i < selected.length; i++) {
      const tile = selected[i];
      const el = document.createElement('div');
      el.className = 'letter-tile';
      el.innerHTML = `${tile.letter}<span class="pts">${tile.score}</span>`;
      el.style.animationDelay = `${i * 0.03}s`;
      el.addEventListener('click', () => {
        this.board.deselectTile(tile);
        this.audio.playDeselect();
        this._updateWordArea();
      });
      area.appendChild(el);
    }
  }

  _updateUI() {
    document.getElementById('tiles-count').textContent = this.board.getRemainingCount();
  }

  _updateComboDisplay() {
    const el = document.getElementById('combo-display');
    const text = document.getElementById('combo-text');
    if (this.score.combo > 1) {
      el.classList.add('active');
      text.textContent = `${this.score.combo}x COMBO`;
      el.style.fontSize = `${24 + this.score.combo * 4}px`;
      // Color escalation
      const hue = Math.max(0, 40 - this.score.combo * 8);
      el.style.color = `hsl(${hue}, 100%, 55%)`;
      el.style.textShadow = `0 0 ${20 + this.score.combo * 5}px hsla(${hue}, 100%, 55%, 0.6)`;
    } else {
      el.classList.remove('active');
    }
  }

  _loop(timestamp) {
    const dt = Math.min(0.1, (timestamp - this.lastTime) / 1000);
    this.lastTime = timestamp;

    if (this.state === 'playing') {
      // Update removing tiles (staggered)
      this.removingTiles = this.removingTiles.filter(tile => {
        if (tile.removeDelay > 0) {
          tile.removeDelay -= dt;
          return true;
        }
        tile.removeTimer += dt * 2.0;
        if (tile.removeTimer >= 1) {
          this.board.finalizeRemoval(tile);
          return false;
        }
        return true;
      });

      // Update tile flip animations (shuffle/swap)
      for (const tile of this.board.getActiveTiles()) {
        if (tile.flipTimer >= 0) {
          if (tile.flipDelay > 0) {
            tile.flipDelay -= dt;
          } else {
            tile.flipTimer += dt * 2.0;

            // At midpoint: swap letter + sparkle
            if (tile.flipTimer >= 0.5 && tile.pendingLetter) {
              tile.letter = tile.pendingLetter;
              tile.score = tile.pendingScore;
              tile.pendingLetter = null;
              const sp = this.board.tileScreenXY(tile);
              this.effects.sparkleTile(sp.x, sp.y);
              this.effects.ringBurst(sp.cx, sp.cy, '#aaaaff', 28 * this.board.scale);
              this.audio.playTick();
            }

            if (tile.flipTimer >= 1) {
              tile.flipTimer = -1;
            }
          }
        }

        // Selection punch decay
        if (tile.punchTimer >= 0) {
          tile.punchTimer += dt * 4.5;
          if (tile.punchTimer >= 1) {
            tile.punchTimer = -1;
          }
        }
      }

      // Update effects
      this.effects.update(dt);

      // Update score display
      this.score.updateDisplay(dt);
      this.score.checkComboTimeout(performance.now());
      if (this.score.combo === 0) {
        document.getElementById('combo-display').classList.remove('active');
      }

      // Update score number
      document.getElementById('score-value').textContent =
        Math.round(this.score.displayScore).toLocaleString();

      // Render
      this.renderer.render(this.board, this.effects, dt);
    }

    requestAnimationFrame((t) => this._loop(t));
  }
}

// Boot - load dictionary then start
window.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('btn-start');
  btn.disabled = true;
  btn.textContent = 'Loading...';

  MojAbble.loadDictionary().then(() => {
    btn.disabled = false;
    btn.textContent = 'Play';
    window.mojabble = new Game();
  }).catch(() => {
    btn.disabled = false;
    btn.textContent = 'Play';
    window.mojabble = new Game();
  });
});

})();
