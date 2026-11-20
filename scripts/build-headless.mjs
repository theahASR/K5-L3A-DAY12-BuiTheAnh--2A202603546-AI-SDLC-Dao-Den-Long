import { build } from 'esbuild';

await Promise.all([
  build({
    entryPoints: ['src/headless/cli.ts'],
    outfile: 'dist-headless/cli.js',
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'esm',
    sourcemap: false,
    logLevel: 'info',
  }),
  build({
    entryPoints: ['src/headless/soak.ts'],
    outfile: 'dist-headless/soak.js',
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'esm',
    sourcemap: false,
    logLevel: 'info',
  }),
  build({
    entryPoints: ['src/headless/bench.ts'],
    outfile: 'dist-headless/bench.js',
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'esm',
    sourcemap: false,
    logLevel: 'info',
  }),
]);
