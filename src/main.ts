import './styles.css';
import { DT } from './core/config';
import { GameSimulation } from './core/simulation';
import { SoundEffects } from './game/audio';
import { HudController } from './game/hud';
import { InputController } from './game/inputController';
import { Renderer3D } from './game/renderer3d';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const renderer = new Renderer3D(canvas);
const input = new InputController(canvas);
const sfx = new SoundEffects();
input.onToggleMute = () => sfx.toggleMute();

let sim = new GameSimulation({ seed: 2026, night: 1 });
let active = false;
let accumulator = 0;
let lastTime = performance.now();
let runCounter = 1;

const hud = new HudController(() => {
  startNewRun();
});

function startNewRun(): void {
  renderer.resetDynamicVisuals();
  input.reset();
  sim = new GameSimulation({ seed: 2026 + runCounter++, night: 1 });
  accumulator = 0;
  active = true;
  hud.showPlaying();
  hud.update(sim);
}

function frame(now: number): void {
  const frameDt = Math.min(0.1, (now - lastTime) / 1000);
  lastTime = now;

  if (active && sim.state === 'playing') {
    accumulator += frameDt;
    while (accumulator >= DT && sim.state === 'playing') {
      const sampled = input.sampleForTick(DT);
      const events = sim.step(sampled);
      for (const ev of events) {
        sfx.playForEvent(ev);
      }
      accumulator -= DT;
    }

    hud.update(sim);
    if (sim.state !== 'playing') {
      active = false;
      hud.showGameOver(sim);
    }
  }

  renderer.render(sim, input.getCameraYawDeg(), frameDt);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
