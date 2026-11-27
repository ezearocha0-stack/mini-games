// Synthesized tactile sound effects (Web Audio API) + Android haptics

const STORAGE_KEY = 'mg_sound_muted_v1';

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.muted = localStorage.getItem(STORAGE_KEY) === '1';
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

  setMuted(muted) {
    this.muted = Boolean(muted);
    localStorage.setItem(STORAGE_KEY, this.muted ? '1' : '0');
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
    } catch {
      // Ignore on unsupported devices
    }
  }

  tone({ freq = 440, endFreq = null, duration = 0.08, type = 'triangle', gain = 0.14, delay = 0 }) {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (endFreq !== null) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);
    }

    amp.gain.setValueAtTime(0.0001, now);
    amp.gain.linearRampToValueAtTime(gain, now + 0.006);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(amp);
    amp.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + duration + 0.01);
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
}

export const sfx = new SoundEngine();
