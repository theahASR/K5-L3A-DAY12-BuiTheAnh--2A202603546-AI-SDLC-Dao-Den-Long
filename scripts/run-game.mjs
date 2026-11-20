#!/usr/bin/env node
/**
 * Đảo Đèn Lồng launcher (`run_cmd`):
 * 1) `node scripts/run-game.mjs --export-leaderboard out.json` -> exports local disk leaderboard & exits 0.
 * 2) `node scripts/run-game.mjs [--port 4173]` -> serves dist/ with local disk-backed /api/leaderboard.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import { dirname, extname, join, resolve, sep } from 'node:path';

const LEADERBOARD_PATH =
  process.env.DAO_DEN_LONG_LEADERBOARD ||
  join(homedir(), '.dao-den-long', 'leaderboard.json');

const NAME_REGEX = /^[\p{L}\p{N}_]{3,12}$/u;

function formatIsoWithTimezone(date = new Date()) {
  const pad = (n) => String(Math.floor(Math.abs(n))).padStart(2, '0');
  const offsetMin = -date.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${sign}${pad(offsetMin / 60)}:${pad(offsetMin % 60)}`
  );
}

function sortAndTrim(entries) {
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
      if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return ta - tb;
      return a.achieved_at < b.achieved_at ? -1 : a.achieved_at > b.achieved_at ? 1 : 0;
    })
    .slice(0, 10);
}

function loadDiskLeaderboard() {
  try {
    if (!existsSync(LEADERBOARD_PATH)) return [];
    const parsed = JSON.parse(readFileSync(LEADERBOARD_PATH, 'utf-8'));
    if (parsed && Array.isArray(parsed.entries)) {
      return sortAndTrim(parsed.entries);
    }
    return [];
  } catch {
    return [];
  }
}

function saveDiskLeaderboard(entries) {
  const sorted = sortAndTrim(entries);
  mkdirSync(dirname(LEADERBOARD_PATH), { recursive: true });
  writeFileSync(LEADERBOARD_PATH, JSON.stringify({ entries: sorted }, null, 2) + '\n', 'utf-8');
  return sorted;
}

// Parse CLI flags
const argv = process.argv.slice(2);
let exportPath = null;
let port = 4173;

for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--export-leaderboard') {
    exportPath = argv[++i];
    if (!exportPath) {
      console.error('Missing output path for --export-leaderboard');
      process.exit(1);
    }
  } else if (argv[i] === '--port') {
    port = Number.parseInt(argv[++i], 10) || 4173;
  }
}

if (exportPath) {
  const entries = loadDiskLeaderboard();
  const outDir = dirname(exportPath);
  if (outDir && outDir !== '.') {
    mkdirSync(outDir, { recursive: true });
  }
  writeFileSync(exportPath, JSON.stringify({ entries }, null, 2) + '\n', 'utf-8');
  console.log(`[leaderboard] Exported ${entries.length} entries to ${exportPath}`);
  process.exit(0);
}

// Serve built production bundle dist/ + disk-backed /api/leaderboard
const distDir = resolve(process.cwd(), 'dist');
if (!existsSync(join(distDir, 'index.html'))) {
  console.error('dist/index.html not found. Please run "npm run build" first.');
  process.exit(1);
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = createServer((req, res) => {
  const urlPath = (req.url || '/').split('?')[0];

  if (urlPath === '/api/leaderboard' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ entries: loadDiskLeaderboard() }));
    return;
  }

  if (urlPath === '/api/leaderboard' && req.method === 'POST') {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
        const name = String(body.name ?? '').trim().normalize('NFC');
        if (!NAME_REGEX.test(name)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Tên phải dài 3-12 ký tự (chữ cái, số, _).' }));
          return;
        }
        const entry = {
          name,
          score: Math.max(0, Math.round(Number(body.score) || 0)),
          nights_won: Math.min(3, Math.max(0, Math.round(Number(body.nights_won) || 0))),
          achieved_at:
            typeof body.achieved_at === 'string' && body.achieved_at.length > 0
              ? body.achieved_at
              : formatIsoWithTimezone(),
          seed: Math.trunc(Number(body.seed) || 0),
        };
        const entries = saveDiskLeaderboard([...loadDiskLeaderboard(), entry]);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ entries, entry }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: String(err) }));
      }
    });
    return;
  }

  const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const filePath = resolve(distDir, rel);
  if ((filePath !== distDir && !filePath.startsWith(distDir + sep)) || !existsSync(filePath)) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const ext = extname(filePath);
  res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
  res.end(readFileSync(filePath));
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Đảo Đèn Lồng v1.0.0 running at http://localhost:${port}/`);
  console.log(`Local leaderboard file: ${LEADERBOARD_PATH}`);
});
