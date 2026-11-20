import type { InputState } from '../core/types';
import { DEFAULT_KEYBINDINGS, type Keybindings } from './settings';

/**
 * Translates rebindable keyboard + mouse drag into Contract v1.3 InputState.
 */
export class InputController {
  private readonly keys = new Set<string>();
  private camYawDeg = 0;
  private dragging = false;
  private lastMouseX = 0;
  mouseSensitivity = 0.35;
  keybindings: Keybindings = { ...DEFAULT_KEYBINDINGS };
  captureSuspended = false;

  private jumpLatch = false;
  private interactLatch = false;
  private pulseLatch = false;
  private dashLatch = false;

  onToggleMute?: () => void;
  onPauseKey?: () => void;

  constructor(canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);

    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.dragging = true;
        this.lastMouseX = e.clientX;
      }
    });
    window.addEventListener('mouseup', () => {
      this.dragging = false;
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - this.lastMouseX;
      this.lastMouseX = e.clientX;
      this.camYawDeg = (((this.camYawDeg - dx * this.mouseSensitivity) % 360) + 360) % 360;
    });
  }

  private isTypingInForm(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
  }

  private isBound(code: string): boolean {
    return Object.values(this.keybindings).includes(code);
  }

  private matchesDash(code: string): boolean {
    if (code === this.keybindings.dash) return true;
    return this.keybindings.dash === 'ShiftLeft' && code === 'ShiftRight' && !this.isBound('ShiftRight');
  }

  private matchesPause(code: string): boolean {
    if (code === this.keybindings.pause) return true;
    return this.keybindings.pause === 'Escape' && code === 'KeyP' && !this.isBound('KeyP');
  }

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (this.captureSuspended || this.isTypingInForm(e.target)) return;

    const code = e.code;
    if (
      code === 'Space' ||
      code === 'ArrowUp' ||
      code === 'ArrowDown' ||
      code === 'ArrowLeft' ||
      code === 'ArrowRight'
    ) {
      e.preventDefault();
    }
    if (!this.keys.has(code)) {
      if (code === this.keybindings.jump) this.jumpLatch = true;
      if (code === this.keybindings.interact) this.interactLatch = true;
      if (code === this.keybindings.pulse) this.pulseLatch = true;
      if (this.matchesDash(code)) this.dashLatch = true;
      if (this.matchesPause(code)) this.onPauseKey?.();
      if (code === 'KeyM' && !Object.values(this.keybindings).includes('KeyM')) {
        this.onToggleMute?.();
      }
    }
    this.keys.add(code);
  };

  private handleKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private handleBlur = (): void => {
    this.keys.clear();
    this.dragging = false;
  };

  setKeybindings(next: Keybindings): void {
    this.keybindings = { ...next };
    this.keys.clear();
  }

  getCameraYawDeg(): number {
    return this.camYawDeg;
  }

  reset(): void {
    this.keys.clear();
    this.dragging = false;
    this.camYawDeg = 0;
    this.jumpLatch = false;
    this.interactLatch = false;
    this.pulseLatch = false;
    this.dashLatch = false;
  }

  sampleForTick(dt: number, pausePulse = false): InputState {
    const yawSpeed = 110;
    if (
      (this.keys.has('ArrowLeft') && !Object.values(this.keybindings).includes('ArrowLeft')) ||
      (this.keys.has('KeyJ') && !Object.values(this.keybindings).includes('KeyJ'))
    ) {
      this.camYawDeg = (this.camYawDeg + yawSpeed * dt) % 360;
    }
    if (
      (this.keys.has('ArrowRight') && !Object.values(this.keybindings).includes('ArrowRight')) ||
      (this.keys.has('KeyL') && !Object.values(this.keybindings).includes('KeyL'))
    ) {
      this.camYawDeg = (this.camYawDeg - yawSpeed * dt + 360) % 360;
    }

    let mx = 0;
    let mz = 0;
    if (this.keys.has(this.keybindings.moveForward)) mz += 1;
    if (this.keys.has(this.keybindings.moveBackward)) mz -= 1;
    if (this.keys.has(this.keybindings.moveLeft)) mx += 1;
    if (this.keys.has(this.keybindings.moveRight)) mx -= 1;

    const jump = this.jumpLatch || this.keys.has(this.keybindings.jump);
    const interact = this.interactLatch || this.keys.has(this.keybindings.interact);
    const pulse = this.pulseLatch || this.keys.has(this.keybindings.pulse);
    const dash =
      this.dashLatch ||
      this.keys.has(this.keybindings.dash) ||
      (this.keybindings.dash === 'ShiftLeft' && this.keys.has('ShiftRight'));

    this.jumpLatch = false;
    this.interactLatch = false;
    this.pulseLatch = false;
    this.dashLatch = false;

    return {
      move: [mx, mz],
      cam_yaw_deg: this.camYawDeg,
      jump,
      interact,
      pulse,
      dash,
      pause: pausePulse,
    };
  }
}
