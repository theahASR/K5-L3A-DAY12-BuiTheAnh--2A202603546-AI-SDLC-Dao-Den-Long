import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { arch, platform, release, tmpdir } from 'node:os';
import { dirname, extname, join, resolve, sep } from 'node:path';

interface BenchArgs {
  seed: number;
  duration: number;
  outPath: string;
}

function parseIntStrict(raw: string | undefined, flag: string): number {
  if (raw === undefined || !/^-?\d+$/.test(raw)) {
    throw new Error(`Invalid integer value for ${flag}: ${raw ?? '(missing)'}`);
  }
  return Number.parseInt(raw, 10);
}

function parseArgs(argv: string[]): BenchArgs {
  let seed = 42;
  let duration = 30;
  let outPath = 'bench.json';

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--seed':
        seed = parseIntStrict(argv[++i], '--seed');
        break;
      case '--duration':
        duration = parseIntStrict(argv[++i], '--duration');
        break;
      case '--out':
        outPath = argv[++i];
        if (!outPath) throw new Error('Missing value for --out');
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (duration <= 0) throw new Error('--duration must be a positive integer');
  return { seed, duration, outPath };
}

function detectBrowserBinary(): string | null {
  if (process.env.BENCH_BROWSER && existsSync(process.env.BENCH_BROWSER)) {
    return process.env.BENCH_BROWSER;
  }

  const candidates: string[] =
    process.platform === 'win32'
      ? [
          'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
          'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
          'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
          'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
        ]
      : process.platform === 'darwin'
        ? [
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Chromium.app/Contents/MacOS/Chromium',
            '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
            '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
          ]
        : [
            '/usr/bin/google-chrome',
            '/usr/bin/google-chrome-stable',
            '/usr/bin/chromium',
            '/usr/bin/chromium-browser',
            '/snap/bin/chromium',
          ];

  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolveBody, rejectBody) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolveBody(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', rejectBody);
  });
}

async function main(): Promise<number> {
  const processStartMs = performance.now();
  const args = parseArgs(process.argv.slice(2));

  const distDir = resolve(process.cwd(), 'dist');
  if (!existsSync(join(distDir, 'index.html'))) {
    throw new Error('dist/index.html not found. Run "npm run build" before running bench.');
  }

  const browserBin = detectBrowserBinary();
  if (!browserBin) {
    throw new Error(
      'No Chromium/Chrome/Edge browser found. Install Chrome/Chromium or set BENCH_BROWSER=/path/to/browser.'
    );
  }

  let firstFrameMs: number | null = null;
  let browserProc: ChildProcess | null = null;
  const userDataDir = mkdtempSync(join(tmpdir(), 'dao-den-long-bench-'));

  let resolveReport!: (payload: Record<string, unknown>) => void;
  let rejectReport!: (err: Error) => void;
  const reportPromise = new Promise<Record<string, unknown>>((res, rej) => {
    resolveReport = res;
    rejectReport = rej;
  });

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const urlPath = (req.url ?? '/').split('?')[0];

    if (req.method === 'POST' && urlPath === '/__bench/first-frame') {
      if (firstFrameMs === null) {
        firstFrameMs = Math.round(performance.now() - processStartMs);
      }
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === 'POST' && urlPath === '/__bench/report') {
      try {
        const body = await readBody(req);
        const payload = JSON.parse(body) as Record<string, unknown>;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
        resolveReport(payload);
      } catch (err) {
        res.writeHead(400);
        res.end('bad payload');
        rejectReport(err as Error);
      }
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
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] ?? 'application/octet-stream' });
    res.end(readFileSync(filePath));
  });

  await new Promise<void>((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', () => resolveListen());
  });

  const addr = server.address();
  if (!addr || typeof addr === 'string') {
    throw new Error('Failed to bind local benchmark HTTP server');
  }

  const benchUrl = `http://127.0.0.1:${addr.port}/?bench=1&seed=${args.seed}&duration=${args.duration}`;
  const launchArgs = [
    `--app=${benchUrl}`,
    '--window-size=1280,720',
    '--window-position=80,60',
    '--disable-gpu-vsync',
    '--disable-frame-rate-limit',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--enable-precise-memory-info',
    '--autoplay-policy=no-user-gesture-required',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${userDataDir}`,
  ];

  console.log(`[bench] Launching 1280x720 WebGL benchmark (${args.duration}s + 3s warmup, seed=${args.seed})...`);
  browserProc = spawn(browserBin, launchArgs, { stdio: 'ignore' });

  const timeoutMs = (args.duration + 45) * 1000;
  let reportReceived = false;
  const timeoutId = setTimeout(() => {
    rejectReport(new Error(`Benchmark timed out after ${timeoutMs / 1000}s waiting for browser report`));
  }, timeoutMs);

  browserProc.once('exit', (code) => {
    if (!reportReceived) {
      rejectReport(new Error(`Browser exited before sending benchmark report (code=${code})`));
    }
  });

  try {
    const raw = await reportPromise;
    reportReceived = true;
    clearTimeout(timeoutId);

    const out = {
      contract_version: '1.3',
      avg_fps: raw.avg_fps,
      p1_low_fps: raw.p1_low_fps,
      frame_ms_p95: raw.frame_ms_p95,
      frames: raw.frames,
      load_ms: firstFrameMs ?? (typeof raw.load_ms === 'number' ? raw.load_ms : Math.round(performance.now() - processStartMs)),
      peak_mem_mb: typeof raw.peak_mem_mb === 'number' ? raw.peak_mem_mb : null,
      vsync_off: true,
      renderer: String(raw.renderer ?? 'Three.js 0.170.0 (WebGL2)'),
      os: `${platform()} ${release()} (${arch()})`,
    };

    const outDir = dirname(args.outPath);
    if (outDir && outDir !== '.') {
      mkdirSync(outDir, { recursive: true });
    }
    writeFileSync(args.outPath, JSON.stringify(out, null, 2) + '\n', 'utf-8');
    console.log(
      `[bench] PASS -> ${args.outPath} | avg_fps=${out.avg_fps} | p1_low_fps=${out.p1_low_fps} | p95=${out.frame_ms_p95}ms | frames=${out.frames} | load_ms=${out.load_ms}`
    );
    return 0;
  } finally {
    clearTimeout(timeoutId);
    if (browserProc && !browserProc.killed) {
      browserProc.kill('SIGTERM');
    }
    server.close();
    try {
      rmSync(userDataDir, { recursive: true, force: true });
    } catch {
      // Ignore Windows temp file lock on browser teardown
    }
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(`[bench-error] ${(err as Error).message}`);
    process.exit(1);
  });
