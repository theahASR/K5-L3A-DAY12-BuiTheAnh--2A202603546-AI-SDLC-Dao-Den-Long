import './styles.css';
import {
  BENCH_WARMUP_S,
  BenchSimulation,
  computeBenchMetrics,
  getBenchCameraPos,
} from './core/bench';
import { DT } from './core/config';
import { GameSimulation } from './core/simulation';
import { SoundEffects } from './game/audio';
import { HudController } from './game/hud';
import { InputController } from './game/inputController';
import { Renderer3D } from './game/renderer3d';
import { loadSettings, saveSettings } from './game/settings';

const params = new URLSearchParams(window.location.search);
const isBenchMode = params.get('bench') === '1';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const renderer = new Renderer3D(canvas, isBenchMode);

if (isBenchMode) {
  runBrowserBenchmark();
} else {
  runInteractiveGame();
}

function runBrowserBenchmark(): void {
  const parsedSeed = Number.parseInt(params.get('seed') ?? '42', 10);
  const seed = Number.isNaN(parsedSeed) ? 42 : parsedSeed;
  const parsedDur = Number.parseInt(params.get('duration') ?? '30', 10);
  const durationS = Math.max(1, Number.isNaN(parsedDur) ? 30 : parsedDur);

  // Hide all interactive UI overlays during benchmark
  for (const id of ['hud', 'overlay', 'pause-overlay', 'settings-overlay', 'leaderboard-overlay']) {
    document.getElementById(id)?.classList.add('hidden');
  }

  const benchSim = new BenchSimulation(seed);
  const frameDtsMs: number[] = [];
  let accumulator = 0;
  let elapsedTotalS = 0;
  let measuredS = 0;
  let lastNow = performance.now();
  let firstFrameSent = false;
  let finished = false;
  let peakMemMb: number | null = null;

  const perfMem = performance as unknown as {
    memory?: { usedJSHeapSize: number };
  };

  function benchFrame(now: number): void {
    if (finished) return;
    const dtMs = Math.max(0.001, now - lastNow);
    lastNow = now;
    const dtS = Math.min(0.1, dtMs / 1000);

    // Fixed 60 Hz wander step for all 200 shades
    accumulator += dtS;
    while (accumulator >= DT) {
      benchSim.stepWanderTick();
      accumulator -= DT;
    }

    elapsedTotalS += dtS;
    const camPos = getBenchCameraPos(elapsedTotalS);
    renderer.renderBench(benchSim.sim, camPos, dtS);

    if (!firstFrameSent) {
      firstFrameSent = true;
      fetch('/__bench/first-frame', { method: 'POST' }).catch(() => {});
      requestAnimationFrame(benchFrame);
      return;
    }

    if (perfMem.memory && typeof perfMem.memory.usedJSHeapSize === 'number') {
      const mb = Math.round(perfMem.memory.usedJSHeapSize / (1024 * 1024));
      peakMemMb = peakMemMb === null ? mb : Math.max(peakMemMb, mb);
    }

    // Skip first 3 seconds (warmup), then measure exact durationS seconds
    if (elapsedTotalS >= BENCH_WARMUP_S) {
      frameDtsMs.push(dtMs);
      measuredS += dtMs / 1000;

      if (measuredS >= durationS) {
        finished = true;
        const metrics = computeBenchMetrics(frameDtsMs);
        const payload = {
          ...metrics,
          peak_mem_mb: peakMemMb,
          renderer: renderer.getRendererDescription(),
        };
        fetch('/__bench/report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
          .catch(() => {})
          .finally(() => {
            window.close();
          });
        return;
      }
    }

    requestAnimationFrame(benchFrame);
  }

  requestAnimationFrame(benchFrame);
}

function runInteractiveGame(): void {
  const input = new InputController(canvas);
  const sfx = new SoundEffects();

  const settings = loadSettings();
  sfx.setVolume(settings.volume);
  input.mouseSensitivity = settings.mouseSensitivity;
  input.setKeybindings(settings.keybindings);
  renderer.setColorblindMode(settings.colorblindMode);
  renderer.setReduceMotion(settings.reduceMotion);
  input.onToggleMute = () => sfx.toggleMute();

  let sim = new GameSimulation({ seed: 2026, night: 1 });
  let inSession = false;
  let currentNight: 1 | 2 | 3 = 1;
  let campaignScore = 0;
  let nightsWon = 0;
  let runCounter = 1;
  let accumulator = 0;
  let lastTime = performance.now();
  let pendingPauseToggle = false;
  let lastCountdownSec = 11;
  let wasWindWarning = false;
  let recentSpawnedShadeId: string | null = null;
  let recentSpawnedShadeFallback: [number, number, number] | null = null;

  const hud = new HudController(
    {
      onStartNight: (night) => {
        if (night === 1) {
          campaignScore = 0;
          nightsWon = 0;
        }
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
        nightsWon = 0;
        sfx.stopNightBgm();
        hud.showMainMenu();
      },
      onSettingsChange: (next) => {
        sfx.setVolume(next.volume);
        input.mouseSensitivity = next.mouseSensitivity;
        input.setKeybindings(next.keybindings);
        renderer.setColorblindMode(next.colorblindMode);
        renderer.setReduceMotion(next.reduceMotion);
        saveSettings(next);
      },
      onKeybindCaptureToggle: (listening) => {
        input.captureSuspended = listening;
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
    recentSpawnedShadeId = null;
    recentSpawnedShadeFallback = null;
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
          if (ev.name === 'player_hit') {
            renderer.triggerCameraShake(0.28);
            hud.triggerHitFlash();
          }
          if (ev.name === 'shade_spawned') {
            const sid = String(ev.data.id ?? '');
            recentSpawnedShadeId = sid;
            const shade = sim.shades.find((s) => s.id === sid);
            if (shade) {
              recentSpawnedShadeFallback = [shade.x, shade.y, shade.z];
            }
            hud.notifyShadeSpawned(sid);
          }
          sfx.playForEvent(ev);
        }

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

      const lanternArrow = renderer.computeOffscreenLanternArrow(sim);
      const liveShade = recentSpawnedShadeId
        ? sim.shades.find((s) => s.id === recentSpawnedShadeId)
        : undefined;
      const shadeTargetPos: [number, number, number] | null = liveShade
        ? [liveShade.x, liveShade.y, liveShade.z]
        : recentSpawnedShadeFallback;
      const shadeArrow = shadeTargetPos
        ? renderer.computeOffscreenPointArrow(
            shadeTargetPos[0],
            shadeTargetPos[1],
            shadeTargetPos[2]
          )
        : { visible: false, x: 0, y: 0, angleDeg: 0 };
      hud.update(sim, lanternArrow, shadeArrow, frameDt);

      if (isGameOver(sim)) {
        inSession = false;
        sfx.stopNightBgm();
        if (sim.state === 'won') {
          campaignScore += sim.score;
          nightsWon += 1;
        }
        hud.showGameOver(sim, campaignScore, nightsWon);
      }
    }

    renderer.render(sim, input.getCameraYawDeg(), frameDt);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}
