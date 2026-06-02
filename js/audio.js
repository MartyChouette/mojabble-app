// MojAbble - Procedural Audio (Web Audio API)
(function() {
'use strict';

window.MojAbble = window.MojAbble || {};

class AudioManager {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.masterVolume = 0.3;
  }

  _ensureContext() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  _createGain(volume) {
    const ctx = this._ensureContext();
    const gain = ctx.createGain();
    gain.gain.value = volume * this.masterVolume;
    gain.connect(ctx.destination);
    return gain;
  }

  // Quick click sound
  playTick() {
    if (!this.enabled) return;
    const ctx = this._ensureContext();
    const gain = this._createGain(0.15);
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.05);
    osc.connect(gain);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.06);
  }

  // Select tile - pitch goes up with word length
  playSelect(wordLen) {
    if (!this.enabled) return;
    const ctx = this._ensureContext();
    const gain = this._createGain(0.25);
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    const baseFreq = 400 + wordLen * 80;
    osc.frequency.setValueAtTime(baseFreq, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.5, ctx.currentTime + 0.08);
    osc.connect(gain);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.12);
  }

  // Deselect tile
  playDeselect() {
    if (!this.enabled) return;
    const ctx = this._ensureContext();
    const gain = this._createGain(0.15);
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(500, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.08);
    osc.connect(gain);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.1);
  }

  // Valid word - triumphant ascending arpeggio
  playWordSuccess(score, combo) {
    if (!this.enabled) return;
    const ctx = this._ensureContext();
    const baseFreq = 440;
    const notes = [1, 1.25, 1.5, 2]; // major chord

    for (let i = 0; i < notes.length; i++) {
      const gain = this._createGain(0.2);
      const osc = ctx.createOscillator();
      osc.type = i === 3 ? 'sine' : 'triangle';
      const freq = baseFreq * notes[i] * (1 + combo * 0.1);
      const start = ctx.currentTime + i * 0.07;
      osc.frequency.setValueAtTime(freq, start);
      osc.connect(gain);
      gain.gain.setValueAtTime(0.2 * this.masterVolume, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.3);
      osc.start(start);
      osc.stop(start + 0.3);
    }

    // Extra shimmer for high scores
    if (score > 30) {
      const gain = this._createGain(0.1);
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(baseFreq * 3, ctx.currentTime + 0.2);
      osc.connect(gain);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
      osc.start(ctx.currentTime + 0.2);
      osc.stop(ctx.currentTime + 0.6);
    }
  }

  // Invalid word - buzz
  playWordFail() {
    if (!this.enabled) return;
    const ctx = this._ensureContext();

    for (let i = 0; i < 2; i++) {
      const gain = this._createGain(0.15);
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      const start = ctx.currentTime + i * 0.08;
      osc.frequency.setValueAtTime(150 - i * 30, start);
      osc.connect(gain);
      gain.gain.setValueAtTime(0.15 * this.masterVolume, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.15);
      osc.start(start);
      osc.stop(start + 0.15);
    }
  }

  // Combo sound - rising pitch
  playCombo(level) {
    if (!this.enabled) return;
    const ctx = this._ensureContext();
    const gain = this._createGain(0.2);
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    const freq = 600 + level * 100;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freq * 2, ctx.currentTime + 0.15);
    osc.connect(gain);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.2);
  }

  // Board clear celebration
  playCelebration() {
    if (!this.enabled) return;
    const ctx = this._ensureContext();
    const scale = [1, 1.125, 1.25, 1.333, 1.5, 1.667, 1.875, 2];

    for (let i = 0; i < scale.length; i++) {
      const gain = this._createGain(0.15);
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      const start = ctx.currentTime + i * 0.08;
      osc.frequency.setValueAtTime(440 * scale[i], start);
      osc.connect(gain);
      gain.gain.setValueAtTime(0.15 * this.masterVolume, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.4);
      osc.start(start);
      osc.stop(start + 0.4);
    }
  }
}

MojAbble.AudioManager = AudioManager;

})();
