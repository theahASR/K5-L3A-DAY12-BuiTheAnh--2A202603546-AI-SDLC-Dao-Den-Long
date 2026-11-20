export type BindableAction =
  | 'moveForward'
  | 'moveBackward'
  | 'moveLeft'
  | 'moveRight'
  | 'jump'
  | 'dash'
  | 'interact'
  | 'pulse'
  | 'pause';

export type Keybindings = Record<BindableAction, string>;

export const ACTION_LABELS: Record<BindableAction, string> = {
  moveForward: 'Tiến',
  moveBackward: 'Lùi',
  moveLeft: 'Sang trái',
  moveRight: 'Sang phải',
  jump: 'Nhảy',
  dash: 'Lướt',
  interact: 'Tương tác đèn',
  pulse: 'Tỏa Sáng',
  pause: 'Tạm dừng',
};

export const BINDABLE_ACTIONS: BindableAction[] = [
  'moveForward',
  'moveBackward',
  'moveLeft',
  'moveRight',
  'jump',
  'dash',
  'interact',
  'pulse',
  'pause',
];

export const DEFAULT_KEYBINDINGS: Keybindings = {
  moveForward: 'KeyW',
  moveBackward: 'KeyS',
  moveLeft: 'KeyA',
  moveRight: 'KeyD',
  jump: 'Space',
  dash: 'ShiftLeft',
  interact: 'KeyE',
  pulse: 'KeyQ',
  pause: 'Escape',
};

export interface GameSettings {
  volume: number; // 0.0 .. 1.0
  mouseSensitivity: number; // 0.1 .. 1.0
  colorblindMode: boolean; // "Bảng màu dễ phân biệt" (Ticket-03)
  reduceMotion: boolean; // "Giảm chuyển động" (Ticket-04)
  largeText: boolean; // "Chữ lớn (×1.25)" (Ticket-04)
  keybindings: Keybindings; // 9 rebindable actions (Ticket-04)
}

const STORAGE_KEY = 'dao-den-long-settings-v2';

export const DEFAULT_SETTINGS: GameSettings = {
  volume: 0.7,
  mouseSensitivity: 0.35,
  colorblindMode: false,
  reduceMotion: false,
  largeText: false,
  keybindings: { ...DEFAULT_KEYBINDINGS },
};

function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}

export function formatKeyCode(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code === 'ShiftLeft' || code === 'ShiftRight') return 'Shift';
  if (code === 'ControlLeft' || code === 'ControlRight') return 'Ctrl';
  if (code === 'AltLeft' || code === 'AltRight') return 'Alt';
  if (code === 'Space') return 'Space';
  if (code === 'Escape') return 'Esc';
  if (code === 'ArrowUp') return '↑';
  if (code === 'ArrowDown') return '↓';
  if (code === 'ArrowLeft') return '←';
  if (code === 'ArrowRight') return '→';
  return code;
}

/**
 * Detects whether `code` is already assigned to another action in `bindings`.
 * Returns the conflicting action key, or null if no conflict.
 */
export function findKeyConflict(
  bindings: Keybindings,
  targetAction: BindableAction,
  code: string
): BindableAction | null {
  for (const action of BINDABLE_ACTIONS) {
    if (action !== targetAction && bindings[action] === code) {
      return action;
    }
  }
  return null;
}

export function loadSettings(): GameSettings {
  try {
    if (typeof localStorage === 'undefined') {
      return { ...DEFAULT_SETTINGS, keybindings: { ...DEFAULT_KEYBINDINGS } };
    }
    const raw =
      localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem('dao-den-long-settings-v1');
    if (!raw) {
      return { ...DEFAULT_SETTINGS, keybindings: { ...DEFAULT_KEYBINDINGS } };
    }
    const parsed = JSON.parse(raw) as Partial<GameSettings>;
    const keybindings: Keybindings = { ...DEFAULT_KEYBINDINGS };
    if (parsed.keybindings && typeof parsed.keybindings === 'object') {
      for (const action of BINDABLE_ACTIONS) {
        const val = parsed.keybindings[action];
        if (typeof val === 'string' && val.length > 0) {
          keybindings[action] = val;
        }
      }
    }
    return {
      volume:
        typeof parsed.volume === 'number' && Number.isFinite(parsed.volume)
          ? clamp(parsed.volume, 0, 1)
          : DEFAULT_SETTINGS.volume,
      mouseSensitivity:
        typeof parsed.mouseSensitivity === 'number' && Number.isFinite(parsed.mouseSensitivity)
          ? clamp(parsed.mouseSensitivity, 0.1, 1.0)
          : DEFAULT_SETTINGS.mouseSensitivity,
      colorblindMode:
        typeof parsed.colorblindMode === 'boolean'
          ? parsed.colorblindMode
          : DEFAULT_SETTINGS.colorblindMode,
      reduceMotion:
        typeof parsed.reduceMotion === 'boolean'
          ? parsed.reduceMotion
          : DEFAULT_SETTINGS.reduceMotion,
      largeText:
        typeof parsed.largeText === 'boolean' ? parsed.largeText : DEFAULT_SETTINGS.largeText,
      keybindings,
    };
  } catch {
    return { ...DEFAULT_SETTINGS, keybindings: { ...DEFAULT_KEYBINDINGS } };
  }
}

export function saveSettings(settings: GameSettings): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage quota / private mode failures gracefully
  }
}
