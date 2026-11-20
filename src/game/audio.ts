import type { EventRecord } from '../core/types';

/**
 * Procedural Web Audio engine:
 * - Soft ambient night lullaby background loop
 * - SFX for: pickup, lantern lit, pulse, hit, jump, dash, win, lose, shade_spawned,
 *   final 10s countdown tick, charm pickup, drifter steal/drop, wind warning.
 */
export class SoundEffects {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private bgmTimer: number | null = null;
  private bgmStep = 0;

  volume = 0.7;
  muted = false;

  setVolume(vol: number): void {
    this.volume = Math.min(1, Math.max(0, vol));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(
        this.muted ? 0 : this.volume,
        this.ctx.currentTime,
        0.04
      );
    }
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    this.setVolume(this.volume);
    return this.muted;
  }

  private ensureContext(): AudioContext | null {
    if (this.muted || this.volume <= 0.001) return null;
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = this.volume;
        this.masterGain.connect(this.ctx.destination);
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private playTone(
    freq: number,
    duration: number,
    type: OscillatorType = 'sine',
    gainPeak = 0.14,
    endFreq?: number
  ): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (endFreq !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), now + duration);
    }

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(gainPeak, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  startNightBgm(): void {
    if (this.bgmTimer !== null || typeof window === 'undefined') return;
    // Gentle Vietnamese pentatonic night lullaby (D4, F4, G4, A4, C5, D5)
    const melody = [293.66, 349.23, 392.0, 440.0, 523.25, 440.0, 392.0, 349.23];
    this.bgmTimer = window.setInterval(() => {
      if (this.muted || this.volume <= 0.001) return;
      const note = melody[this.bgmStep % melody.length];
      this.bgmStep += 1;
      this.playTone(note, 1.4, 'sine', 0.035);
      if (this.bgmStep % 2 === 0) {
        this.playTone(note * 0.5, 1.6, 'triangle', 0.02);
      }
    }, 1350);
  }

  stopNightBgm(): void {
    if (this.bgmTimer !== null) {
      window.clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
  }

  playJump(): void {
    this.playTone(310, 0.14, 'sine', 0.11, 520);
  }

  playCountdownTick(): void {
    this.playTone(880, 0.08, 'triangle', 0.12, 660);
  }

  playWindWarning(): void {
    this.playTone(180, 0.55, 'sine', 0.09, 320);
  }

  playForEvent(event: EventRecord): void {
    switch (event.name) {
      case 'mote_picked':
        this.playTone(680, 0.13, 'sine', 0.11, 1020);
        break;
      case 'charm_picked':
        this.playTone(587.33, 0.18, 'triangle', 0.14, 880);
        setTimeout(() => this.playTone(1174.66, 0.25, 'sine', 0.13), 90);
        break;
      case 'deposit':
        this.playTone(440, 0.16, 'triangle', 0.12, 660);
        break;
      case 'refuel':
        this.playTone(480, 0.18, 'sine', 0.13, 740);
        break;
      case 'lantern_lit':
        if (event.data.relight) {
          this.playTone(587.33, 0.25, 'triangle', 0.15, 880);
        } else {
          this.playTone(523.25, 0.32, 'triangle', 0.16, 783.99);
          setTimeout(() => this.playTone(1046.5, 0.42, 'sine', 0.14), 110);
        }
        break;
      case 'lantern_out':
        this.playTone(260, 0.42, 'sawtooth', 0.12, 110);
        break;
      case 'fuel_drain':
        this.playTone(185, 0.22, 'sawtooth', 0.06, 130);
        break;
      case 'dash':
        this.playTone(420, 0.14, 'triangle', 0.13, 210);
        break;
      case 'pulse':
        this.playTone(300, 0.35, 'sine', 0.17, 880);
        break;
      case 'shade_spawned':
        this.playTone(150, 0.35, 'sawtooth', 0.08, 95);
        break;
      case 'drifter_steal':
        this.playTone(520, 0.22, 'sawtooth', 0.1, 240);
        break;
      case 'drifter_drop':
        this.playTone(600, 0.2, 'sine', 0.12, 920);
        break;
      case 'player_hit':
        this.playTone(210, 0.28, 'sawtooth', 0.13, 85);
        break;
      case 'game_over':
        if (event.data.result === 'won') {
          this.playTone(523.25, 0.24, 'triangle', 0.15);
          setTimeout(() => this.playTone(659.25, 0.24, 'triangle', 0.15), 140);
          setTimeout(() => this.playTone(783.99, 0.45, 'triangle', 0.17), 280);
        } else {
          this.playTone(300, 0.38, 'triangle', 0.14, 145);
        }
        break;
    }
  }
}
