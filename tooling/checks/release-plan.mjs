// Release plan check (one version for every per-category package): the pending changesets must move
// every published package of the manifest, and only those, to exactly
// RELEASE_VERSION (the manifest `VERSION`).
// Reads `changeset status --output <file>` JSON; used by release-verify.mjs.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PACKAGE_NAMES, PACKAGES, VERSION } from './packages.manifest.mjs';

export const RELEASE_VERSION = VERSION;

export const PUBLISHED_PACKAGES = PACKAGE_NAMES;

// `status` is the parsed `changeset status --output` JSON
// ({ changesets, releases: [{ name, type, oldVersion, newVersion }] }).
// `fixed` (optional) is the `.changeset/config.json` "fixed" array.
// Returns a list of error strings; empty means the plan is exactly the release.
export function checkReleasePlan(status, { version = RELEASE_VERSION, packages = PUBLISHED_PACKAGES, fixed } = {}) {
  const errors = [];
  if (fixed !== undefined) {
    const group = (fixed ?? []).find((g) => g.some((n) => packages.includes(n)));
    const same = group && group.length === packages.length && packages.every((n) => group.includes(n));
    if (!same) errors.push(`.changeset/config.json "fixed" must hold exactly one group with the published packages: ${packages.join(', ')}`);
  }
  const releases = Array.isArray(status?.releases) ? status.releases : [];
  const byName = new Map(releases.map((r) => [r.name, r]));
  for (const name of packages) {
    const r = byName.get(name);
    if (!r) errors.push(`${name}: no pending release (expected ${version})`);
    else if (r.newVersion !== version) errors.push(`${name}: release plan is ${r.oldVersion} -> ${r.newVersion} (${r.type}); expected exactly ${version}`);
  }
  // Private workspaces show up as `type: "none"` entries (their exact
  // `@salmonui/*` ranges are rewritten, their version is not); anything that
  // would change another package's version is an error.
  for (const r of releases) {
    if (packages.includes(r.name)) continue;
    if (r.type !== 'none' || r.newVersion !== r.oldVersion) {
      errors.push(`${r.name}: not a published package but the plan bumps it ${r.oldVersion} -> ${r.newVersion} (${r.type})`);
    }
  }
  return errors;
}

// After `changeset version` the release changesets are consumed: every
// published package then already carries `version` and no changeset is
// pending. Returns the published versions (name -> version) when that is so,
// otherwise undefined.
export function versionedRelease(root, { version = RELEASE_VERSION, packages = PUBLISHED_PACKAGES } = {}) {
  const pending = readdirSync(join(root, '.changeset')).filter((f) => f.endsWith('.md') && f !== 'README.md');
  if (pending.length) return undefined;
  const versions = {};
  for (const { dir } of PACKAGES) {
    let pkg;
    try {
      pkg = JSON.parse(readFileSync(join(root, dir, 'package.json'), 'utf8'));
    } catch {
      continue;
    }
    if (packages.includes(pkg.name)) versions[pkg.name] = pkg.version;
  }
  const ok = packages.every((name) => versions[name] === version);
  return ok ? versions : undefined;
}

// Runs `changeset status --output` in `root` and checks the plan; a release
// already versioned to exactly `RELEASE_VERSION` passes as well.
export function verifyReleasePlan(root) {
  if (versionedRelease(root)) return [];
  const dir = mkdtempSync(join(tmpdir(), 'salmon-release-plan-'));
  try {
    const out = join(dir, 'status.json');
    const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const res = spawnSync(npx, ['changeset', 'status', '--verbose', `--output=${out}`], { cwd: root, stdio: 'inherit' });
    if (res.status !== 0) return [`changeset status exited with ${res.status}`];
    const status = JSON.parse(readFileSync(out, 'utf8'));
    const config = JSON.parse(readFileSync(join(root, '.changeset/config.json'), 'utf8'));
    return checkReleasePlan(status, { fixed: config.fixed ?? [] });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const errors = verifyReleasePlan(new URL('../../', import.meta.url).pathname);
  for (const e of errors) console.error(`release plan: ${e}`);
  if (errors.length) process.exit(1);
  console.log(`release plan: every published package releases as ${RELEASE_VERSION}`);
}
