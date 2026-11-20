import { build } from 'esbuild';

await build({
  entryPoints: ['src/headless/cli.ts'],
  outfile: 'dist-headless/cli.js',
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'esm',
  sourcemap: false,
  logLevel: 'info',
});
