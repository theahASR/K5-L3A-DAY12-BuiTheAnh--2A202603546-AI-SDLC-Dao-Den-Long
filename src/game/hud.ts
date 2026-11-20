import type { GameSimulation } from '../core/simulation';

function formatTime(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const mins = Math.floor(s / 60);
  const rem = s % 60;
  return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
}

export class HudController {
  private readonly hudEl = document.getElementById('hud')!;
  private readonly controlsBarEl = document.getElementById('controls-bar')!;
  private readonly lanternsEl = document.getElementById('hud-lanterns')!;
  private readonly motesEl = document.getElementById('hud-motes')!;
  private readonly flamesEl = document.getElementById('hud-flames')!;
  private readonly timeEl = document.getElementById('hud-time')!;
  private readonly scoreEl = document.getElementById('hud-score')!;
  private readonly pulseEl = document.getElementById('hud-pulse')!;
  private readonly actionHintEl = document.getElementById('action-hint')!;

  private readonly overlayEl = document.getElementById('overlay')!;
  private readonly overlayTitleEl = document.getElementById('overlay-title')!;
  private readonly overlayDescEl = document.getElementById('overlay-desc')!;
  private readonly overlayStatsEl = document.getElementById('overlay-stats')!;
  private readonly overlayBtnEl = document.getElementById('overlay-btn') as HTMLButtonElement;

  constructor(onStartOrReplay: () => void) {
    this.overlayBtnEl.addEventListener('click', onStartOrReplay);
  }

  showPlaying(): void {
    this.overlayEl.classList.add('hidden');
    this.hudEl.classList.remove('hidden');
    this.controlsBarEl.classList.remove('hidden');
  }

  showGameOver(sim: GameSimulation): void {
    const litCount = sim.lanterns.filter((l) => l.lit).length;
    this.overlayEl.classList.remove('hidden');
    this.overlayStatsEl.classList.remove('hidden');

    if (sim.state === 'won') {
      this.overlayTitleEl.textContent = 'Đảo Đèn Lồng đã bừng sáng!';
      this.overlayDescEl.textContent =
        'Mây đã thắp lại toàn bộ Đèn Lồng Lớn, xua tan màn sương đêm trên Đảo Bến.';
    } else if (sim.gameOverReason === 'dawn') {
      this.overlayTitleEl.textContent = 'Bình minh đã lên...';
      this.overlayDescEl.textContent =
        'Thời gian của Đêm 1 đã hết trước khi tất cả Đèn Lồng Lớn được thắp sáng.';
    } else {
      this.overlayTitleEl.textContent = 'Ngọn lửa đã tắt...';
      this.overlayDescEl.textContent =
        'Bóng Mực đã làm tắt hết ngọn lửa của Mây. Hãy dùng Tỏa sáng (Q/Shift) hoặc trú gần đèn đã thắp!';
    }

    this.overlayStatsEl.innerHTML = `
      <div><b>Điểm số:</b> ${sim.score}</div>
      <div><b>Đèn đã thắp:</b> ${litCount} / ${sim.lanterns.length}</div>
      <div><b>Ngọn lửa còn lại:</b> ${sim.player.flames} / ${sim.tuning.flames}</div>
      <div><b>Thời gian còn lại:</b> ${formatTime(sim.timeLeftS)}</div>
    `;
    this.overlayBtnEl.textContent = 'Chơi lại Đêm 1';
  }

  update(sim: GameSimulation): void {
    const litCount = sim.lanterns.filter((l) => l.lit).length;
    this.lanternsEl.textContent = `${litCount} / ${sim.lanterns.length}`;
    this.motesEl.textContent = `${sim.player.carried} / ${sim.tuning.carry_capacity}`;
    this.flamesEl.textContent =
      sim.player.flames > 0 ? '🔥'.repeat(sim.player.flames) : '—';
    this.timeEl.textContent = formatTime(sim.timeLeftS);
    this.scoreEl.textContent = String(sim.score);

    if (sim.player.pulseCooldown > 0) {
      this.pulseEl.innerHTML = `<b>Q / Shift</b> Tỏa sáng (${sim.player.pulseCooldown.toFixed(1)}s)`;
    } else if (sim.player.carried < sim.tuning.pulse_cost) {
      this.pulseEl.innerHTML = `<b>Q / Shift</b> Tỏa sáng (cần ${sim.tuning.pulse_cost} đom đóm)`;
    } else {
      this.pulseEl.innerHTML = `<b>Q / Shift</b> Tỏa sáng sẵn sàng ✨`;
    }

    // Contextual hint when standing near an unlit lantern
    const nearUnlit = sim.lanterns.find(
      (l) =>
        !l.lit &&
        Math.hypot(sim.player.x - l.x, sim.player.z - l.z) <= sim.tuning.interact_radius
    );
    if (nearUnlit && sim.player.carried > 0) {
      const need = sim.tuning.lantern_cost - nearUnlit.deposited;
      this.actionHintEl.textContent = `Nhấn [E] để nạp ánh sáng vào ${nearUnlit.id} (${nearUnlit.deposited}/${sim.tuning.lantern_cost}, cần thêm ${need})`;
      this.actionHintEl.classList.remove('hidden');
    } else if (nearUnlit && sim.player.carried === 0) {
      this.actionHintEl.textContent = `${nearUnlit.id}: cần thêm ${sim.tuning.lantern_cost - nearUnlit.deposited} đom đóm`;
      this.actionHintEl.classList.remove('hidden');
    } else {
      this.actionHintEl.classList.add('hidden');
    }
  }
}
