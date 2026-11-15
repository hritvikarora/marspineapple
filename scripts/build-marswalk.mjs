#!/usr/bin/env node
/**
 * Builds the Marswalk WebXR walk (marswalk/app) into dist/marswalk-vr/ for the team site.
 * The walk reads its site data from the planner's dist/sites/ (VITE_SITES_ROOT=../sites/), so its own copy is dropped.
 */
import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';

const run = (cmd, env = {}) => execSync(cmd, { stdio: 'inherit', env: { ...process.env, ...env } });
run('npm --prefix marswalk/app ci --no-audit --no-fund');
run('npm --prefix marswalk/app run build -- --outDir ../../dist/marswalk-vr --emptyOutDir', { VITE_SITES_ROOT: '../sites/' });
rmSync('dist/marswalk-vr/sites', { recursive: true, force: true });
