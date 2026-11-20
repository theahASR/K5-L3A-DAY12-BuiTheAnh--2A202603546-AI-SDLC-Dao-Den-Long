import type { EventRecord } from '../core/types';

/**
 * Lightweight procedural Web Audio synthesizer for warm fairy-tale chimes.
 * Zero external audio assets required.
 */
export class SoundEffects {
  private ctx: AudioContext | null = null;
  muted = false;

  private ensureContext(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private playTone(freq: number, duration: number, type: OscillatorType = 'sine', gainPeak = 0.12, endFreq?: number): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (endFreq !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), now + duration);
    }

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(gainPeak, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    return this.muted;
  }

  playForEvent(event: EventRecord): void {
    switch (event.name) {
      case 'mote_picked':
        this.playTone(680, 0.14, 'sine', 0.1, 980);
        break;
      case 'deposit':
        this.playTone(440, 0.18, 'triangle', 0.12, 660);
        break;
      case 'lantern_lit':
        this.playTone(523.25, 0.35, 'triangle', 0.15, 783.99);
        setTimeout(() => this.playTone(1046.5, 0.4, 'sine', 0.12), 110);
        break;
      case 'pulse':
        this.playTone(320, 0.35, 'sine', 0.16, 860);
        break;
      case 'player_hit':
        this.playTone(210, 0.25, 'sawtooth', 0.1, 95);
        break;
      case 'game_over':
        if (event.data.result === 'won') {
          this.playTone(523.25, 0.25, 'triangle', 0.14);
          setTimeout(() => this.playTone(659.25, 0.25, 'triangle', 0.14), 140);
          setTimeout(() => this.playTone(783.99, 0.45, 'triangle', 0.16), 280);
        } else {
          this.playTone(300, 0.35, 'triangle', 0.12, 160);
        }
        break;
    }
  }
}
