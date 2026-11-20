import './styles.css';
import { DT } from './core/config';
import { GameSimulation } from './core/simulation';
import { SoundEffects } from './game/audio';
import { HudController } from './game/hud';
import { InputController } from './game/inputController';
import { Renderer3D } from './game/renderer3d';
import { loadSettings, saveSettings } from './game/settings';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const renderer = new Renderer3D(canvas);
const input = new InputController(canvas);
const sfx = new SoundEffects();

const settings = loadSettings();
sfx.setVolume(settings.volume);
input.mouseSensitivity = settings.mouseSensitivity;
renderer.setColorblindMode(settings.colorblindMode);
input.onToggleMute = () => sfx.toggleMute();

let sim = new GameSimulation({ seed: 2026, night: 1 });
let inSession = false;
let currentNight: 1 | 2 | 3 = 1;
let campaignScore = 0;
let runCounter = 1;
let accumulator = 0;
let lastTime = performance.now();
let pendingPauseToggle = false;
let lastCountdownSec = 11;
let wasWindWarning = false;

const hud = new HudController(
  {
    onStartNight: (night) => {
      if (night === 1) campaignScore = 0;
      startNight(night);
    },
    onResume: () => {
      if (inSession && sim.state === 'paused') {
        pendingPauseToggle = true;
      }
    },
    onReplayNight: () => {
      startNight(currentNight);
    },
    onBackToMenu: () => {
      inSession = false;
      campaignScore = 0;
      sfx.stopNightBgm();
      hud.showMainMenu();
    },
    onSettingsChange: (next) => {
      sfx.setVolume(next.volume);
      input.mouseSensitivity = next.mouseSensitivity;
      renderer.setColorblindMode(next.colorblindMode);
      saveSettings(next);
    },
  },
  settings
);

input.onPauseKey = () => {
  if (inSession && (sim.state === 'playing' || sim.state === 'paused')) {
    pendingPauseToggle = true;
  }
};

function startNight(night: 1 | 2 | 3): void {
  currentNight = night;
  renderer.resetDynamicVisuals();
  input.reset();
  sim = new GameSimulation({ seed: 2026 + night * 100 + runCounter++, night });
  accumulator = 0;
  inSession = true;
  pendingPauseToggle = false;
  lastCountdownSec = 11;
  wasWindWarning = false;
  hud.showPlaying(sim);
  sfx.startNightBgm();
}

hud.showMainMenu();

function isGameOver(s: GameSimulation): boolean {
  return s.state === 'won' || s.state === 'lost';
}

function frame(now: number): void {
  const frameDt = Math.min(0.1, (now - lastTime) / 1000);
  lastTime = now;

  if (inSession && !isGameOver(sim)) {
    accumulator += frameDt;
    while (accumulator >= DT && !isGameOver(sim)) {
      const pauseFlag = pendingPauseToggle;
      pendingPauseToggle = false;

      const prevJumpTick = sim.lastJumpTick;
      const sampled = input.sampleForTick(DT, pauseFlag);
      const events = sim.step(sampled);

      if (sim.lastJumpTick !== prevJumpTick) {
        sfx.playJump();
      }
      for (const ev of events) {
        if (ev.name === 'paused') hud.showPause(true);
        if (ev.name === 'resumed') hud.showPause(false);
        sfx.playForEvent(ev);
      }

      // Final 10-second countdown tick audio
      if (sim.state === 'playing') {
        const sec = Math.ceil(sim.timeLeftS);
        if (sec <= 10 && sec > 0 && sec < lastCountdownSec) {
          lastCountdownSec = sec;
          sfx.playCountdownTick();
        }
        if (sim.wind.warning && !wasWindWarning) {
          sfx.playWindWarning();
        }
        wasWindWarning = sim.wind.warning;
      }

      accumulator -= DT;
    }

    const arrow = renderer.computeOffscreenLanternArrow(sim);
    hud.update(sim, arrow);

    if (isGameOver(sim)) {
      inSession = false;
      sfx.stopNightBgm();
      if (sim.state === 'won') {
        campaignScore += sim.score;
      }
      hud.showGameOver(sim, campaignScore);
    }
  }

  renderer.render(sim, input.getCameraYawDeg(), frameDt);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
