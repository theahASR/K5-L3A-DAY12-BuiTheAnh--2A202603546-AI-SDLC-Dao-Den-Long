import { NIGHT_MAPS } from '../core/maps';
import type { GameSimulation } from '../core/simulation';
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
  private readonly settingsOverlayEl = document.getElementById('settings-overlay')!;
  private readonly volumeInput = document.getElementById('setting-volume') as HTMLInputElement;
  private readonly volumeValEl = document.getElementById('setting-volume-val')!;
  private readonly sensInput = document.getElementById('setting-sens') as HTMLInputElement;
  private readonly sensValEl = document.getElementById('setting-sens-val')!;

  private readonly moteSlots: HTMLDivElement[] = [];
  private selectedNight: 1 | 2 | 3 = 1;
  private primaryAction: () => void = () => {};
  private secondaryAction: () => void = () => {};
  private settingsReturnToPause = false;

  constructor(private readonly cb: HudCallbacks, initialSettings: GameSettings) {
    // Build 10-slot firefly bar
    for (let i = 0; i < 10; i++) {
      const slot = document.createElement('div');
      slot.className = 'mote-slot';
      this.moteSlotsEl.appendChild(slot);
      this.moteSlots.push(slot);
    }

    // Night picker chips on main menu
    this.nightPickerEl.querySelectorAll<HTMLButtonElement>('.night-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        const n = Number(btn.dataset.night) as 1 | 2 | 3;
        this.selectedNight = n;
        this.nightPickerEl.querySelectorAll('.night-chip').forEach((b) => b.classList.remove('active'));
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
    document.getElementById('btn-back-menu')!.addEventListener('click', () => cb.onBackToMenu());
    document.getElementById('btn-close-settings')!.addEventListener('click', () => {
      this.closeSettings();
    });

    // Settings sliders
    this.volumeInput.value = String(Math.round(initialSettings.volume * 100));
    this.volumeValEl.textContent = `${this.volumeInput.value}%`;
    this.sensInput.value = String(Math.round(initialSettings.mouseSensitivity * 100));
    this.sensValEl.textContent = initialSettings.mouseSensitivity.toFixed(2);

    const emitSettings = () => {
      const volume = Number(this.volumeInput.value) / 100;
      const mouseSensitivity = Number(this.sensInput.value) / 100;
      this.volumeValEl.textContent = `${Math.round(volume * 100)}%`;
      this.sensValEl.textContent = mouseSensitivity.toFixed(2);
      cb.onSettingsChange({ volume, mouseSensitivity });
    };
    this.volumeInput.addEventListener('input', emitSettings);
    this.sensInput.addEventListener('input', emitSettings);
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

    this.eyebrowEl.textContent = 'DAY 12 · BA HÒN ĐẢO';
    this.titleEl.textContent = 'Đảo Đèn Lồng';
    this.descEl.textContent =
      'Cùng Mây vượt qua 3 Đêm — Đảo Bến, Đảo Cau và Đảo Chuông — gom đom đóm thắp sáng Đèn Lồng Lớn trước bình minh.';
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

    this.eyebrowEl.textContent = `HÀNH TRÌNH THẮP SÁNG · ĐÊM ${night} / 3`;
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
    this.pauseOverlayEl.classList.add('hidden');
    this.overlayEl.classList.remove('hidden');
    this.nightPickerEl.classList.add('hidden');
    this.statsEl.classList.remove('hidden');

    if (sim.state === 'won' && sim.night === 3) {
      // Final Dawn Screen (Bình Minh)
      this.overlayEl.classList.add('dawn-theme');
      this.eyebrowEl.textContent = 'BÌNH MINH ĐÃ LÊN TRÊN BA HÒN ĐẢO';
      this.titleEl.textContent = 'Hoàn thành Đảo Đèn Lồng!';
      this.descEl.textContent =
        'Ánh sáng từ Đảo Bến, Đảo Cau và Đảo Chuông đã hòa quyện xua tan màn sương đêm. Ông Đăng mỉm cười đón Mây trong nắng sớm!';
      this.statsEl.innerHTML = `
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
      this.eyebrowEl.textContent = `HOÀN THÀNH ĐÊM ${sim.night}`;
      this.titleEl.textContent = `${sim.map.name} đã bừng sáng!`;
      this.descEl.textContent = `Mây đã thắp đủ ${litCount}/${sim.lanterns.length} Đèn Lồng Lớn. Sẵn sàng tiến tới Đêm ${nextNight}!`;
      this.statsEl.innerHTML = `
        <div><b>Điểm Đêm ${sim.night}:</b> ${sim.score}</div>
        <div><b>Tổng điểm tích lũy:</b> ${totalCampaignScore}</div>
        <div><b>Thời gian còn lại:</b> ${formatTime(sim.timeLeftS)}</div>
      `;
      this.primaryBtn.textContent = `Sang Đêm ${nextNight}`;
      this.secondaryBtn.textContent = 'Về Menu chính';
      this.primaryAction = () => this.showNightIntro(nextNight);
      this.secondaryAction = () => this.cb.onBackToMenu();
    } else {
      this.eyebrowEl.textContent = `ĐÊM ${sim.night} THẤT BẠI`;
      this.titleEl.textContent =
        sim.gameOverReason === 'dawn' ? 'Bình minh đã lên...' : 'Ngọn lửa đã tắt...';
      this.descEl.textContent =
        sim.gameOverReason === 'dawn'
          ? 'Thời gian đã hết trước khi tất cả Đèn Lồng Lớn được thắp sáng.'
          : 'Mây đã mất hết Ngọn Lửa. Dùng Shift để lướt, Q để tỏa sáng hoặc trú gần đèn đã thắp!';
      this.statsEl.innerHTML = `
        <div><b>Đèn đã thắp:</b> ${litCount} / ${sim.lanterns.length}</div>
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

    // Top-center: Timer (turns #FF5A5F & blinks <= 30s) + Wind badge
    this.timeEl.textContent = formatTime(sim.timeLeftS);
    if (sim.timeLeftS <= 30) {
      this.timeEl.classList.add('urgent');
    } else {
      this.timeEl.classList.remove('urgent');
    }

    if (sim.wind.active) {
      this.windBadgeEl.textContent = `💨 Gió mạnh đang đẩy (${Math.round(sim.wind.dirDeg)}°)`;
      this.windBadgeEl.classList.remove('hidden');
    } else if (sim.wind.warning) {
      this.windBadgeEl.textContent = '🍃 Cảnh báo: Gió mạnh sắp nổi lên...';
      this.windBadgeEl.classList.remove('hidden');
    } else {
      this.windBadgeEl.classList.add('hidden');
    }

    // Top-right: Lanterns k/n + Score
    const litCount = sim.lanterns.filter((l) => l.lit).length;
    this.lanternsEl.textContent = `${litCount} / ${sim.lanterns.length}`;
    this.scoreEl.textContent = String(sim.score);

    // Bottom-center: 10-slot firefly bar
    this.motesCountEl.textContent = `${sim.player.carried} / ${sim.tuning.carry_capacity}`;
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

    // Contextual interact prompt: "E — Nạp ánh sáng (x/10)"
    let nearestUnlit = null;
    let bestDist = Infinity;
    for (const l of sim.lanterns) {
      if (l.lit) continue;
      const d = Math.hypot(sim.player.x - l.x, sim.player.z - l.z);
      if (d <= sim.tuning.interact_radius && Math.abs(sim.player.y - l.y) <= 2.5 && d < bestDist) {
        bestDist = d;
        nearestUnlit = l;
      }
    }
    if (nearestUnlit) {
      this.actionHintEl.textContent = `E — Nạp ánh sáng (${nearestUnlit.deposited}/${sim.tuning.lantern_cost})`;
      this.actionHintEl.classList.remove('hidden');
    } else {
      this.actionHintEl.classList.add('hidden');
    }

    // Off-screen arrow indicator toward nearest unlit lantern
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
