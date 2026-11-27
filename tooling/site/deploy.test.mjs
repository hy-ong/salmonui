import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { formatCommand, parseArgs, planDeploy, run, WRANGLER_VERSION } from './deploy.mjs';

const script = fileURLToPath(new URL('./deploy.mjs', import.meta.url));
const SHA = '0123456789abcdef0123456789abcdef01234567';
const WR = `npx --yes wrangler@${WRANGLER_VERSION}`;

/** Injected git, exec and output: nothing real runs. */
function harness({ dirty = false, results = {} } = {}) {
  const calls = [];
  const out = [];
  const err = [];
  const deps = {
    git: {
      head: () => ({ status: 0, stdout: `${SHA}\n` }),
      status: () => ({ status: 0, stdout: dirty ? ' M README.md\n' : '' }),
    },
    exec: (cmd) => {
      calls.push(formatCommand(cmd));
      return results[cmd.label] ?? 0;
    },
    log: (line) => out.push(line),
    error: (line) => err.push(line),
  };
  return { deps, calls, out, err };
}

describe('parseArgs', () => {
  test('defaults to production', () => {
    assert.deepEqual(parseArgs([]), { preview: false, dryRun: false, branch: null, help: false });
  });

  test('preview branch defaults and overrides', () => {
    assert.equal(parseArgs(['--preview']).branch, 'preview');
    assert.equal(parseArgs(['--preview', '--branch', 'feat-x']).branch, 'feat-x');
    assert.equal(parseArgs(['--preview', '--branch=feat-y', '--dry-run']).dryRun, true);
  });

  test('rejects bad combinations', () => {
    assert.throws(() => parseArgs(['--branch', 'x']), /only valid with --preview/);
    assert.throws(() => parseArgs(['--preview', '--branch', 'main']), /production branch/);
    assert.throws(() => parseArgs(['--preview', '--branch']), /needs a value/);
    assert.throws(() => parseArgs(['--prod']), /unknown argument --prod/);
  });
});

describe('planDeploy', () => {
  test('pins wrangler to an exact 4.x version', () => {
    assert.match(WRANGLER_VERSION, /^4\.\d+\.\d+$/);
  });

  test('production commands', () => {
    const plan = planDeploy({ preview: false, branch: null, sha: SHA });
    assert.equal(formatCommand(plan.whoami), `${WR} whoami`);
    assert.equal(formatCommand(plan.verify), 'npm run site:verify');
    assert.equal(formatCommand(plan.deploy), `${WR} pages deploy docs/site/out --project-name salmonui --branch main --commit-hash ${SHA}`);
  });

  test('preview commands are non-indexable and allow a dirty tree', () => {
    const plan = planDeploy({ preview: true, branch: 'preview', sha: SHA });
    assert.equal(formatCommand(plan.verify), 'SITE_INDEXABLE=0 npm run site:verify');
    assert.equal(
      formatCommand(plan.deploy),
      `${WR} pages deploy docs/site/out --project-name salmonui --branch preview --commit-hash ${SHA} --commit-dirty=true`,
    );
  });
});

describe('run', () => {
  test('--dry-run prints every command and executes nothing', () => {
    const h = harness();
    assert.equal(run(['--dry-run'], h.deps), 0);
    assert.deepEqual(h.calls, []);
    const text = h.out.join('\n');
    assert.match(text, /nothing is executed/);
    assert.ok(text.includes(`${WR} whoami   # skipped in a dry run`));
    assert.ok(text.includes('npm run site:verify'));
    assert.ok(text.includes(`--branch main --commit-hash ${SHA}`));
  });

  test('--dry-run reports a dirty production tree without executing', () => {
    const h = harness({ dirty: true });
    assert.equal(run(['--dry-run'], h.deps), 0);
    assert.deepEqual(h.calls, []);
    assert.match(h.out.join('\n'), /a real run stops here/);
  });

  test('--preview --dry-run prints the non-indexable build', () => {
    const h = harness({ dirty: true });
    assert.equal(run(['--preview', '--dry-run'], h.deps), 0);
    assert.deepEqual(h.calls, []);
    const text = h.out.join('\n');
    assert.ok(text.includes('SITE_INDEXABLE=0 npm run site:verify'));
    assert.ok(text.includes('--branch preview') && text.includes('--commit-dirty=true'));
  });

  test('a real run goes whoami, verify, deploy', () => {
    const h = harness();
    assert.equal(run([], h.deps), 0);
    assert.deepEqual(h.calls, [`${WR} whoami`, 'npm run site:verify', `${WR} pages deploy docs/site/out --project-name salmonui --branch main --commit-hash ${SHA}`]);
  });

  test('whoami failure stops with login instructions', () => {
    const h = harness({ results: { preflight: 1 } });
    assert.equal(run([], h.deps), 1);
    assert.deepEqual(h.calls, [`${WR} whoami`]);
    assert.match(h.err.join('\n'), /wrangler@4\.\d+\.\d+ login/);
  });

  test('production refuses a dirty tree before verifying', () => {
    const h = harness({ dirty: true });
    assert.equal(run([], h.deps), 1);
    assert.deepEqual(h.calls, [`${WR} whoami`]);
    assert.match(h.err.join('\n'), /dirty/);
  });

  test('a failed site:verify never deploys', () => {
    const h = harness({ results: { verify: 1 } });
    assert.equal(run(['--preview'], h.deps), 1);
    assert.equal(h.calls.length, 2);
    assert.match(h.err.join('\n'), /nothing was deployed/);
  });

  test('usage errors exit 2', () => {
    const h = harness();
    assert.equal(run(['--nope'], h.deps), 2);
    assert.deepEqual(h.calls, []);
  });
});

describe('CLI', () => {
  test('--help and a usage error', () => {
    const help = spawnSync(process.execPath, [script, '--help'], { encoding: 'utf8' });
    assert.equal(help.status, 0);
    assert.match(help.stdout, /usage: node tooling\/site\/deploy\.mjs/);
    const bad = spawnSync(process.execPath, [script, '--bogus'], { encoding: 'utf8' });
    assert.equal(bad.status, 2);
    assert.match(bad.stderr, /unknown argument --bogus/);
  });
});
