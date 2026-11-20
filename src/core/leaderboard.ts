export interface LeaderboardEntry {
  name: string;
  score: number;
  nights_won: number;
  achieved_at: string;
  seed: number;
}

export interface LeaderboardFile {
  entries: LeaderboardEntry[];
}

export const LEADERBOARD_MAX_ENTRIES = 10;

// 3-12 characters: [A-Za-z0-9_] plus Unicode letters (supports Vietnamese with diacritics)
const NAME_REGEX = /^[\p{L}\p{N}_]{3,12}$/u;

export function validatePlayerName(raw: string): {
  valid: boolean;
  name: string;
  error?: string;
} {
  const name = raw.trim().normalize('NFC');
  if (name.length < 3 || name.length > 12) {
    return { valid: false, name, error: 'Tên phải dài từ 3 đến 12 ký tự.' };
  }
  if (!NAME_REGEX.test(name)) {
    return {
      valid: false,
      name,
      error: 'Tên chỉ được gồm chữ cái, chữ số hoặc dấu gạch dưới (_), không khoảng trắng.',
    };
  }
  return { valid: true, name };
}

/**
 * Formats a Date as ISO 8601 with explicit local timezone offset (e.g. 2026-11-20T23:45:00+07:00).
 */
export function formatIsoWithTimezone(date = new Date()): string {
  const pad = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, '0');
  const offsetMin = -date.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const tzHours = pad(offsetMin / 60);
  const tzMins = pad(offsetMin % 60);

  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${sign}${tzHours}:${tzMins}`
  );
}

/**
 * Sorts entries by score descending; ties broken by earlier achieved_at standing above.
 * Keeps top 10 entries.
 */
export function sortAndTrimLeaderboard(entries: LeaderboardEntry[]): LeaderboardEntry[] {
  return [...entries]
    .filter(
      (e) =>
        e &&
        typeof e.name === 'string' &&
        typeof e.score === 'number' &&
        Number.isFinite(e.score) &&
        typeof e.nights_won === 'number' &&
        typeof e.achieved_at === 'string' &&
        typeof e.seed === 'number'
    )
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const ta = Date.parse(a.achieved_at);
      const tb = Date.parse(b.achieved_at);
      if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) {
        return ta - tb;
      }
      return a.achieved_at < b.achieved_at ? -1 : a.achieved_at > b.achieved_at ? 1 : 0;
    })
    .slice(0, LEADERBOARD_MAX_ENTRIES);
}

export function addLeaderboardEntry(
  existing: LeaderboardEntry[],
  candidate: Omit<LeaderboardEntry, 'achieved_at'> & { achieved_at?: string }
): { entries: LeaderboardEntry[]; entry: LeaderboardEntry } {
  const check = validatePlayerName(candidate.name);
  if (!check.valid) {
    throw new Error(check.error ?? 'Tên không hợp lệ');
  }
  const entry: LeaderboardEntry = {
    name: check.name,
    score: Math.max(0, Math.round(candidate.score)),
    nights_won: Math.min(3, Math.max(0, Math.round(candidate.nights_won))),
    achieved_at: candidate.achieved_at ?? formatIsoWithTimezone(),
    seed: Math.trunc(candidate.seed),
  };
  return {
    entries: sortAndTrimLeaderboard([...existing, entry]),
    entry,
  };
}
