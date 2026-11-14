#!/usr/bin/env node
/**
 * Release audit of the BUILT app (run `npm run build` first):
 *   node scripts/audit.mjs [distDir] [--release]
 * - gzip sizes of JS / CSS / worker / each region bundle, checked against BUDGETS
 * - forbidden content in dist text files: console.log/debug/info/trace, `debugger`, dev overlays,
 *   secret/env patterns, local absolute paths, source maps, .env files
 * - release bundle check: warns if bundles/index.json `release` is SYNTHETIC (fails with --release)
 * Exit code 1 on any failure.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';

const KB = 1024, MB = 1024 * KB;
// Gzip budgets. Entry JS = what blocks first paint; 3D/three.js must stay in lazy chunks.
export const BUDGETS = {
  entryJsGz: 150 * KB,
  totalJsGz: 450 * KB, // leaves ~300 KB gz for lazy three.js + Role B code
  workerJsGz: 50 * KB,
  cssGz: 30 * KB,
  bundleDirGz: 15 * MB, // per region bundle (analytical rasters + display assets)
  totalDistRaw: 60 * MB,
};

const args = process.argv.slice(2);
const dist = args.find((a) => !a.startsWith('--')) ?? 'dist';
const releaseMode = args.includes('--release');
if (!existsSync(join(dist, 'index.html'))) {
  console.error(`No build found at ${dist}/index.html — run \`npm run build\` first.`);
  process.exit(1);
}

const walk = (d) => readdirSync(d).flatMap((n) => {
  const p = join(d, n);
  return statSync(p).isDirectory() ? walk(p) : [p];
});
const files = walk(dist).map((p) => {
  const buf = readFileSync(p);
  return { path: relative(dist, p).split('\\').join('/'), raw: buf.length, gz: gzipSync(buf, { level: 9 }).length, buf };
});
const fmt = (n) => (n >= MB ? `${(n / MB).toFixed(2)} MB` : `${(n / KB).toFixed(1)} KB`);
const failures = [];
const warnings = [];
const sum = (xs, k) => xs.reduce((s, f) => s + f[k], 0);

// ---- sizes ---------------------------------------------------------------
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const entryNames = [...html.matchAll(/src="\.?\/?(assets\/[^"]+\.js)"/g)].map((m) => m[1]);
const js = files.filter((f) => f.path.endsWith('.js'));
const worker = js.filter((f) => /worker/i.test(f.path));
const entry = js.filter((f) => entryNames.includes(f.path));
const css = files.filter((f) => f.path.endsWith('.css'));
const rows = [
  ['entry JS (initial)', sum(entry, 'raw'), sum(entry, 'gz'), BUDGETS.entryJsGz],
  ['all JS (incl. lazy + worker)', sum(js, 'raw'), sum(js, 'gz'), BUDGETS.totalJsGz],
  ['routing worker', sum(worker, 'raw'), sum(worker, 'gz'), BUDGETS.workerJsGz],
  ['CSS', sum(css, 'raw'), sum(css, 'gz'), BUDGETS.cssGz],
];
const bundleDirs = existsSync(join(dist, 'bundles'))
  ? readdirSync(join(dist, 'bundles')).filter((n) => statSync(join(dist, 'bundles', n)).isDirectory())
  : [];
for (const b of bundleDirs) {
  const fs = files.filter((f) => f.path.startsWith(`bundles/${b}/`));
  rows.push([`bundle ${b}`, sum(fs, 'raw'), sum(fs, 'gz'), BUDGETS.bundleDirGz]);
}
const totalRaw = sum(files, 'raw');
console.log('Asset budget (gzip level 9):');
for (const [name, raw, gz, budget] of rows) {
  const ok = gz <= budget;
  if (!ok) failures.push(`${name}: ${fmt(gz)} gz exceeds budget ${fmt(budget)}`);
  console.log(`  ${ok ? '✓' : '✗'} ${name.padEnd(30)} ${fmt(raw).padStart(10)} raw ${fmt(gz).padStart(10)} gz   budget ${fmt(budget)}`);
}
console.log(`  ${totalRaw <= BUDGETS.totalDistRaw ? '✓' : '✗'} ${'total dist'.padEnd(30)} ${fmt(totalRaw).padStart(10)} raw                 budget ${fmt(BUDGETS.totalDistRaw)}`);
if (totalRaw > BUDGETS.totalDistRaw) failures.push(`total dist ${fmt(totalRaw)} exceeds ${fmt(BUDGETS.totalDistRaw)}`);
if (!entry.length) failures.push('could not identify the entry JS from index.html');

// ---- content audit -------------------------------------------------------
const TEXT = /\.(js|mjs|css|html|json|txt|svg|md)$/i;
const RULES = [
  ['console.log/debug/info/trace call', /\bconsole\.(log|debug|info|trace)\s*\(/],
  ['debugger statement', /(^|[;{}\s])debugger\s*;?/],
  ['Vite dev client / overlay', /@vite\/client|vite-error-overlay|\$RefreshReg\$|__vite_ws/],
  ['local absolute path', /(\/home\/[a-z_][\w.-]*\/|\/workspace\/|\/Users\/[\w.-]+\/|[A-Za-z]:\\\\(Users|workspace)\\\\)/],
  ['AWS access key', /AKIA[0-9A-Z]{16}/],
  ['GitHub token', /\b(ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_]{20,}/],
  ['OpenAI/Anthropic-style key', /\bsk-(ant-)?[A-Za-z0-9_-]{20,}/],
  ['Google API key', /AIza[0-9A-Za-z_-]{35}/],
  ['Slack token', /xox[baprs]-[A-Za-z0-9-]{10,}/],
  ['private key block', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['secret-looking env var', /\bVITE_[A-Z0-9_]*(SECRET|TOKEN|PASSWORD|PRIVATE)[A-Z0-9_]*/],
  ['Bearer token literal', /Bearer\s+[A-Za-z0-9._-]{20,}/],
];
let scanned = 0;
for (const f of files) {
  if (/\.map$/.test(f.path)) failures.push(`source map shipped: ${f.path}`);
  if (/(^|\/)\.env/.test(f.path)) failures.push(`env file shipped: ${f.path}`);
  if (!TEXT.test(f.path)) continue;
  scanned++;
  const text = f.buf.toString('utf8');
  for (const [label, re] of RULES) {
    const m = text.match(re);
    if (m) {
      const i = m.index ?? 0;
      failures.push(`${label} in ${f.path}: …${text.slice(Math.max(0, i - 30), i + 50).replace(/\s+/g, ' ')}…`);
    }
  }
}
console.log(`Content audit: scanned ${scanned} text files for ${RULES.length} patterns.`);

// ---- release bundle ------------------------------------------------------
const idxPath = join(dist, 'bundles', 'index.json');
if (!existsSync(idxPath)) failures.push('dist/bundles/index.json missing (bundle selection would fail)');
else {
  const idx = JSON.parse(readFileSync(idxPath, 'utf8'));
  const mPath = join(dist, 'bundles', String(idx.release), 'manifest.json');
  if (!existsSync(mPath)) failures.push(`release bundle "${idx.release}" has no manifest in dist`);
  else {
    const m = JSON.parse(readFileSync(mPath, 'utf8'));
    const msg = `release bundle is "${idx.release}" (${m.bundleVersion}), synthetic=${m.synthetic}`;
    if (m.synthetic) (releaseMode ? failures : warnings).push(`${msg} — production would show the SYNTHETIC warning banner`);
    else console.log(`Release bundle: ${msg}`);
  }
}

for (const w of warnings) console.warn(`WARN ${w}`);
if (failures.length) {
  for (const f of failures) console.error(`FAIL ${f}`);
  console.error(`AUDIT FAIL (${failures.length})`);
  process.exit(1);
}
console.log(`AUDIT PASS${warnings.length ? ` with ${warnings.length} warning(s)` : ''}`);
