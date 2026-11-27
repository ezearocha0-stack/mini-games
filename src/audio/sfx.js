// Synthesized tactile sound effects & optional ambient loop (Web Audio API) + Android haptics

const STORAGE_KEY = 'mg_sound_muted_v1';

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.muted = localStorage.getItem(STORAGE_KEY) === '1';
    this.masterVolume = 0.85;
    this.sfxVolume = 0.9;
    this.musicVolume = 0;
    this.musicTimer = null;
    this.musicStep = 0;
  }

  ensureContext() {
    if (this.muted) return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  applySettings({ masterVolume, sfxVolume, musicVolume }) {
    if (typeof masterVolume === 'number') this.masterVolume = Math.max(0, Math.min(1, masterVolume));
    if (typeof sfxVolume === 'number') this.sfxVolume = Math.max(0, Math.min(1, sfxVolume));
    if (typeof musicVolume === 'number') this.musicVolume = Math.max(0, Math.min(1, musicVolume));

    if (!this.muted && this.musicVolume > 0.02) {
      this.startAmbientLoop();
    } else {
      this.stopAmbientLoop();
    }
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    localStorage.setItem(STORAGE_KEY, this.muted ? '1' : '0');
    if (this.muted) {
      this.stopAmbientLoop();
    } else if (this.musicVolume > 0.02) {
      this.startAmbientLoop();
    }
    return this.muted;
  }

  toggleMuted() {
    return this.setMuted(!this.muted);
  }

  haptic(pattern = 12) {
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(pattern);
      }
    } catch {}
  }

  effectiveSfxGain(baseGain) {
    return Math.max(0.0001, baseGain * this.masterVolume * this.sfxVolume);
  }

  tone({ freq = 440, endFreq = null, duration = 0.08, type = 'triangle', gain = 0.14, delay = 0, isMusic = false }) {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const scaledGain = isMusic
      ? Math.max(0.0001, gain * this.masterVolume * this.musicVolume)
      : this.effectiveSfxGain(gain);
    if (scaledGain <= 0.001) return;

    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (endFreq !== null) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);
    }

    amp.gain.setValueAtTime(0.0001, now);
    amp.gain.linearRampToValueAtTime(scaledGain, now + 0.008);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(amp);
    amp.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  startAmbientLoop() {
    if (this.musicTimer || this.muted || this.musicVolume <= 0.02) return;
    const progression = [220, 261.63, 329.63, 392.0, 293.66, 349.23, 440.0, 329.63];
    this.musicTimer = setInterval(() => {
      if (this.muted || this.musicVolume <= 0.02 || !this.ctx || this.ctx.state !== 'running') return;
      const root = progression[this.musicStep % progression.length];
      this.musicStep += 1;
      this.tone({ freq: root, duration: 1.4, type: 'sine', gain: 0.045, isMusic: true });
      this.tone({ freq: root * 1.5, duration: 1.1, type: 'sine', gain: 0.025, delay: 0.12, isMusic: true });
    }, 1500);
  }

  stopAmbientLoop() {
    if (this.musicTimer) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  testAudio() {
    this.ensureContext();
    this.tone({ freq: 440, duration: 0.1, type: 'triangle', gain: 0.14 });
    this.tone({ freq: 587.33, duration: 0.12, type: 'triangle', gain: 0.14, delay: 0.11 });
    this.tone({ freq: 783.99, duration: 0.18, type: 'sine', gain: 0.15, delay: 0.22 });
  }

  click() {
    this.tone({ freq: 520, endFreq: 320, duration: 0.045, type: 'sine', gain: 0.08 });
  }

  puckHit(intensity = 1) {
    const clamped = Math.min(1.4, Math.max(0.35, intensity));
    this.tone({
      freq: 320 + clamped * 210,
      endFreq: 135,
      duration: 0.065,
      type: 'triangle',
      gain: 0.16 * clamped
    });
    this.haptic(Math.round(10 * clamped));
  }

  wallHit(intensity = 0.7) {
    const clamped = Math.min(1.1, Math.max(0.25, intensity));
    this.tone({
      freq: 210 + clamped * 90,
      endFreq: 110,
      duration: 0.05,
      type: 'sine',
      gain: 0.09 * clamped
    });
  }

  discDrop() {
    this.tone({ freq: 290, endFreq: 155, duration: 0.08, type: 'triangle', gain: 0.14 });
    this.tone({ freq: 210, endFreq: 140, duration: 0.055, type: 'sine', gain: 0.08, delay: 0.09 });
    this.haptic(14);
  }

  markPlace(player = 1) {
    const base = player === 1 ? 460 : 560;
    this.tone({ freq: base, endFreq: base * 1.18, duration: 0.07, type: 'triangle', gain: 0.12 });
    this.haptic(10);
  }

  countdownPip(final = false) {
    this.tone({
      freq: final ? 784 : 440,
      endFreq: final ? 880 : 440,
      duration: final ? 0.18 : 0.09,
      type: 'sine',
      gain: 0.12
    });
  }

  goal(scoredByMe = true) {
    if (scoredByMe) {
      this.tone({ freq: 523.25, duration: 0.11, type: 'triangle', gain: 0.16, delay: 0 });
      this.tone({ freq: 659.25, duration: 0.14, type: 'triangle', gain: 0.16, delay: 0.09 });
      this.tone({ freq: 783.99, duration: 0.22, type: 'triangle', gain: 0.18, delay: 0.18 });
      this.haptic([22, 35, 30]);
    } else {
      this.tone({ freq: 330, endFreq: 220, duration: 0.22, type: 'sawtooth', gain: 0.1 });
      this.haptic([35, 30, 35]);
    }
  }

  win() {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, idx) => {
      this.tone({ freq: f, duration: 0.16, type: 'triangle', gain: 0.15, delay: idx * 0.085 });
    });
    this.haptic([25, 40, 25, 40, 50]);
  }

  lose() {
    this.tone({ freq: 392, endFreq: 261.6, duration: 0.28, type: 'triangle', gain: 0.13 });
    this.haptic(40);
  }

  reaction() {
    this.tone({ freq: 660, endFreq: 880, duration: 0.09, type: 'sine', gain: 0.09 });
  }

  cueStrike(power = 0.7) {
    const p = Math.min(1.2, Math.max(0.25, power));
    this.tone({ freq: 210 + p * 120, endFreq: 85, duration: 0.06, type: 'triangle', gain: 0.16 * p });
    this.haptic(Math.round(8 * p));
  }

  ballClack(intensity = 0.7) {
    const k = Math.min(1.2, Math.max(0.2, intensity));
    this.tone({ freq: 720 + k * 240, endFreq: 340, duration: 0.038, type: 'triangle', gain: 0.12 * k });
  }

  pocketDrop() {
    this.tone({ freq: 260, endFreq: 130, duration: 0.1, type: 'sine', gain: 0.14 });
    this.tone({ freq: 520, endFreq: 420, duration: 0.08, type: 'triangle', gain: 0.1, delay: 0.05 });
    this.haptic(14);
  }

  splash() {
    this.tone({ freq: 340, endFreq: 150, duration: 0.14, type: 'sine', gain: 0.12 });
    this.haptic(8);
  }

  explosion() {
    this.tone({ freq: 185, endFreq: 52, duration: 0.22, type: 'sawtooth', gain: 0.16 });
    this.tone({ freq: 120, endFreq: 42, duration: 0.2, type: 'triangle', gain: 0.14, delay: 0.04 });
    this.haptic([24, 20, 28]);
  }

  radarPing() {
    this.tone({ freq: 760, endFreq: 740, duration: 0.07, type: 'sine', gain: 0.08 });
  }

  chessMove(capture = false) {
    if (capture) {
      this.tone({ freq: 380, endFreq: 180, duration: 0.07, type: 'triangle', gain: 0.14 });
      this.haptic(14);
    } else {
      this.tone({ freq: 280, endFreq: 190, duration: 0.05, type: 'sine', gain: 0.1 });
      this.haptic(8);
    }
  }

  checkAlert() {
    this.tone({ freq: 620, duration: 0.08, type: 'triangle', gain: 0.13 });
    this.tone({ freq: 830, duration: 0.12, type: 'triangle', gain: 0.14, delay: 0.09 });
    this.haptic([15, 25, 15]);
  }

  correctGuess() {
    this.tone({ freq: 523.25, duration: 0.09, type: 'triangle', gain: 0.14 });
    this.tone({ freq: 659.25, duration: 0.1, type: 'triangle', gain: 0.14, delay: 0.08 });
    this.tone({ freq: 783.99, duration: 0.15, type: 'triangle', gain: 0.15, delay: 0.16 });
    this.haptic([16, 20, 22]);
  }

  brushPop() {
    this.tone({ freq: 480, endFreq: 620, duration: 0.03, type: 'sine', gain: 0.045 });
  }

  notification() {
    this.tone({ freq: 587.33, endFreq: 880, duration: 0.11, type: 'sine', gain: 0.08 });
  }
}

export const sfx = new SoundEngine();
