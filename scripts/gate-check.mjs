#!/usr/bin/env node
/**
 * Harness Stop-hook gate check.
 * Blocks completion (exits non-zero) if package.json exists with tests and tests fail.
 */
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

if (!existsSync('node_modules')) {
  console.log('[gate-check] node_modules not installed yet; skipping.');
  process.exit(0);
}

if (!existsSync('tests')) {
  console.log('[gate-check] tests/ not created yet; skipping.');
  process.exit(0);
}

try {
  execSync('npm test', { stdio: 'inherit' });
  console.log('[gate-check] All tests green.');
} catch {
  console.error('[gate-check] BLOCKED: Tests are failing. Fix failures before finishing.');
  process.exit(1);
}
