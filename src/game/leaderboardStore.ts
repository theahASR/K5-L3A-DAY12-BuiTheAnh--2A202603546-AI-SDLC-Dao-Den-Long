import {
  addLeaderboardEntry,
  sortAndTrimLeaderboard,
  type LeaderboardEntry,
} from '../core/leaderboard';

const LOCAL_STORAGE_KEY = 'dao-den-long-leaderboard-v1';

function readLocalCache(): LeaderboardEntry[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { entries?: LeaderboardEntry[] };
    return Array.isArray(parsed.entries) ? sortAndTrimLeaderboard(parsed.entries) : [];
  } catch {
    return [];
  }
}

function writeLocalCache(entries: LeaderboardEntry[]): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({ entries }));
  } catch {
    // Ignore private-mode storage errors
  }
}

/**
 * Loads leaderboard from local disk server (/api/leaderboard) when available,
 * falling back to localStorage seamlessly.
 */
export async function fetchLeaderboard(): Promise<LeaderboardEntry[]> {
  try {
    const res = await fetch('/api/leaderboard', { cache: 'no-store' });
    if (res.ok) {
      const data = (await res.json()) as { entries?: LeaderboardEntry[] };
      if (Array.isArray(data.entries)) {
        const sorted = sortAndTrimLeaderboard(data.entries);
        writeLocalCache(sorted);
        return sorted;
      }
    }
  } catch {
    // Running without local Node launcher (e.g., plain vite dev)
  }
  return readLocalCache();
}

/**
 * Submits a validated leaderboard entry to both disk server (/api/leaderboard) and localStorage.
 */
export async function submitLeaderboardScore(input: {
  name: string;
  score: number;
  nights_won: number;
  seed: number;
}): Promise<LeaderboardEntry[]> {
  const localCurrent = readLocalCache();
  const { entries: localUpdated, entry } = addLeaderboardEntry(localCurrent, input);
  writeLocalCache(localUpdated);

  try {
    const res = await fetch('/api/leaderboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
    if (res.ok) {
      const data = (await res.json()) as { entries?: LeaderboardEntry[] };
      if (Array.isArray(data.entries)) {
        const sorted = sortAndTrimLeaderboard(data.entries);
        writeLocalCache(sorted);
        return sorted;
      }
    }
  } catch {
    // Fallback already persisted in localStorage
  }
  return localUpdated;
}
