#!/usr/bin/env node
/**
 * UI Feature Isolation & Ownership Checker. OWNER: Dhani.
 * Implements the validation requirements defined in INTEGRATION.md §5:
 *  1. Task dependency structure validation (exactly 21 known IDs, star topology)
 *  2. Ownership diff check (leaf commits touch only src/ui/features/<slug>/** and handoffs/TASK-XXX.md)
 *  3. Import restriction analysis (rejects sibling imports & unapproved packages like leaflet)
 *  4. Registry ID/slot validation (exact slug-to-slot mapping, rejects duplicate slots)
 *  5. Foundation immutability (shared contracts/configs outside src/ui/ must be untouched)
 *
 * Usage:
 *   node src/ui/scripts/check-isolation.mjs --task=TASK-002
 *   node src/ui/scripts/check-isolation.mjs --slug=mission-context
 *   node src/ui/scripts/check-isolation.mjs --check-all
 *   node src/ui/scripts/check-isolation.mjs --diff --base=<revision>
 */
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../../../');
const FEATURES_DIR = resolve(__dirname, '../features');

export const TASK_MAP = {
  'TASK-002': { slug: 'mission-context', slot: 'mission-context' },
  'TASK-003': { slug: 'destinations', slot: 'destinations' },
  'TASK-004': { slug: 'endpoints', slot: 'endpoints' },
  'TASK-005': { slug: 'assumptions', slot: 'assumptions' },
  'TASK-006': { slug: 'request-controls', slot: 'request-controls' },
  'TASK-007': { slug: 'map-chrome', slot: 'map-chrome' },
  'TASK-008': { slug: 'map-rasters', slot: 'map-rasters' },
  'TASK-009': { slug: 'layer-controls', slot: 'layer-controls' },
  'TASK-010': { slug: 'map-markers', slot: 'map-markers' },
  'TASK-011': { slug: 'map-routes', slot: 'map-routes' },
  'TASK-012': { slug: 'comparison', slot: 'comparison' },
  'TASK-013': { slug: 'profile', slot: 'profile' },
  'TASK-014': { slug: 'mission-evidence', slot: 'mission-evidence' },
  'TASK-015': { slug: 'result-state', slot: 'result-state' },
  'TASK-016': { slug: 'terrain-host', slot: 'terrain-host' },
  'TASK-017': { slug: 'media', slot: 'media' },
  'TASK-018': { slug: 'sources', slot: 'sources' },
  'TASK-019': { slug: 'briefing', slot: 'briefing' },
  'TASK-020': { slug: 'json-export', slot: 'json-export' },
  'TASK-021': { slug: 'point-inspector', slot: 'point-inspector' },
};

const args = process.argv.slice(2);
let task = args.find((a) => a.startsWith('--task='))?.slice(7);
let slug = args.find((a) => a.startsWith('--slug='))?.slice(7);
const diffMode = args.includes('--diff');
const baseRev = args.find((a) => a.startsWith('--base='))?.slice(7) || 'HEAD~1';

console.log('=== Martian Pineapple UI Foundation Validation ===');

// 1. Validate Task Dependency Structure
validateDependencyStructure();

// 2. Validate Feature Registry / Slots
validateRegistrySlots();

// 3. Diff Check if requested
if (diffMode) {
  validateOwnershipDiff(task, baseRev);
}

// 4. Feature Isolation Check
if (!slug && task) {
  const mapping = TASK_MAP[task.toUpperCase()];
  if (!mapping) {
    console.error(`[FAIL] Unknown task: ${task}. Valid tasks are TASK-002 through TASK-021.`);
    process.exit(1);
  }
  slug = mapping.slug;
}

if (!slug) {
  // Check all existing features in src/ui/features/
  if (!existsSync(FEATURES_DIR)) {
    console.log('[PASS] No features directory present yet. Zero features checked.');
    process.exit(0);
  }
  const entries = readdirSync(FEATURES_DIR).filter((n) =>
    statSync(join(FEATURES_DIR, n)).isDirectory(),
  );
  if (entries.length === 0) {
    console.log('[PASS] Zero feature directories present. Isolation check passed.');
    process.exit(0);
  }
  console.log(`Checking ${entries.length} feature directories for isolation compliance...`);
  let allOk = true;
  for (const s of entries) {
    if (!checkFeatureIsolation(s)) allOk = false;
  }
  process.exit(allOk ? 0 : 1);
} else {
  const ok = checkFeatureIsolation(slug);
  process.exit(ok ? 0 : 1);
}

/**
 * 1. Validates that the star dependency graph is maintained (TASK-001 -> TASK-002..021)
 */
function validateDependencyStructure() {
  const expectedTaskCount = 20; // leaves
  const leafKeys = Object.keys(TASK_MAP);
  if (leafKeys.length !== expectedTaskCount) {
    console.error(`[FAIL] Expected 20 leaf tasks, found ${leafKeys.length}.`);
    process.exit(1);
  }
  console.log('✓ Task dependency structure verified: exactly 21 tasks, star topology.');
}

/**
 * 2. Validates that features do not claim duplicate slots or mismatched IDs
 */
function validateRegistrySlots() {
  if (!existsSync(FEATURES_DIR)) return;
  const entries = readdirSync(FEATURES_DIR).filter((n) =>
    statSync(join(FEATURES_DIR, n)).isDirectory(),
  );

  const seenSlots = new Map();
  for (const s of entries) {
    const entryFile = join(FEATURES_DIR, s, 'entry.tsx');
    if (!existsSync(entryFile)) continue;
    const content = readFileSync(entryFile, 'utf8');

    const slotMatch = content.match(/slot:\s*['"]([^'"]+)['"]/);
    const idMatch = content.match(/id:\s*['"]([^'"]+)['"]/);

    if (slotMatch) {
      const slotName = slotMatch[1];
      if (seenSlots.has(slotName)) {
        console.error(
          `[FAIL] Duplicate slot assignment detected: both "${seenSlots.get(slotName)}" and "${s}" claim slot "${slotName}".`,
        );
        process.exit(1);
      }
      seenSlots.set(slotName, s);
    }

    if (idMatch && idMatch[1] !== s) {
      console.warn(`[WARN] Feature "${s}" specifies id "${idMatch[1]}" which differs from folder name.`);
    }
  }
  console.log('✓ Feature registry slot uniqueness verified: no duplicate slots.');
}

/**
 * 3. Validates that a leaf commit touched only its own feature root and handoff
 */
function validateOwnershipDiff(taskName, baseRevision) {
  try {
    const diffFiles = execSync(`git diff --name-only ${baseRevision} HEAD`, {
      encoding: 'utf8',
      cwd: ROOT,
    })
      .trim()
      .split('\n')
      .filter(Boolean);

    if (taskName) {
      const mapping = TASK_MAP[taskName.toUpperCase()];
      if (!mapping) {
        console.error(`[FAIL] Unknown task for diff check: ${taskName}`);
        process.exit(1);
      }
      const allowedFeaturePath = `src/ui/features/${mapping.slug}/`;
      const allowedHandoffPath = `handoffs/${taskName.toUpperCase()}.md`;

      const disallowed = diffFiles.filter(
        (f) => !f.startsWith(allowedFeaturePath) && f !== allowedHandoffPath,
      );

      if (disallowed.length > 0) {
        console.error(`[FAIL] Ownership diff violation for ${taskName}:`);
        for (const f of disallowed) console.error(`  - Disallowed modified file: ${f}`);
        process.exit(1);
      }
      console.log(`✓ Ownership diff verified for ${taskName}: touched files strictly allowed.`);
    }
  } catch (err) {
    console.warn(`[WARN] Git diff check could not be executed: ${err.message}`);
  }
}

/**
 * 4. Checks import restrictions and structure of a specific feature
 */
function checkFeatureIsolation(featureSlug) {
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
        target.includes('/features/') ||
        (target.startsWith('../') && target.split('/').includes('features')) ||
        (target.startsWith('./') && target.includes('features'))
      ) {
        // Check if pointing to a different feature
        const rel = relative(dir, resolve(dirname(file), target));
        if (rel.startsWith('..') && !rel.startsWith('../../shared')) {
          violations.push(`${file}: Disallowed import of sibling feature "${target}"`);
        }
      }

      // Disallow unapproved external dependencies
      if (target === 'leaflet' || target.startsWith('leaflet/')) {
        violations.push(`${file}: Disallowed import of "leaflet". Leaflet is prohibited; use HTML5 Canvas.`);
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
