import { validatePlayerName, type LeaderboardEntry } from '../core/leaderboard';
import { NIGHT_MAPS } from '../core/maps';
import type { GameSimulation } from '../core/simulation';
import type { LanternEntity } from '../core/types';
import { fetchLeaderboard, submitLeaderboardScore } from './leaderboardStore';
import type { ScreenEdgeArrow } from './renderer3d';
import {
  ACTION_LABELS,
  BINDABLE_ACTIONS,
  DEFAULT_KEYBINDINGS,
  findKeyConflict,
  formatKeyCode,
  type BindableAction,
  type GameSettings,
} from './settings';

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
  onKeybindCaptureToggle: (listening: boolean) => void;
}

export class HudController {
  private readonly hudEl = document.getElementById('hud')!;
  private readonly hitFlashEl = document.getElementById('hit-flash')!;
  private readonly flamesEl = document.getElementById('hud-flames')!;
  private readonly charmBadgeEl = document.getElementById('hud-charm-badge')!;
  private readonly charmTimeEl = document.getElementById('hud-charm-time')!;
  private readonly nightLabelEl = document.getElementById('hud-night-label')!;
  private readonly timeEl = document.getElementById('hud-time')!;
  private readonly captionCountdownEl = document.getElementById('caption-countdown')!;
  private readonly captionShadeEl = document.getElementById('caption-shade')!;
  private readonly captionLowFuelEl = document.getElementById('caption-low-fuel')!;
  private readonly captionWindEl = document.getElementById('caption-wind')!;
  private readonly lanternsEl = document.getElementById('hud-lanterns')!;
  private readonly scoreEl = document.getElementById('hud-score')!;
  private readonly motesCountEl = document.getElementById('hud-motes-count')!;
  private readonly moteSlotsEl = document.getElementById('mote-slots')!;
  private readonly actionHintEl = document.getElementById('action-hint')!;
  private readonly arrowEl = document.getElementById('offscreen-arrow')!;
  private readonly shadeArrowEl = document.getElementById('shade-arrow')!;

  private readonly iconDashEl = document.getElementById('icon-dash')!;
  private readonly keyDashEl = document.getElementById('key-dash')!;
  private readonly cdDashEl = document.getElementById('cd-dash')!;
  private readonly iconPulseEl = document.getElementById('icon-pulse')!;
  private readonly keyPulseEl = document.getElementById('key-pulse')!;
  private readonly cdPulseEl = document.getElementById('cd-pulse')!;

  private readonly overlayEl = document.getElementById('overlay')!;
  private readonly eyebrowEl = document.getElementById('overlay-eyebrow')!;
  private readonly titleEl = document.getElementById('overlay-title')!;
  private readonly descEl = document.getElementById('overlay-desc')!;
  private readonly statsEl = document.getElementById('overlay-stats')!;
  private readonly nightPickerEl = document.getElementById('night-picker')!;
  private readonly menuControlsEl = document.getElementById('menu-controls-summary')!;
  private readonly primaryBtn = document.getElementById('overlay-primary-btn') as HTMLButtonElement;
  private readonly lbBtn = document.getElementById('overlay-lb-btn') as HTMLButtonElement;
  private readonly secondaryBtn = document.getElementById(
    'overlay-secondary-btn'
  ) as HTMLButtonElement;

  private readonly lbSaveForm = document.getElementById('lb-save-form') as HTMLFormElement;
  private readonly lbNameInput = document.getElementById('lb-name-input') as HTMLInputElement;
  private readonly lbSaveBtn = document.getElementById('lb-save-btn') as HTMLButtonElement;
  private readonly lbSaveMsg = document.getElementById('lb-save-msg')!;
  private readonly lbOverlayEl = document.getElementById('leaderboard-overlay')!;
  private readonly lbTableWrapEl = document.getElementById('lb-table-wrap')!;

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
  private readonly reduceMotionInput = document.getElementById(
    'setting-reduce-motion'
  ) as HTMLInputElement;
  private readonly largeTextInput = document.getElementById(
    'setting-large-text'
  ) as HTMLInputElement;
  private readonly keybindListEl = document.getElementById('keybind-list')!;
  private readonly keybindStatusEl = document.getElementById('keybind-status')!;

  private readonly moteSlots: HTMLDivElement[] = [];
  private selectedNight: 1 | 2 | 3 = 1;
  private primaryAction: () => void = () => {};
  private secondaryAction: () => void = () => {};
  private settingsReturnToPause = false;
  private settings: GameSettings;
  private listeningAction: BindableAction | null = null;

  private pendingSaveMeta: { score: number; nightsWon: number; seed: number } | null = null;
  private shadeCaptionTimer = 0;

  constructor(private readonly cb: HudCallbacks, initialSettings: GameSettings) {
    this.settings = {
      ...initialSettings,
      keybindings: { ...initialSettings.keybindings },
    };
    this.ensureSlotCount(10);

    // Night picker
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
    this.lbBtn.addEventListener('click', () => this.openLeaderboard());
    document.getElementById('btn-close-lb')!.addEventListener('click', () => {
      this.lbOverlayEl.classList.add('hidden');
      this.overlayEl.classList.remove('hidden');
    });

    // Save score to local disk leaderboard
    this.lbSaveForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!this.pendingSaveMeta) return;
      const check = validatePlayerName(this.lbNameInput.value);
      if (!check.valid) {
        this.lbSaveMsg.textContent = check.error ?? 'Tên không hợp lệ.';
        this.lbSaveMsg.classList.add('error');
        return;
      }
      this.lbSaveBtn.disabled = true;
      try {
        await submitLeaderboardScore({
          name: check.name,
          score: this.pendingSaveMeta.score,
          nights_won: this.pendingSaveMeta.nightsWon,
          seed: this.pendingSaveMeta.seed,
        });
        this.lbSaveMsg.textContent = `Đã lưu điểm của "${check.name}" vào Bảng xếp hạng!`;
        this.lbSaveMsg.classList.remove('error');
        this.lbNameInput.disabled = true;
      } catch (err) {
        this.lbSaveMsg.textContent = (err as Error).message;
        this.lbSaveMsg.classList.add('error');
        this.lbSaveBtn.disabled = false;
      }
    });

    document.getElementById('btn-resume')!.addEventListener('click', () => cb.onResume());
    document.getElementById('btn-replay-night')!.addEventListener('click', () => cb.onReplayNight());
    document.getElementById('btn-pause-settings')!.addEventListener('click', () => {
      this.openSettings(true);
    });
    this.backMenuBtn.addEventListener('click', () => cb.onBackToMenu());
    document.getElementById('btn-close-settings')!.addEventListener('click', () => {
      this.closeSettings();
    });
    document.getElementById('btn-reset-keys')!.addEventListener('click', () => {
      this.settings.keybindings = { ...DEFAULT_KEYBINDINGS };
      this.listeningAction = null;
      this.cb.onKeybindCaptureToggle(false);
      this.keybindStatusEl.textContent = 'Đã khôi phục phím mặc định.';
      this.renderKeybindList();
      this.pushSettings();
    });

    window.addEventListener('keydown', this.handleRebindKeyDown, true);

    // Initialize Settings controls
    this.volumeInput.value = String(Math.round(this.settings.volume * 100));
    this.volumeValEl.textContent = `${this.volumeInput.value}%`;
    this.sensInput.value = String(Math.round(this.settings.mouseSensitivity * 100));
    this.sensValEl.textContent = this.settings.mouseSensitivity.toFixed(2);
    this.colorblindInput.checked = this.settings.colorblindMode;
    this.reduceMotionInput.checked = this.settings.reduceMotion;
    this.largeTextInput.checked = this.settings.largeText;

    this.applyAccessibilityClasses();
    this.renderKeybindList();
    this.refreshControlLabels();

    const onControlChange = () => {
      this.settings.volume = Number(this.volumeInput.value) / 100;
      this.settings.mouseSensitivity = Number(this.sensInput.value) / 100;
      this.settings.colorblindMode = this.colorblindInput.checked;
      this.settings.reduceMotion = this.reduceMotionInput.checked;
      this.settings.largeText = this.largeTextInput.checked;
      this.volumeValEl.textContent = `${Math.round(this.settings.volume * 100)}%`;
      this.sensValEl.textContent = this.settings.mouseSensitivity.toFixed(2);
      this.applyAccessibilityClasses();
      this.pushSettings();
    };
    this.volumeInput.addEventListener('input', onControlChange);
    this.sensInput.addEventListener('input', onControlChange);
    this.colorblindInput.addEventListener('change', onControlChange);
    this.reduceMotionInput.addEventListener('change', onControlChange);
    this.largeTextInput.addEventListener('change', onControlChange);
  }

  private pushSettings(): void {
    this.refreshControlLabels();
    this.cb.onSettingsChange({
      ...this.settings,
      keybindings: { ...this.settings.keybindings },
    });
  }

  private applyAccessibilityClasses(): void {
    document.body.classList.toggle('colorblind-mode', this.settings.colorblindMode);
    document.body.classList.toggle('reduce-motion', this.settings.reduceMotion);
    document.body.classList.toggle('large-text', this.settings.largeText);
    this.backMenuBtn.textContent = this.settings.colorblindMode
      ? '⚠ Về Menu chính'
      : 'Về Menu chính';
  }

  private refreshControlLabels(): void {
    const kb = this.settings.keybindings;
    const f = formatKeyCode;
    this.keyDashEl.textContent = f(kb.dash);
    this.keyPulseEl.textContent = f(kb.pulse);
    this.menuControlsEl.innerHTML = `
      <div><b>${f(kb.moveForward)}/${f(kb.moveLeft)}/${f(kb.moveBackward)}/${f(kb.moveRight)}</b> Di chuyển</div>
      <div><b>${f(kb.jump)}</b> Nhảy</div>
      <div><b>${f(kb.dash)}</b> Lướt</div>
      <div><b>${f(kb.interact)}</b> Thắp / Châm dầu</div>
      <div><b>${f(kb.pulse)}</b> Tỏa Sáng</div>
      <div><b>${f(kb.pause)}</b> Tạm dừng</div>
    `;
  }

  private renderKeybindList(): void {
    this.keybindListEl.innerHTML = '';
    for (const action of BINDABLE_ACTIONS) {
      const row = document.createElement('div');
      row.className = 'keybind-row';

      const label = document.createElement('span');
      label.textContent = ACTION_LABELS[action];

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'keybind-btn';
      if (this.listeningAction === action) {
        btn.classList.add('listening');
        btn.textContent = 'Nhấn phím...';
      } else {
        btn.textContent = formatKeyCode(this.settings.keybindings[action]);
      }

      btn.addEventListener('click', () => {
        this.listeningAction = action;
        this.cb.onKeybindCaptureToggle(true);
        this.keybindStatusEl.textContent = `Đang chờ phím mới cho "${ACTION_LABELS[action]}"...`;
        this.renderKeybindList();
      });

      row.appendChild(label);
      row.appendChild(btn);
      this.keybindListEl.appendChild(row);
    }
  }

  private handleRebindKeyDown = (e: KeyboardEvent): void => {
    if (!this.listeningAction) return;
    e.preventDefault();
    e.stopPropagation();

    const code = e.code;
    const conflict = findKeyConflict(this.settings.keybindings, this.listeningAction, code);
    if (conflict) {
      this.keybindStatusEl.textContent = `⚠ Phím "${formatKeyCode(code)}" đã trùng với "${ACTION_LABELS[conflict]}"! Hãy chọn phím khác.`;
      return;
    }

    this.settings.keybindings[this.listeningAction] = code;
    this.keybindStatusEl.textContent = `Đã gán "${formatKeyCode(code)}" cho "${ACTION_LABELS[this.listeningAction]}".`;
    this.listeningAction = null;
    this.cb.onKeybindCaptureToggle(false);
    this.renderKeybindList();
    this.pushSettings();
  };

  async openLeaderboard(): Promise<void> {
    this.overlayEl.classList.add('hidden');
    this.lbOverlayEl.classList.remove('hidden');
    this.lbTableWrapEl.innerHTML = '<p>Đang tải bảng xếp hạng...</p>';
    const entries = await fetchLeaderboard();
    this.renderLeaderboardTable(entries);
  }

  private renderLeaderboardTable(entries: LeaderboardEntry[]): void {
    this.lbTableWrapEl.textContent = '';
    if (entries.length === 0) {
      const p = document.createElement('p');
      p.textContent =
        'Chưa có kỷ lục nào được lưu. Hoàn thành hoặc kết thúc một lượt chơi để ghi tên lên bảng!';
      this.lbTableWrapEl.appendChild(p);
      return;
    }

    const table = document.createElement('table');
    table.className = 'lb-table';

    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    for (const col of ['Hạng', 'Tên', 'Điểm', 'Đêm thắng', 'Thời điểm', 'Seed']) {
      const th = document.createElement('th');
      th.textContent = col;
      headRow.appendChild(th);
    }
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    entries.forEach((e, idx) => {
      const tr = document.createElement('tr');
      const cells: Array<{ text: string; cls?: string; bold?: boolean }> = [
        { text: `#${idx + 1}` },
        { text: e.name, bold: true },
        { text: String(e.score), cls: 'score-val' },
        { text: `${e.nights_won} / 3` },
        { text: e.achieved_at.replace('T', ' ').slice(0, 19) },
        { text: String(e.seed) },
      ];
      for (const c of cells) {
        const td = document.createElement('td');
        if (c.cls) td.className = c.cls;
        if (c.bold) {
          const b = document.createElement('b');
          b.textContent = c.text;
          td.appendChild(b);
        } else {
          td.textContent = c.text;
        }
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    this.lbTableWrapEl.appendChild(table);
  }

  triggerHitFlash(): void {
    if (this.settings.reduceMotion) return;
    this.hitFlashEl.classList.remove('hidden');
    this.hitFlashEl.style.animation = 'none';
    void this.hitFlashEl.offsetWidth;
    this.hitFlashEl.style.animation = '';
    setTimeout(() => this.hitFlashEl.classList.add('hidden'), 360);
  }

  notifyShadeSpawned(shadeId: string): void {
    this.shadeCaptionTimer = 4.0;
    this.captionShadeEl.textContent = `⚠ Bóng Mực ${shadeId} vừa xuất hiện!`;
    this.captionShadeEl.classList.remove('hidden');
  }

  hideAllForBench(): void {
    this.hudEl.classList.add('hidden');
    this.overlayEl.classList.add('hidden');
    this.pauseOverlayEl.classList.add('hidden');
    this.settingsOverlayEl.classList.add('hidden');
    this.lbOverlayEl.classList.add('hidden');
  }

  private ensureSlotCount(capacity: number): void {
    while (this.moteSlots.length < capacity) {
      const slot = document.createElement('div');
      slot.className = 'mote-slot';
      this.moteSlotsEl.appendChild(slot);
      this.moteSlots.push(slot);
    }
    while (this.moteSlots.length > capacity) {
      this.moteSlots.pop()?.remove();
    }
  }

  openSettings(fromPause: boolean): void {
    this.settingsReturnToPause = fromPause;
    if (fromPause) this.pauseOverlayEl.classList.add('hidden');
    else this.overlayEl.classList.add('hidden');
    this.settingsOverlayEl.classList.remove('hidden');
  }

  closeSettings(): void {
    this.listeningAction = null;
    this.cb.onKeybindCaptureToggle(false);
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
    this.lbOverlayEl.classList.add('hidden');
    this.lbSaveForm.classList.add('hidden');
    this.overlayEl.classList.remove('hidden', 'dawn-theme');
    this.statsEl.classList.add('hidden');
    this.nightPickerEl.classList.remove('hidden');
    this.lbBtn.classList.remove('hidden');

    this.eyebrowEl.textContent = 'PHIÊN BẢN PHÁT HÀNH v1.0.0';
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
    this.lbSaveForm.classList.add('hidden');
    this.lbBtn.classList.add('hidden');
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
    this.secondaryAction = () => this.cb.onBackToMenu();
  }

  showPlaying(sim: GameSimulation): void {
    this.overlayEl.classList.add('hidden');
    this.pauseOverlayEl.classList.add('hidden');
    this.settingsOverlayEl.classList.add('hidden');
    this.lbOverlayEl.classList.add('hidden');
    this.hudEl.classList.remove('hidden');
    this.nightLabelEl.textContent = sim.map.name;
    this.shadeCaptionTimer = 0;
    this.captionShadeEl.classList.add('hidden');
  }

  showPause(paused: boolean): void {
    if (paused) {
      this.pauseOverlayEl.classList.remove('hidden');
    } else {
      this.pauseOverlayEl.classList.add('hidden');
      this.settingsOverlayEl.classList.add('hidden');
    }
  }

  private enableLeaderboardSave(score: number, nightsWon: number, seed: number): void {
    this.pendingSaveMeta = { score, nightsWon, seed };
    this.lbSaveForm.classList.remove('hidden');
    this.lbNameInput.disabled = false;
    this.lbNameInput.value = '';
    this.lbSaveBtn.disabled = false;
    this.lbSaveMsg.textContent = '';
    this.lbSaveMsg.classList.remove('error');
  }

  showGameOver(
    sim: GameSimulation,
    totalCampaignScore: number,
    nightsWon: number
  ): void {
    const litCount = sim.lanterns.filter((l) => l.lit).length;
    const required = sim.getWinLanternThreshold();
    this.pauseOverlayEl.classList.add('hidden');
    this.overlayEl.classList.remove('hidden');
    this.nightPickerEl.classList.add('hidden');
    this.statsEl.classList.remove('hidden');
    this.lbBtn.classList.remove('hidden');

    if (sim.state === 'won' && sim.night === 3) {
      this.overlayEl.classList.add('dawn-theme');
      this.eyebrowEl.textContent = 'BÌNH MINH ĐÃ LÊN TRÊN BA HÒN ĐẢO';
      this.titleEl.textContent = 'Hoàn thành Đảo Đèn Lồng!';
      this.descEl.textContent =
        'Mây đã giữ ngọn đèn sáng suốt 3 đêm dài tới tận bình minh! Hãy ghi tên lên Bảng xếp hạng!';
      this.statsEl.innerHTML = `
        <div><b>Đèn còn sáng lúc bình minh:</b> ${litCount} / ${sim.lanterns.length} (≥ ${required})</div>
        <div><b>Điểm Đêm 3:</b> ${sim.score} · <b>Tổng điểm:</b> ${totalCampaignScore}</div>
      `;
      this.enableLeaderboardSave(totalCampaignScore, nightsWon, sim.seed);
      this.primaryBtn.textContent = 'Chơi lại từ Đêm 1';
      this.secondaryBtn.textContent = 'Về Menu chính';
      this.primaryAction = () => this.showNightIntro(1);
      this.secondaryAction = () => this.cb.onBackToMenu();
      return;
    }

    this.overlayEl.classList.remove('dawn-theme');
    if (sim.state === 'won') {
      const nextNight = (sim.night + 1) as 2 | 3;
      this.lbSaveForm.classList.add('hidden');
      this.eyebrowEl.textContent = `VƯỢT QUA ĐÊM ${sim.night} TỚI BÌNH MINH`;
      this.titleEl.textContent = `${sim.map.name} đã giữ trọn ánh sáng!`;
      this.descEl.textContent = `Mây đã giữ ${litCount}/${sim.lanterns.length} đèn sáng đến bình minh (đạt ≥ ${required}). Tiến tới Đêm ${nextNight}!`;
      this.statsEl.innerHTML = `
        <div><b>Điểm Đêm ${sim.night}:</b> ${sim.score} · <b>Tổng tích lũy:</b> ${totalCampaignScore}</div>
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
          ? `Chỉ còn ${litCount}/${sim.lanterns.length} đèn sáng khi bình minh đến (cần ≥ ${required} đèn).`
          : 'Mây đã mất hết Ngọn Lửa. Hãy lưu thành tích hoặc thử lại Đêm này!';
      this.statsEl.innerHTML = `
        <div><b>Tổng điểm các Đêm đã thắng:</b> ${totalCampaignScore} · <b>Đêm thắng:</b> ${nightsWon}/3</div>
        <div><b>Điểm Đêm ${sim.night}:</b> ${sim.score} · <b>Đèn sáng:</b> ${litCount}/${sim.lanterns.length}</div>
      `;
      this.enableLeaderboardSave(totalCampaignScore, nightsWon, sim.seed);
      this.primaryBtn.textContent = `Chơi lại Đêm ${sim.night}`;
      this.secondaryBtn.textContent = 'Về Menu chính';
      this.primaryAction = () => this.cb.onReplayNight();
      this.secondaryAction = () => this.cb.onBackToMenu();
    }
  }

  update(
    sim: GameSimulation,
    lanternArrow: ScreenEdgeArrow,
    shadeArrow: ScreenEdgeArrow,
    dt: number
  ): void {
    // Flames + Charm
    this.flamesEl.textContent = sim.player.flames > 0 ? '🔥'.repeat(sim.player.flames) : '—';
    if (sim.player.charmTimer > 0) {
      this.charmBadgeEl.classList.remove('hidden');
      this.charmTimeEl.textContent = `${sim.player.charmTimer.toFixed(1)}s`;
    } else {
      this.charmBadgeEl.classList.add('hidden');
    }

    // Timer + Final 10s visual caption
    const timeStr = formatTime(sim.timeLeftS);
    if (sim.timeLeftS <= 30) {
      this.timeEl.classList.add('urgent');
      this.timeEl.textContent = this.settings.colorblindMode ? `⚠ ${timeStr}` : timeStr;
    } else {
      this.timeEl.classList.remove('urgent');
      this.timeEl.textContent = timeStr;
    }

    const secsLeft = Math.ceil(sim.timeLeftS);
    if (secsLeft <= 10 && secsLeft > 0) {
      this.captionCountdownEl.textContent = `⏱ Còn ${secsLeft} giây tới bình minh!`;
      this.captionCountdownEl.classList.remove('hidden');
    } else {
      this.captionCountdownEl.classList.add('hidden');
    }

    // Shade spawn caption timer
    if (this.shadeCaptionTimer > 0) {
      this.shadeCaptionTimer = Math.max(0, this.shadeCaptionTimer - dt);
      if (this.shadeCaptionTimer === 0) {
        this.captionShadeEl.classList.add('hidden');
      }
    }

    // Low-fuel (< 30) lantern caption
    const lowFuelLanterns = sim.lanterns.filter((l) => sim.isLowFuel(l));
    if (lowFuelLanterns.length > 0) {
      const ids = lowFuelLanterns.map((l) => l.id).join(', ');
      this.captionLowFuelEl.textContent = `⚠ Đèn ${ids} sắp cạn dầu (< 30%)!`;
      this.captionLowFuelEl.classList.remove('hidden');
    } else {
      this.captionLowFuelEl.classList.add('hidden');
    }

    // Wind visual caption
    if (sim.wind.active) {
      this.captionWindEl.textContent = `💨 Gió mạnh đang thổi (${Math.round(sim.wind.dirDeg)}°)!`;
      this.captionWindEl.classList.remove('hidden');
    } else if (sim.wind.warning) {
      this.captionWindEl.textContent = '🍃 Gió mạnh sắp thổi!';
      this.captionWindEl.classList.remove('hidden');
    } else {
      this.captionWindEl.classList.add('hidden');
    }

    // Lanterns + Score
    const litCount = sim.lanterns.filter((l) => l.lit).length;
    const req = sim.getWinLanternThreshold();
    this.lanternsEl.textContent = `${litCount} / ${sim.lanterns.length} (cần ${req})`;
    this.scoreEl.textContent = String(sim.score);

    // Dynamic firefly bar
    const cap = sim.player.capacity;
    this.ensureSlotCount(cap);
    this.motesCountEl.textContent = `${sim.player.carried} / ${cap}`;
    for (let i = 0; i < this.moteSlots.length; i++) {
      this.moteSlots[i].classList.toggle('filled', i < sim.player.carried);
    }

    // Dash & Pulse cooldown icons
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
      this.cdPulseEl.textContent = `Cần ${sim.tuning.pulse_cost}`;
    } else {
      this.iconPulseEl.className = 'skill-icon ready';
      this.cdPulseEl.textContent = 'Sẵn sàng ✨';
    }

    // Contextual interact prompt using rebound interact key
    const interactKeyLabel = formatKeyCode(this.settings.keybindings.interact);
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
        this.actionHintEl.textContent = `${interactKeyLabel} — Châm dầu ${nearestEligible.id} (${fuelLabel})`;
      } else {
        const cost = sim.getLanternLightCost(nearestEligible);
        const verb = nearestEligible.everLit ? 'Thắp lại' : 'Nạp ánh sáng';
        this.actionHintEl.textContent = `${interactKeyLabel} — ${verb} (${nearestEligible.deposited}/${cost})`;
      }
      this.actionHintEl.classList.remove('hidden');
    } else {
      this.actionHintEl.classList.add('hidden');
    }

    // Offscreen arrows
    this.positionArrow(this.arrowEl, lanternArrow);
    this.positionArrow(this.shadeArrowEl, this.shadeCaptionTimer > 0 ? shadeArrow : { visible: false, x: 0, y: 0, angleDeg: 0 });
  }

  private positionArrow(el: HTMLElement, arrow: ScreenEdgeArrow): void {
    if (arrow.visible) {
      el.classList.remove('hidden');
      el.style.left = `${arrow.x}px`;
      el.style.top = `${arrow.y}px`;
      el.style.transform = `rotate(${arrow.angleDeg}deg)`;
    } else {
      el.classList.add('hidden');
    }
  }
}
