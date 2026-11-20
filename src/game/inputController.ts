import type { InputState } from '../core/types';

/**
 * Translates keyboard + mouse drag into Contract v1.1 InputState.
 * Controls: WASD move, Space jump, Shift dash, E/F interact, Q pulse, Esc/P pause.
 */
export class InputController {
  private readonly keys = new Set<string>();
  private camYawDeg = 0;
  private dragging = false;
  private lastMouseX = 0;
  mouseSensitivity = 0.35;

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

  private handleKeyDown = (e: KeyboardEvent): void => {
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
      if (code === 'Space') this.jumpLatch = true;
      if (code === 'KeyE' || code === 'KeyF') this.interactLatch = true;
      if (code === 'KeyQ') this.pulseLatch = true;
      if (code === 'ShiftLeft' || code === 'ShiftRight') this.dashLatch = true;
      if (code === 'Escape' || code === 'KeyP') this.onPauseKey?.();
      if (code === 'KeyM') this.onToggleMute?.();
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
    if (this.keys.has('ArrowLeft') || this.keys.has('KeyJ')) {
      this.camYawDeg = (this.camYawDeg + yawSpeed * dt) % 360;
    }
    if (this.keys.has('ArrowRight') || this.keys.has('KeyL')) {
      this.camYawDeg = (this.camYawDeg - yawSpeed * dt + 360) % 360;
    }

    let mx = 0;
    let mz = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) mz += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) mz -= 1;
    if (this.keys.has('KeyA')) mx += 1;
    if (this.keys.has('KeyD')) mx -= 1;

    const jump = this.jumpLatch || this.keys.has('Space');
    const interact = this.interactLatch || this.keys.has('KeyE') || this.keys.has('KeyF');
    const pulse = this.pulseLatch || this.keys.has('KeyQ');
    const dash =
      this.dashLatch || this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');

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
