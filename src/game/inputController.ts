import type { InputState } from '../core/types';

/**
 * Translates keyboard + mouse drag into Test Contract InputState.
 * Uses exact camera yaw degrees so 3D play matches headless movement math.
 */
export class InputController {
  private readonly keys = new Set<string>();
  private camYawDeg = 0;
  private dragging = false;
  private lastMouseX = 0;

  // Latched single-press flags so fast key taps are never missed between 60Hz ticks
  private jumpLatch = false;
  private interactLatch = false;
  private pulseLatch = false;

  onToggleMute?: () => void;

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
      this.camYawDeg = (((this.camYawDeg - dx * 0.35) % 360) + 360) % 360;
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
      if (code === 'KeyQ' || code === 'ShiftLeft' || code === 'ShiftRight') {
        this.pulseLatch = true;
      }
      if (code === 'KeyM') {
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
  }

  sampleForTick(dt: number): InputState {
    // Camera yaw rotation via Left/Right arrows or J/L
    const yawSpeed = 110; // deg/s
    if (this.keys.has('ArrowLeft') || this.keys.has('KeyJ')) {
      this.camYawDeg = (this.camYawDeg + yawSpeed * dt) % 360;
    }
    if (this.keys.has('ArrowRight') || this.keys.has('KeyL')) {
      this.camYawDeg = (this.camYawDeg - yawSpeed * dt + 360) % 360;
    }

    // Screen-relative movement:
    // Camera sits behind player at -Z (for yaw=0 looking toward +Z).
    // Forward (W) = +Z, Right (D) = -X when camera looks along +Z from behind:
    // Wait: let's match standard camera-behind (+Z forward, -X right -> or camera at +Z looking toward -Z!).
    // With camera at (player.x - sin(yaw)*dist, y, player.z - cos(yaw)*dist) looking at player (+Z when yaw=0):
    // Forward is +Z (z = +1), Right on screen is -X (x = -1).
    let mx = 0;
    let mz = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) mz += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) mz -= 1;
    if (this.keys.has('KeyA')) mx += 1;
    if (this.keys.has('KeyD')) mx -= 1;

    const jump = this.jumpLatch || this.keys.has('Space');
    const interact = this.interactLatch || this.keys.has('KeyE') || this.keys.has('KeyF');
    const pulse =
      this.pulseLatch ||
      this.keys.has('KeyQ') ||
      this.keys.has('ShiftLeft') ||
      this.keys.has('ShiftRight');

    this.jumpLatch = false;
    this.interactLatch = false;
    this.pulseLatch = false;

    return {
      move: [mx, mz],
      cam_yaw_deg: this.camYawDeg,
      jump,
      interact,
      pulse,
      dash: false,
    };
  }
}
