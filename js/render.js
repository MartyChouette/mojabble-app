// MojAbble - Renderer + Effects
(function() {
'use strict';

window.MojAbble = window.MojAbble || {};
const C = MojAbble.C;

// ─── Particle ────────────────────────────────────────────────────────
class Particle {
  constructor(x, y, vx, vy, color, size, life, gravity) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.color = color;
    this.size = size;
    this.life = life;
    this.maxLife = life;
    this.gravity = gravity || 200;
    this.rotation = Math.random() * Math.PI * 2;
    this.rotSpeed = (Math.random() - 0.5) * 10;
    this.friction = 0.98;
  }

  update(dt) {
    this.vy += this.gravity * dt;
    this.vx *= this.friction;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
    this.rotation += this.rotSpeed * dt;
    return this.life > 0;
  }

  draw(ctx) {
    const alpha = Math.max(0, this.life / this.maxLife);
    const scale = 0.3 + 0.7 * alpha;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = this.color;
    ctx.fillRect(-this.size * scale / 2, -this.size * scale / 2, this.size * scale, this.size * scale);
    ctx.restore();
  }
}

// ─── Score Popup ─────────────────────────────────────────────────────
class ScorePopup {
  constructor(x, y, text, color, size) {
    this.x = x;
    this.y = y;
    this.text = text;
    this.color = color || '#ffd700';
    this.size = size || 32;
    this.life = 1.5;
    this.maxLife = 1.5;
    this.vy = -80;
    this.scale = 0;
    this.targetScale = 1;
  }

  update(dt) {
    this.life -= dt;
    this.y += this.vy * dt;
    this.vy *= 0.97;

    // Scale animation: quick punch in then settle
    const t = 1 - (this.life / this.maxLife);
    if (t < 0.15) {
      this.scale = easeOutBack(t / 0.15) * 1.3;
    } else if (t < 0.3) {
      this.scale = 1.3 - 0.3 * ((t - 0.15) / 0.15);
    } else {
      this.scale = 1.0;
    }

    return this.life > 0;
  }

  draw(ctx) {
    const alpha = Math.min(1, this.life / 0.4);
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(this.scale, this.scale);
    ctx.globalAlpha = alpha;
    ctx.font = `900 ${this.size}px 'Segoe UI', system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Glow
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 20;
    ctx.fillStyle = this.color;
    ctx.fillText(this.text, 0, 0);
    ctx.shadowBlur = 0;
    ctx.restore();
  }
}

// ─── Effects Manager ─────────────────────────────────────────────────
class Effects {
  constructor() {
    this.particles = [];
    this.popups = [];
    this.screenShake = { x: 0, y: 0, intensity: 0, duration: 0, timer: 0 };
    this.flash = { alpha: 0, color: '#ffffff' };
    this.bgPulse = 0;
    this.ambientParticles = [];
    this.rings = [];
  }

  update(dt) {
    // Particles
    this.particles = this.particles.filter(p => p.update(dt));

    // Popups
    this.popups = this.popups.filter(p => p.update(dt));

    // Screen shake
    if (this.screenShake.timer > 0) {
      this.screenShake.timer -= dt;
      const progress = this.screenShake.timer / this.screenShake.duration;
      const intensity = this.screenShake.intensity * progress;
      this.screenShake.x = (Math.random() - 0.5) * intensity * 2;
      this.screenShake.y = (Math.random() - 0.5) * intensity * 2;
    } else {
      this.screenShake.x = 0;
      this.screenShake.y = 0;
    }

    // Rings
    this.rings = this.rings.filter(r => {
      r.life -= dt;
      r.radius = r.maxRadius * (1 - r.life / r.maxLife);
      return r.life > 0;
    });

    // Flash decay
    if (this.flash.alpha > 0) {
      this.flash.alpha -= dt * 4;
    }

    // Background pulse decay
    if (this.bgPulse > 0) {
      this.bgPulse -= dt * 2;
    }

    // Ambient particles
    this.ambientParticles = this.ambientParticles.filter(p => p.update(dt));
    if (this.ambientParticles.length < 15 && Math.random() < dt * 2) {
      this._spawnAmbient();
    }
  }

  _spawnAmbient() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.ambientParticles.push(new Particle(
      Math.random() * w,
      h + 10,
      (Math.random() - 0.5) * 20,
      -(30 + Math.random() * 40),
      `hsla(${40 + Math.random() * 20}, 80%, 70%, 0.3)`,
      2 + Math.random() * 3,
      3 + Math.random() * 4,
      -10 // float upward
    ));
  }

  // Explode tiles with particles
  explodeTile(x, y, color, intensity) {
    const count = 12 + intensity * 8;
    const colors = [color, '#ffd700', '#ff8800', '#ffcc00', '#ffffff'];

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
      const speed = 100 + Math.random() * 200 * (1 + intensity * 0.5);
      this.particles.push(new Particle(
        x + C.TILE_W / 2,
        y + C.TILE_H / 2,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed - 50,
        colors[Math.floor(Math.random() * colors.length)],
        3 + Math.random() * 5,
        0.6 + Math.random() * 0.8,
        300
      ));
    }
  }

  // Sparkle effect on tile
  sparkleTile(x, y) {
    for (let i = 0; i < 6; i++) {
      this.particles.push(new Particle(
        x + Math.random() * C.TILE_W,
        y + Math.random() * C.TILE_H,
        (Math.random() - 0.5) * 60,
        -(20 + Math.random() * 40),
        `hsla(${40 + Math.random() * 30}, 90%, ${70 + Math.random() * 20}%, 1)`,
        2 + Math.random() * 2,
        0.4 + Math.random() * 0.3,
        80
      ));
    }
  }

  addPopup(x, y, text, color, size) {
    this.popups.push(new ScorePopup(x, y, text, color, size));
  }

  shake(intensity, duration) {
    this.screenShake.intensity = intensity;
    this.screenShake.duration = duration;
    this.screenShake.timer = duration;
  }

  flashScreen(color, alpha) {
    this.flash.color = color;
    this.flash.alpha = alpha || 0.3;
  }

  pulseBg(amount) {
    this.bgPulse = Math.min(1, this.bgPulse + amount);
  }

  // Big celebration effect
  celebrate(cx, cy) {
    for (let i = 0; i < 60; i++) {
      const angle = (i / 60) * Math.PI * 2;
      const speed = 150 + Math.random() * 250;
      const hue = (i / 60) * 360;
      this.particles.push(new Particle(
        cx, cy,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed - 100,
        `hsla(${hue}, 90%, 60%, 1)`,
        4 + Math.random() * 6,
        1 + Math.random() * 1,
        250
      ));
    }
    this.shake(12, 0.5);
    this.flashScreen('#ffd700', 0.4);
  }

  ringBurst(x, y, color, maxRadius) {
    this.rings.push({
      x, y,
      radius: 0,
      maxRadius: maxRadius || 35,
      color: color || '#ffd700',
      life: 0.35,
      maxLife: 0.35,
    });
  }

  drawParticles(ctx) {
    for (const p of this.ambientParticles) p.draw(ctx);
    for (const p of this.particles) p.draw(ctx);

    // Rings
    for (const r of this.rings) {
      const alpha = r.life / r.maxLife;
      ctx.save();
      ctx.globalAlpha = alpha * 0.6;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 2.5 * alpha;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  drawPopups(ctx) {
    for (const p of this.popups) p.draw(ctx);
  }

  drawFlash(ctx, w, h) {
    if (this.flash.alpha > 0) {
      ctx.save();
      ctx.globalAlpha = this.flash.alpha;
      ctx.fillStyle = this.flash.color;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
  }
}

MojAbble.Particle = Particle;
MojAbble.Effects = Effects;

// ─── Renderer ────────────────────────────────────────────────────────
class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = window.devicePixelRatio || 1;
    this.time = 0;

    // Background word tiling
    this.bgWord = '';
    this._bgTileCanvas = null;
    this._bgTileCtx = null;
    this.bgFonts = [
      'Georgia, serif',
      'Times New Roman, serif',
      'Arial, sans-serif',
      'Verdana, sans-serif',
      'Courier New, monospace',
      'Impact, sans-serif',
      'Trebuchet MS, sans-serif',
      'Palatino Linotype, serif',
      'Lucida Console, monospace',
      'Segoe UI, sans-serif',
      'Tahoma, sans-serif',
      'Garamond, serif',
    ];

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  setBgWord(word) {
    this.bgWord = word.toUpperCase();
    this._renderBgTile();
  }

  _renderBgTile() {
    if (!this.bgWord) return;

    const word = this.bgWord;
    const baseSpacing = 16 * (word.length + 2) * 0.6;
    const rowH = 44;
    const cols = 8;
    const rows = 10;
    const tileW = Math.ceil(baseSpacing * cols);
    const tileH = Math.ceil(rowH * rows);

    if (!this._bgTileCanvas) {
      this._bgTileCanvas = document.createElement('canvas');
      this._bgTileCtx = this._bgTileCanvas.getContext('2d');
    }

    const tc = this._bgTileCanvas;
    const tctx = this._bgTileCtx;
    tc.width = tileW;
    tc.height = tileH;
    tctx.clearRect(0, 0, tileW, tileH);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const fi = (((r * 7 + c * 3) % this.bgFonts.length) + this.bgFonts.length) % this.bgFonts.length;
        const sz = 13 + ((r * 5 + c * 11) % 16);
        const x = c * baseSpacing + (r % 2 ? baseSpacing * 0.4 : 0);
        const y = r * rowH + rowH / 2;
        const angle = ((r + c) % 7 - 3) * 0.07;
        const alpha = 0.03 + ((r * 3 + c * 7) % 7) * 0.007;

        tctx.save();
        tctx.translate(x, y);
        tctx.rotate(angle);
        tctx.globalAlpha = alpha;
        tctx.font = `700 ${sz}px ${this.bgFonts[fi]}`;
        tctx.fillStyle = '#ffd700';
        tctx.textAlign = 'center';
        tctx.textBaseline = 'middle';
        tctx.fillText(word, 0, 0);
        tctx.restore();
      }
    }
  }

  resize() {
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = window.innerWidth * this.dpr;
    this.canvas.height = window.innerHeight * this.dpr;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.width = window.innerWidth;
    this.height = window.innerHeight;
  }

  render(board, effects, dt) {
    const ctx = this.ctx;
    this.time += dt;

    ctx.save();

    // Apply screen shake
    ctx.translate(effects.screenShake.x, effects.screenShake.y);

    // Background (screen space)
    this._drawBg(ctx, effects);

    // Ambient particles (screen space, behind tiles)
    for (const p of effects.ambientParticles) p.draw(ctx);

    // Tiles (scaled to fit screen)
    ctx.save();
    ctx.scale(board.scale, board.scale);
    const tiles = board.getRenderOrder();
    for (const tile of tiles) {
      this._drawTile(ctx, tile, board);
    }
    ctx.restore();

    // Effect particles + popups (screen space, in front of tiles)
    effects.drawParticles(ctx);
    effects.drawPopups(ctx);

    ctx.restore();

    // Flash overlay (not affected by shake)
    effects.drawFlash(ctx, this.width, this.height);
  }

  _drawBg(ctx, effects) {
    const grad = ctx.createLinearGradient(0, 0, this.width, this.height);
    const pulse = effects.bgPulse;
    const r1 = 10 + pulse * 20;
    const g1 = 14 + pulse * 10;
    const b1 = 39 + pulse * 20;
    grad.addColorStop(0, `rgb(${r1},${g1},${b1})`);
    grad.addColorStop(1, `rgb(${26 + pulse*15},${16 + pulse*10},${64 + pulse*20})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.width, this.height);

    // Scrolling word tiling
    if (this.bgWord && this._bgTileCanvas) {
      const tc = this._bgTileCanvas;
      const sx = (this.time * 18) % tc.width;
      const sy = (this.time * 9) % tc.height;

      ctx.save();
      ctx.translate(-sx, -sy);
      const cMax = Math.ceil(this.width / tc.width) + 2;
      const rMax = Math.ceil(this.height / tc.height) + 2;
      for (let r = 0; r < rMax; r++) {
        for (let c = 0; c < cMax; c++) {
          ctx.drawImage(tc, c * tc.width, r * tc.height);
        }
      }
      ctx.restore();
    }
  }

  _drawTile(ctx, tile, board) {
    if (tile.removed) return;

    const pos = tile.getScreenPos(board.offsetX, board.offsetY);
    let x = pos.x + tile.shakeX;
    let y = pos.y + tile.animY;
    const w = C.TILE_W;
    const h = C.TILE_H;
    const r = C.TILE_RADIUS;
    const isFree = board.isFree(tile);
    const isHovered = tile === board.hoveredTile && isFree;
    const isSelected = tile.selected;

    let sx = 1, sy = 1, alpha = 1, rot = 0;

    // ── Removing animation: fly up + rotate + scale up + fade ──
    if (tile.removing) {
      if (tile.removeDelay > 0) {
        // Still waiting - draw normally
        this._drawTileBody(ctx, x, y, w, h, r, tile, isFree, isHovered, isSelected, board);
        return;
      }
      const p = tile.removeTimer;
      const lift = easeOutBack(Math.min(1, p * 2));
      y -= lift * 40;
      sx = sy = 1 + p * 0.5;
      alpha = Math.max(0, 1 - p * 1.3);
      rot = p * 0.4 * (tile.col % 2 ? 1 : -1);
    }

    // ── Flip animation (shuffle/swap): squish flat, swap letter, bounce back ──
    if (tile.flipTimer >= 0 && tile.flipDelay <= 0) {
      const ft = tile.flipTimer;
      if (ft < 0.45) {
        // Squish phase: scaleX 1 → 0
        const t = ft / 0.45;
        sx *= Math.cos(t * Math.PI / 2);
        y -= Math.sin(t * Math.PI) * 10;
      } else if (ft < 0.55) {
        // Flat moment (letter switches here)
        sx *= 0;
        y -= 6;
      } else {
        // Expand phase: scaleX 0 → 1 with elastic bounce
        const t = (ft - 0.55) / 0.45;
        sx *= easeOutElastic(t);
        y -= (1 - t) * 4;
        // Slight vertical squash-stretch
        sy *= 1 + Math.sin(t * Math.PI * 2) * 0.08 * (1 - t);
      }
    }

    // ── Selection punch: quick pop ──
    if (tile.punchTimer >= 0) {
      const t = tile.punchTimer;
      const punch = Math.sin(t * Math.PI) * 0.18 * Math.pow(1 - t, 0.5);
      sx *= (1 + punch);
      sy *= (1 + punch);
    }

    // ── Selected: float up with bob ──
    if (isSelected && tile.flipTimer < 0) {
      y -= 5 + Math.sin(this.time * 3.5) * 2.5;
    }

    // ── Hover: gentle lift ──
    if (isHovered && !isSelected) {
      y -= 3;
      sx *= 1.02;
      sy *= 1.02;
    }

    // ── Apply transforms and draw ──
    const needsTransform = sx !== 1 || sy !== 1 || alpha !== 1 || rot !== 0;
    if (needsTransform) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.translate(x + w / 2, y + h / 2);
      if (rot) ctx.rotate(rot);
      ctx.scale(sx, sy);
      this._drawTileBody(ctx, -w / 2, -h / 2, w, h, r, tile, isFree, isHovered, isSelected, board);
      ctx.restore();
    } else {
      this._drawTileBody(ctx, x, y, w, h, r, tile, isFree, isHovered, isSelected, board);
    }
  }

  _drawTileBody(ctx, x, y, w, h, r, tile, isFree, isHovered, isSelected, board) {
    const depth = 4; // 3D depth

    ctx.save();

    // Shadow
    ctx.fillStyle = C.COLORS.shadow;
    ctx.beginPath();
    this._roundRect(ctx, x + 3, y + 3 + depth, w, h, r);
    ctx.fill();

    // Side (3D effect)
    ctx.fillStyle = C.COLORS.tileDark;
    ctx.beginPath();
    this._roundRect(ctx, x, y + depth, w, h, r);
    ctx.fill();

    // Face
    const faceColor = C.COLORS.tileFace[Math.min(tile.layer, 3)];
    ctx.fillStyle = faceColor;
    ctx.beginPath();
    this._roundRect(ctx, x, y, w, h, r);
    ctx.fill();

    // Blocked overlay (only when highlight is on)
    if (!isFree && !tile.selected && board && board.showHighlight) {
      ctx.fillStyle = C.COLORS.blocked;
      ctx.beginPath();
      this._roundRect(ctx, x, y, w, h, r);
      ctx.fill();
    }

    // Free tile glow pulse (toggled by Light button)
    if (isFree && !isSelected && board.showHighlight) {
      const pulse = Math.sin(this.time * 2.5 + tile.glowPulse) * 0.5 + 0.5;
      ctx.strokeStyle = C.COLORS.freeBorder;
      ctx.lineWidth = 1.5 + pulse;
      ctx.globalAlpha = 0.4 + pulse * 0.3;
      ctx.beginPath();
      this._roundRect(ctx, x - 1, y - 1, w + 2, h + 2, r + 1);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Selected glow
    if (isSelected) {
      ctx.shadowColor = C.COLORS.selectedBorder;
      ctx.shadowBlur = 15;
      ctx.strokeStyle = C.COLORS.selectedBorder;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      this._roundRect(ctx, x - 1, y - 1, w + 2, h + 2, r + 1);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Hover highlight
    if (isHovered && !isSelected) {
      ctx.fillStyle = C.COLORS.hoverGlow;
      ctx.beginPath();
      this._roundRect(ctx, x, y, w, h, r);
      ctx.fill();
    }

    // Letter
    const letterColor = tile.score >= 8 ? C.COLORS.letterHigh :
                        tile.score >= 4 ? C.COLORS.letterMid :
                        C.COLORS.letterLow;

    ctx.fillStyle = letterColor;
    ctx.font = `800 ${isSelected ? 24 : 22}px 'Georgia', serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(tile.letter, x + w/2, y + h/2 - 4);

    // Point value
    ctx.fillStyle = 'rgba(42,24,16,0.45)';
    ctx.font = `600 10px 'Segoe UI', system-ui, sans-serif`;
    ctx.textAlign = 'right';
    ctx.fillText(tile.score.toString(), x + w - 5, y + h - 8);

    ctx.restore();
  }

  _roundRect(ctx, x, y, w, h, r) {
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}

MojAbble.Renderer = Renderer;

// ─── Easing Functions ────────────────────────────────────────────────
function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function easeOutElastic(t) {
  if (t === 0 || t === 1) return t;
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI) / 3) + 1;
}

MojAbble.easing = { easeOutBack, easeOutElastic };

})();
