import { NIGHT_MAPS } from '../core/maps';
import type { GameSimulation } from '../core/simulation';
import type { LanternEntity } from '../core/types';
import type { GameSettings } from './settings';

function formatTime(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const mins = Math.floor(s / 60);
  const rem = s % 60;
  return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
}

export interface HudCallbacks {
  onStartNight: (night: 1 | 2 | 3) => void;
  onResume: () => void;
  onReplayNight: () => void;
  onBackToMenu: () => void;
  onSettingsChange: (next: GameSettings) => void;
}

export class HudController {
  private readonly hudEl = document.getElementById('hud')!;
  private readonly flamesEl = document.getElementById('hud-flames')!;
  private readonly charmBadgeEl = document.getElementById('hud-charm-badge')!;
  private readonly charmTimeEl = document.getElementById('hud-charm-time')!;
  private readonly nightLabelEl = document.getElementById('hud-night-label')!;
  private readonly timeEl = document.getElementById('hud-time')!;
  private readonly lowFuelBadgeEl = document.getElementById('hud-low-fuel-badge')!;
  private readonly windBadgeEl = document.getElementById('hud-wind-badge')!;
  private readonly lanternsEl = document.getElementById('hud-lanterns')!;
  private readonly scoreEl = document.getElementById('hud-score')!;
  private readonly motesCountEl = document.getElementById('hud-motes-count')!;
  private readonly moteSlotsEl = document.getElementById('mote-slots')!;
  private readonly actionHintEl = document.getElementById('action-hint')!;
  private readonly arrowEl = document.getElementById('offscreen-arrow')!;

  private readonly iconDashEl = document.getElementById('icon-dash')!;
  private readonly cdDashEl = document.getElementById('cd-dash')!;
  private readonly iconPulseEl = document.getElementById('icon-pulse')!;
  private readonly cdPulseEl = document.getElementById('cd-pulse')!;

  private readonly overlayEl = document.getElementById('overlay')!;
  private readonly eyebrowEl = document.getElementById('overlay-eyebrow')!;
  private readonly titleEl = document.getElementById('overlay-title')!;
  private readonly descEl = document.getElementById('overlay-desc')!;
  private readonly statsEl = document.getElementById('overlay-stats')!;
  private readonly nightPickerEl = document.getElementById('night-picker')!;
  private readonly primaryBtn = document.getElementById('overlay-primary-btn') as HTMLButtonElement;
  private readonly secondaryBtn = document.getElementById(
    'overlay-secondary-btn'
  ) as HTMLButtonElement;

  private readonly pauseOverlayEl = document.getElementById('pause-overlay')!;
  private readonly backMenuBtn = document.getElementById('btn-back-menu') as HTMLButtonElement;
  private readonly settingsOverlayEl = document.getElementById('settings-overlay')!;
  private readonly volumeInput = document.getElementById('setting-volume') as HTMLInputElement;
  private readonly volumeValEl = document.getElementById('setting-volume-val')!;
  private readonly sensInput = document.getElementById('setting-sens') as HTMLInputElement;
  private readonly sensValEl = document.getElementById('setting-sens-val')!;
  private readonly colorblindInput = document.getElementById(
    'setting-colorblind'
  ) as HTMLInputElement;

  private readonly moteSlots: HTMLDivElement[] = [];
  private selectedNight: 1 | 2 | 3 = 1;
  private primaryAction: () => void = () => {};
  private secondaryAction: () => void = () => {};
  private settingsReturnToPause = false;
  private colorblindMode = false;

  constructor(private readonly cb: HudCallbacks, initialSettings: GameSettings) {
    this.ensureSlotCount(10);

    // Night picker chips on main menu
    this.nightPickerEl.querySelectorAll<HTMLButtonElement>('.night-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        const n = Number(btn.dataset.night) as 1 | 2 | 3;
        this.selectedNight = n;
        this.nightPickerEl
          .querySelectorAll('.night-chip')
          .forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    this.primaryBtn.addEventListener('click', () => this.primaryAction());
    this.secondaryBtn.addEventListener('click', () => this.secondaryAction());

    document.getElementById('btn-resume')!.addEventListener('click', () => cb.onResume());
    document.getElementById('btn-replay-night')!.addEventListener('click', () => cb.onReplayNight());
    document.getElementById('btn-pause-settings')!.addEventListener('click', () => {
      this.openSettings(true);
    });
    this.backMenuBtn.addEventListener('click', () => cb.onBackToMenu());
    document.getElementById('btn-close-settings')!.addEventListener('click', () => {
      this.closeSettings();
    });

    // Settings controls
    this.volumeInput.value = String(Math.round(initialSettings.volume * 100));
    this.volumeValEl.textContent = `${this.volumeInput.value}%`;
    this.sensInput.value = String(Math.round(initialSettings.mouseSensitivity * 100));
    this.sensValEl.textContent = initialSettings.mouseSensitivity.toFixed(2);
    this.colorblindInput.checked = initialSettings.colorblindMode;
    this.applyColorblindMode(initialSettings.colorblindMode);

    const emitSettings = () => {
      const volume = Number(this.volumeInput.value) / 100;
      const mouseSensitivity = Number(this.sensInput.value) / 100;
      const colorblindMode = this.colorblindInput.checked;
      this.volumeValEl.textContent = `${Math.round(volume * 100)}%`;
      this.sensValEl.textContent = mouseSensitivity.toFixed(2);
      this.applyColorblindMode(colorblindMode);
      cb.onSettingsChange({ volume, mouseSensitivity, colorblindMode });
    };
    this.volumeInput.addEventListener('input', emitSettings);
    this.sensInput.addEventListener('input', emitSettings);
    this.colorblindInput.addEventListener('change', emitSettings);
  }

  applyColorblindMode(enabled: boolean): void {
    this.colorblindMode = enabled;
    document.body.classList.toggle('colorblind-mode', enabled);
    this.backMenuBtn.textContent = enabled ? '⚠ Về Menu chính' : 'Về Menu chính';
  }

  private ensureSlotCount(capacity: number): void {
    while (this.moteSlots.length < capacity) {
      const slot = document.createElement('div');
      slot.className = 'mote-slot';
      this.moteSlotsEl.appendChild(slot);
      this.moteSlots.push(slot);
    }
    while (this.moteSlots.length > capacity) {
      const removed = this.moteSlots.pop();
      removed?.remove();
    }
  }

  openSettings(fromPause: boolean): void {
    this.settingsReturnToPause = fromPause;
    if (fromPause) this.pauseOverlayEl.classList.add('hidden');
    else this.overlayEl.classList.add('hidden');
    this.settingsOverlayEl.classList.remove('hidden');
  }

  closeSettings(): void {
    this.settingsOverlayEl.classList.add('hidden');
    if (this.settingsReturnToPause) {
      this.pauseOverlayEl.classList.remove('hidden');
    } else {
      this.overlayEl.classList.remove('hidden');
    }
  }

  showMainMenu(): void {
    this.hudEl.classList.add('hidden');
    this.pauseOverlayEl.classList.add('hidden');
    this.settingsOverlayEl.classList.add('hidden');
    this.overlayEl.classList.remove('hidden', 'dawn-theme');
    this.statsEl.classList.add('hidden');
    this.nightPickerEl.classList.remove('hidden');

    this.eyebrowEl.textContent = 'DAY 12 · ĐÈN CẠN DẦU';
    this.titleEl.textContent = 'Đảo Đèn Lồng';
    this.descEl.textContent =
      'Cùng Mây vượt qua 3 Đêm — Đảo Bến, Đảo Cau và Đảo Chuông — thắp sáng, châm dầu kịp lúc và giữ đủ Đèn Lồng Lớn sáng tới bình minh.';
    this.primaryBtn.textContent = 'Bắt đầu Đêm đã chọn';
    this.secondaryBtn.textContent = 'Cài đặt';
    this.secondaryBtn.classList.remove('hidden');

    this.primaryAction = () => this.showNightIntro(this.selectedNight);
    this.secondaryAction = () => this.openSettings(false);
  }

  showNightIntro(night: 1 | 2 | 3): void {
    const def = NIGHT_MAPS[night];
    this.hudEl.classList.add('hidden');
    this.pauseOverlayEl.classList.add('hidden');
    this.overlayEl.classList.remove('hidden', 'dawn-theme');
    this.statsEl.classList.add('hidden');
    this.nightPickerEl.classList.add('hidden');

    this.eyebrowEl.textContent = `HÀNH TRÌNH GIỮ ÁNH SÁNG · ĐÊM ${night} / 3`;
    this.titleEl.textContent = def.name;
    this.descEl.textContent = def.introLine;
    this.primaryBtn.textContent = `Bắt đầu Đêm ${night}`;
    this.secondaryBtn.textContent = 'Về Menu';
    this.secondaryBtn.classList.remove('hidden');

    this.primaryAction = () => this.cb.onStartNight(night);
    this.secondaryAction = () => this.showMainMenu();
  }

  showPlaying(sim: GameSimulation): void {
    this.overlayEl.classList.add('hidden');
    this.pauseOverlayEl.classList.add('hidden');
    this.settingsOverlayEl.classList.add('hidden');
    this.hudEl.classList.remove('hidden');
    this.nightLabelEl.textContent = sim.map.name;
  }

  showPause(paused: boolean): void {
    if (paused) {
      this.pauseOverlayEl.classList.remove('hidden');
    } else {
      this.pauseOverlayEl.classList.add('hidden');
      this.settingsOverlayEl.classList.add('hidden');
    }
  }

  showGameOver(sim: GameSimulation, totalCampaignScore: number): void {
    const litCount = sim.lanterns.filter((l) => l.lit).length;
    const required = sim.getWinLanternThreshold();
    this.pauseOverlayEl.classList.add('hidden');
    this.overlayEl.classList.remove('hidden');
    this.nightPickerEl.classList.add('hidden');
    this.statsEl.classList.remove('hidden');

    if (sim.state === 'won' && sim.night === 3) {
      this.overlayEl.classList.add('dawn-theme');
      this.eyebrowEl.textContent = 'BÌNH MINH ĐÃ LÊN TRÊN BA HÒN ĐẢO';
      this.titleEl.textContent = 'Hoàn thành Đảo Đèn Lồng!';
      this.descEl.textContent =
        'Mây đã giữ ngọn đèn sáng suốt 3 đêm dài tới tận bình minh! Ánh nắng sớm tràn về trên Đảo Bến, Đảo Cau và Đảo Chuông.';
      this.statsEl.innerHTML = `
        <div><b>Đèn còn sáng lúc bình minh:</b> ${litCount} / ${sim.lanterns.length} (yêu cầu ≥ ${required})</div>
        <div><b>Điểm Đêm 3:</b> ${sim.score}</div>
        <div><b>Tổng điểm cả 3 Đêm:</b> ${totalCampaignScore}</div>
        <div><b>Ngọn lửa còn lại:</b> ${sim.player.flames} / ${sim.tuning.flames}</div>
      `;
      this.primaryBtn.textContent = 'Chơi lại từ Đêm 1';
      this.secondaryBtn.textContent = 'Về Menu chính';
      this.primaryAction = () => this.showNightIntro(1);
      this.secondaryAction = () => this.cb.onBackToMenu();
      return;
    }

    this.overlayEl.classList.remove('dawn-theme');
    if (sim.state === 'won') {
      const nextNight = (sim.night + 1) as 2 | 3;
      this.eyebrowEl.textContent = `VƯỢT QUA ĐÊM ${sim.night} TỚI BÌNH MINH`;
      this.titleEl.textContent = `${sim.map.name} đã giữ trọn ánh sáng!`;
      this.descEl.textContent = `Mây đã giữ ${litCount}/${sim.lanterns.length} Đèn Lồng sáng đến bình minh (đạt chuẩn ≥ ${required}). Tiến tới Đêm ${nextNight}!`;
      this.statsEl.innerHTML = `
        <div><b>Điểm Đêm ${sim.night}:</b> ${sim.score}</div>
        <div><b>Tổng điểm tích lũy:</b> ${totalCampaignScore}</div>
        <div><b>Ngọn lửa còn lại:</b> ${sim.player.flames} / ${sim.tuning.flames}</div>
      `;
      this.primaryBtn.textContent = `Sang Đêm ${nextNight}`;
      this.secondaryBtn.textContent = 'Về Menu chính';
      this.primaryAction = () => this.showNightIntro(nextNight);
      this.secondaryAction = () => this.cb.onBackToMenu();
    } else {
      this.eyebrowEl.textContent = `ĐÊM ${sim.night} THẤT BẠI`;
      this.titleEl.textContent =
        sim.gameOverReason === 'dawn' ? 'Bình minh lên trong bóng tối...' : 'Ngọn lửa đã tắt...';
      this.descEl.textContent =
        sim.gameOverReason === 'dawn'
          ? `Chỉ còn ${litCount}/${sim.lanterns.length} đèn sáng khi bình minh đến (cần ít nhất ${required} đèn). Hãy châm dầu và chặn Bóng Mực hút dầu!`
          : 'Mây đã mất hết Ngọn Lửa. Dùng Shift để lướt, Q để tỏa sáng hoặc giữ đèn trên 30% dầu để bảo vệ vùng an toàn!';
      this.statsEl.innerHTML = `
        <div><b>Đèn còn sáng:</b> ${litCount} / ${sim.lanterns.length} (cần ${required})</div>
        <div><b>Điểm Đêm ${sim.night}:</b> ${sim.score}</div>
        <div><b>Thời gian còn lại:</b> ${formatTime(sim.timeLeftS)}</div>
      `;
      this.primaryBtn.textContent = `Chơi lại Đêm ${sim.night}`;
      this.secondaryBtn.textContent = 'Về Menu chính';
      this.primaryAction = () => this.cb.onReplayNight();
      this.secondaryAction = () => this.cb.onBackToMenu();
    }
  }

  update(
    sim: GameSimulation,
    offscreenArrow: { visible: boolean; x: number; y: number; angleDeg: number }
  ): void {
    // Top-left: Flames + Wind Charm
    this.flamesEl.textContent = sim.player.flames > 0 ? '🔥'.repeat(sim.player.flames) : '—';
    if (sim.player.charmTimer > 0) {
      this.charmBadgeEl.classList.remove('hidden');
      this.charmTimeEl.textContent = `${sim.player.charmTimer.toFixed(1)}s`;
    } else {
      this.charmBadgeEl.classList.add('hidden');
    }

    // Top-center: Timer (turns danger color & blinks <= 30s; adds ⚠ in colorblind mode)
    const timeStr = formatTime(sim.timeLeftS);
    if (sim.timeLeftS <= 30) {
      this.timeEl.classList.add('urgent');
      this.timeEl.textContent = this.colorblindMode ? `⚠ ${timeStr}` : timeStr;
    } else {
      this.timeEl.classList.remove('urgent');
      this.timeEl.textContent = timeStr;
    }

    // Low-fuel / draining lantern alert (with ⚠ icon)
    const lowFuelLanterns = sim.lanterns.filter((l) => sim.isLowFuel(l));
    if (lowFuelLanterns.length > 0) {
      const ids = lowFuelLanterns.map((l) => l.id).join(', ');
      this.lowFuelBadgeEl.textContent = `⚠ Đèn sắp cạn dầu (${ids})!`;
      this.lowFuelBadgeEl.classList.remove('hidden');
    } else {
      this.lowFuelBadgeEl.classList.add('hidden');
    }

    if (sim.wind.active) {
      this.windBadgeEl.textContent = `💨 Gió mạnh đang đẩy (${Math.round(sim.wind.dirDeg)}°)`;
      this.windBadgeEl.classList.remove('hidden');
    } else if (sim.wind.warning) {
      this.windBadgeEl.textContent = this.colorblindMode
        ? '⚠ Gió mạnh sắp nổi lên...'
        : '🍃 Cảnh báo: Gió mạnh sắp nổi lên...';
      this.windBadgeEl.classList.remove('hidden');
    } else {
      this.windBadgeEl.classList.add('hidden');
    }

    // Top-right: Lanterns lit/total (min required) + Score
    const litCount = sim.lanterns.filter((l) => l.lit).length;
    const req = sim.getWinLanternThreshold();
    this.lanternsEl.textContent = `${litCount} / ${sim.lanterns.length} (cần ${req})`;
    this.scoreEl.textContent = String(sim.score);

    // Bottom-center: Dynamic firefly bar (carried / capacity, 10..20)
    const cap = sim.player.capacity;
    this.ensureSlotCount(cap);
    this.motesCountEl.textContent = `${sim.player.carried} / ${cap}`;
    for (let i = 0; i < this.moteSlots.length; i++) {
      this.moteSlots[i].classList.toggle('filled', i < sim.player.carried);
    }

    // Bottom-right: Dash & Pulse cooldown icons
    if (sim.player.charmTimer > 0) {
      this.iconDashEl.className = 'skill-icon ready';
      this.cdDashEl.textContent = 'Không hồi ✨';
    } else if (sim.player.dashCooldown > 0) {
      this.iconDashEl.className = 'skill-icon cooldown';
      this.cdDashEl.textContent = `${sim.player.dashCooldown.toFixed(1)}s`;
    } else {
      this.iconDashEl.className = 'skill-icon ready';
      this.cdDashEl.textContent = 'Sẵn sàng';
    }

    if (sim.player.pulseCooldown > 0) {
      this.iconPulseEl.className = 'skill-icon cooldown';
      this.cdPulseEl.textContent = `${sim.player.pulseCooldown.toFixed(1)}s`;
    } else if (sim.player.carried < sim.tuning.pulse_cost) {
      this.iconPulseEl.className = 'skill-icon cooldown';
      this.cdPulseEl.textContent = `Cần ${sim.tuning.pulse_cost} đom đóm`;
    } else {
      this.iconPulseEl.className = 'skill-icon ready';
      this.cdPulseEl.textContent = 'Sẵn sàng ✨';
    }

    // Contextual interact prompt (unlit first/relight OR lit below 100 fuel)
    let nearestEligible: LanternEntity | null = null;
    let bestDist = Infinity;
    for (const l of sim.lanterns) {
      const eligible = l.lit ? sim.getLanternFuel(l) < sim.tuning.fuel_max : true;
      if (!eligible) continue;
      const d = Math.hypot(sim.player.x - l.x, sim.player.z - l.z);
      if (
        d <= sim.tuning.interact_radius &&
        Math.abs(sim.player.y - l.y) <= 2.5 &&
        (d < bestDist - 1e-9 ||
          (Math.abs(d - bestDist) <= 1e-9 && (!nearestEligible || l.id < nearestEligible.id)))
      ) {
        bestDist = d;
        nearestEligible = l;
      }
    }
    if (nearestEligible) {
      if (nearestEligible.lit) {
        const fuelVal = sim.getLanternFuel(nearestEligible);
        const fuelLabel = fuelVal >= 99 ? `${fuelVal.toFixed(1)}%` : `${Math.floor(fuelVal)}%`;
        this.actionHintEl.textContent = `E — Châm dầu ${nearestEligible.id} (${fuelLabel})`;
      } else {
        const cost = sim.getLanternLightCost(nearestEligible);
        const verb = nearestEligible.everLit ? 'Thắp lại' : 'Nạp ánh sáng';
        this.actionHintEl.textContent = `E — ${verb} (${nearestEligible.deposited}/${cost})`;
      }
      this.actionHintEl.classList.remove('hidden');
    } else {
      this.actionHintEl.classList.add('hidden');
    }

    // Off-screen arrow indicator
    if (offscreenArrow.visible) {
      this.arrowEl.classList.remove('hidden');
      this.arrowEl.style.left = `${offscreenArrow.x}px`;
      this.arrowEl.style.top = `${offscreenArrow.y}px`;
      this.arrowEl.style.transform = `rotate(${offscreenArrow.angleDeg}deg)`;
    } else {
      this.arrowEl.classList.add('hidden');
    }
  }
}
