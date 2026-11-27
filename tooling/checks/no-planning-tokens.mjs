// no-planning-tokens: no published file carries internal planning text
// (tracking IDs, work-package labels, other vendors' names, design-document
// paths; planning-tokens.mjs). Source comments ship in dist, so this scans
// every dist file (JS, .d.ts, CSS, source maps, JSON data) plus README.md and
// package.json of each workspace package. Requires `npm run build`. Runs
// directly or via pack:check.
import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { listFiles, reporter, requireBuild, root, workspacePackages } from './lib.mjs';
import { planningTokenHits } from './planning-tokens.mjs';

const SHIPPED = /\.(?:js|mjs|cjs|d\.ts|d\.mts|css|map|json|md|txt)$/;

/** Files of one package that ship in its tarball and are text. */
function shippedFiles(dir) {
  const files = listFiles(join(dir, 'dist'))
    .filter((rel) => SHIPPED.test(rel))
    .map((rel) => join(dir, 'dist', rel));
  for (const top of ['README.md', 'package.json']) if (existsSync(join(dir, top))) files.push(join(dir, top));
  return files;
}

/** Every planning-token hit of the published files: `{ file, hits }` per file with hits. */
export function findPlanningTokens(packages = workspacePackages()) {
  const out = [];
  for (const p of packages) {
    for (const file of shippedFiles(p.dir)) {
      const hits = planningTokenHits(readFileSync(file, 'utf8'), { limit: 8 });
      if (hits.length) out.push({ file: relative(root, file), hits });
    }
  }
  return out;
}

/** Adds one failure per published file that carries planning tokens. */
export function checkNoPlanningTokens(r) {
  for (const { file, hits } of findPlanningTokens()) {
    r.fail(`${file}: planning text must not ship (${hits.map((h) => (h.kind === 'more' ? h.match : `${h.kind} "${h.match}"@${h.line}`)).join(', ')})`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const r = reporter('no-planning-tokens');
  requireBuild('no-planning-tokens');
  checkNoPlanningTokens(r);
  r.done();
}
