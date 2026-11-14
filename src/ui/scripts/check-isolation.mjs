#!/usr/bin/env node
/**
 * UI Feature Isolation Checker. OWNER: Dhani.
 * Verifies that a leaf feature module respects isolation boundaries:
 *  - Located strictly within src/ui/features/<slug>/
 *  - Contains entry.tsx with default export
 *  - Does NOT import sibling feature modules
 *  - Does NOT import unapproved external libraries (e.g. leaflet)
 *
 * Usage:
 *   node src/ui/scripts/check-isolation.mjs --task=TASK-002
 *   node src/ui/scripts/check-isolation.mjs --slug=mission-context
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../../../');
const FEATURES_DIR = resolve(__dirname, '../features');

const TASK_MAP = {
  'TASK-002': 'mission-context',
  'TASK-003': 'destinations',
  'TASK-004': 'endpoints',
  'TASK-005': 'assumptions',
  'TASK-006': 'request-controls',
  'TASK-007': 'map-chrome',
  'TASK-008': 'map-rasters',
  'TASK-009': 'layer-controls',
  'TASK-010': 'map-markers',
  'TASK-011': 'map-routes',
  'TASK-012': 'comparison',
  'TASK-013': 'profile',
  'TASK-014': 'mission-evidence',
  'TASK-015': 'result-state',
  'TASK-016': 'terrain-host',
  'TASK-017': 'media',
  'TASK-018': 'sources',
  'TASK-019': 'briefing',
  'TASK-020': 'json-export',
  'TASK-021': 'point-inspector',
};

const args = process.argv.slice(2);
let task = args.find((a) => a.startsWith('--task='))?.slice(7);
let slug = args.find((a) => a.startsWith('--slug='))?.slice(7);

if (!slug && task) {
  slug = TASK_MAP[task.toUpperCase()];
  if (!slug) {
    console.error(`Unknown task: ${task}. Valid tasks are TASK-002 through TASK-021.`);
    process.exit(1);
  }
}

if (!slug) {
  // If no args provided, validate all existing feature directories
  if (!existsSync(FEATURES_DIR)) {
    console.log('No features directory found yet. Isolation check passed (zero features).');
    process.exit(0);
  }
  const entries = readdirSync(FEATURES_DIR).filter((n) =>
    statSync(join(FEATURES_DIR, n)).isDirectory(),
  );
  if (entries.length === 0) {
    console.log('Zero feature directories present. Isolation check passed.');
    process.exit(0);
  }
  console.log(`Checking ${entries.length} feature directories for isolation compliance...`);
  let allOk = true;
  for (const s of entries) {
    if (!checkFeature(s)) allOk = false;
  }
  process.exit(allOk ? 0 : 1);
} else {
  const ok = checkFeature(slug);
  process.exit(ok ? 0 : 1);
}

function checkFeature(featureSlug) {
  const dir = join(FEATURES_DIR, featureSlug);
  if (!existsSync(dir)) {
    console.log(`Feature directory not found: ${dir}. (Task not yet started).`);
    return true;
  }

  const entryFile = join(dir, 'entry.tsx');
  if (!existsSync(entryFile)) {
    console.error(`[FAIL] ${featureSlug}: Missing entry file at ${entryFile}`);
    return false;
  }

  const entrySrc = readFileSync(entryFile, 'utf8');
  if (!entrySrc.includes('export default')) {
    console.error(`[FAIL] ${featureSlug}: entry.tsx must default export a FeatureModule.`);
    return false;
  }

  const violations = [];
  const files = walk(dir).filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'));

  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    const importLines = src.match(/from\s+['"][^'"]+['"]/g) || [];
    for (const imp of importLines) {
      const match = imp.match(/from\s+['"]([^'"]+)['"]/);
      if (!match) continue;
      const target = match[1];

      // Disallow sibling feature imports
      if (
        target.includes('../features/') ||
        (target.startsWith('../') && target.split('/').includes('features')) ||
        (target.startsWith('./') && target.includes('/features/'))
      ) {
        violations.push(`${file}: Disallowed import of sibling feature "${target}"`);
      }

      // Disallow unapproved libraries
      if (target === 'leaflet' || target.startsWith('leaflet/')) {
        violations.push(`${file}: Disallowed import of "leaflet". Use HTML5 Canvas map.`);
      }
    }
  }

  if (violations.length > 0) {
    console.error(`[FAIL] ${featureSlug} has isolation violations:`);
    for (const v of violations) console.error(`  - ${v}`);
    return false;
  }

  console.log(`[PASS] ${featureSlug} is strictly isolated.`);
  return true;
}

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
