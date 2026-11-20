export interface GameSettings {
  volume: number; // 0.0 .. 1.0
  mouseSensitivity: number; // 0.1 .. 1.0
}

const STORAGE_KEY = 'dao-den-long-settings-v1';

export const DEFAULT_SETTINGS: GameSettings = {
  volume: 0.7,
  mouseSensitivity: 0.35,
};

function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}

export function loadSettings(): GameSettings {
  try {
    if (typeof localStorage === 'undefined') return { ...DEFAULT_SETTINGS };
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<GameSettings>;
    return {
      volume:
        typeof parsed.volume === 'number' && Number.isFinite(parsed.volume)
          ? clamp(parsed.volume, 0, 1)
          : DEFAULT_SETTINGS.volume,
      mouseSensitivity:
        typeof parsed.mouseSensitivity === 'number' && Number.isFinite(parsed.mouseSensitivity)
          ? clamp(parsed.mouseSensitivity, 0.1, 1.0)
          : DEFAULT_SETTINGS.mouseSensitivity,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
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
