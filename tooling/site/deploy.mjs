#!/usr/bin/env node
// `npm run site:deploy`: direct upload of the static export to Cloudflare
// Pages. `--dry-run` is always safe.
//
//   node tooling/site/deploy.mjs [--preview [--branch <name>]] [--dry-run]
//
// 1. Preflight `wrangler whoami`; stop with login instructions on failure.
// 2. Production refuses a dirty working tree; `--preview` allows one and
//    passes `--commit-dirty=true`.
// 3. `npm run site:verify` (preview builds set SITE_INDEXABLE=0).
// 4. `wrangler pages deploy docs/site/out --project-name salmonui
//    --branch <main | preview branch> --commit-hash <HEAD sha>`.
//
// `--dry-run` prints every command and runs none of them (whoami included);
// it only reads `git rev-parse HEAD` and `git status --porcelain` to fill in
// the commit hash and report what a real run would refuse.
//
// Wrangler is not a dependency of any workspace; it runs
// through `npx` at the exact version pinned below.
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Exact Wrangler 4.x version; the only place it is pinned. */
export const WRANGLER_VERSION = '4.151.3';
export const PROJECT_NAME = 'salmonui';
export const PRODUCTION_BRANCH = 'main';
export const DEFAULT_PREVIEW_BRANCH = 'preview';
export const OUT_DIR = 'docs/site/out';

export const root = fileURLToPath(new URL('../../', import.meta.url));

const USAGE = 'usage: node tooling/site/deploy.mjs [--preview [--branch <name>]] [--dry-run]';

const wrangler = (...args) => ({ command: 'npx', args: ['--yes', `wrangler@${WRANGLER_VERSION}`, ...args] });

/** Parses CLI arguments; throws on anything it does not know. */
export function parseArgs(argv) {
  const options = { preview: false, dryRun: false, branch: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--preview') options.preview = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--branch' || arg.startsWith('--branch=')) {
      const value = arg === '--branch' ? argv[++i] : arg.slice('--branch='.length);
      if (!value || value.startsWith('-')) throw new Error('--branch needs a value');
      options.branch = value;
    } else throw new Error(`unknown argument ${arg}`);
  }
  if (options.branch && !options.preview) throw new Error('--branch is only valid with --preview (production always deploys main)');
  if (options.preview && (options.branch ?? DEFAULT_PREVIEW_BRANCH) === PRODUCTION_BRANCH) {
    throw new Error(`a preview cannot use the production branch "${PRODUCTION_BRANCH}"`);
  }
  if (options.preview) options.branch ??= DEFAULT_PREVIEW_BRANCH;
  return options;
}

/** The commands of one deployment, in order. */
export function planDeploy({ preview, branch, sha }) {
  const deployArgs = ['pages', 'deploy', OUT_DIR, '--project-name', PROJECT_NAME, '--branch', preview ? branch : PRODUCTION_BRANCH, '--commit-hash', sha];
  if (preview) deployArgs.push('--commit-dirty=true');
  return {
    whoami: { label: 'preflight', ...wrangler('whoami') },
    verify: { label: 'verify', command: 'npm', args: ['run', 'site:verify'], env: preview ? { SITE_INDEXABLE: '0' } : {} },
    deploy: { label: 'deploy', ...wrangler(...deployArgs) },
  };
}

const quote = (arg) => (/^[\w@%+=:,./-]+$/.test(arg) ? arg : `'${arg.replace(/'/g, `'\\''`)}'`);
/** Shell form of a planned command, for printing. */
export const formatCommand = ({ command, args, env = {} }) =>
  [...Object.entries(env).map(([k, v]) => `${k}=${quote(v)}`), command, ...args.map(quote)].join(' ');

const defaultGit = {
  head: () => spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }),
  status: () => spawnSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }),
};
const defaultExec = ({ command, args, env = {} }) =>
  spawnSync(command, args, { cwd: root, stdio: 'inherit', env: { ...process.env, ...env } }).status ?? 1;

const LOGIN_HELP = `Log in first: \`npx wrangler@${WRANGLER_VERSION} login\`, or export CLOUDFLARE_API_TOKEN (Pages edit permission) and CLOUDFLARE_ACCOUNT_ID.`;

/**
 * Runs the deployment. `exec`, `git` and `log` are injectable for tests;
 * returns the exit code instead of exiting.
 */
export function run(argv, { exec = defaultExec, git = defaultGit, log = console.log, error = console.error } = {}) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (e) {
    error(`site:deploy: ${e.message}\n${USAGE}`);
    return 2;
  }
  if (options.help) {
    log(USAGE);
    return 0;
  }

  const head = git.head();
  if (head.status !== 0) {
    error('site:deploy: cannot read the HEAD commit (is this a git checkout?)');
    return 1;
  }
  const sha = head.stdout.trim();
  const status = git.status();
  if (status.status !== 0) {
    error('site:deploy: `git status` failed');
    return 1;
  }
  const dirty = status.stdout.trim() !== '';
  const plan = planDeploy({ preview: options.preview, branch: options.branch, sha });
  const target = options.preview ? `preview branch "${options.branch}"` : `production (${PRODUCTION_BRANCH})`;

  if (options.dryRun) {
    log(`site:deploy --dry-run: ${target}, commit ${sha}${dirty ? ' (working tree dirty)' : ''}; nothing is executed`);
    log(`  1. ${formatCommand(plan.whoami)}   # skipped in a dry run`);
    if (dirty && !options.preview) log('  2. a real run stops here: production refuses a dirty working tree');
    else log(`  2. working tree check: ${dirty ? 'dirty, allowed for a preview (--commit-dirty=true)' : 'clean'}`);
    log(`  3. ${formatCommand(plan.verify)}`);
    log(`  4. ${formatCommand(plan.deploy)}`);
    return 0;
  }

  log(`site:deploy: ${target}, commit ${sha}`);
  log(`> ${formatCommand(plan.whoami)}`);
  if (exec(plan.whoami) !== 0) {
    error(`site:deploy: wrangler whoami failed. ${LOGIN_HELP}`);
    return 1;
  }
  if (dirty && !options.preview) {
    error('site:deploy: the working tree is dirty; production deploys only from a clean checkout of main (or use --preview).');
    return 1;
  }
  log(`> ${formatCommand(plan.verify)}`);
  if (exec(plan.verify) !== 0) {
    error('site:deploy: site:verify failed; nothing was deployed.');
    return 1;
  }
  log(`> ${formatCommand(plan.deploy)}`);
  if (exec(plan.deploy) !== 0) {
    error('site:deploy: wrangler pages deploy failed.');
    return 1;
  }
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = run(process.argv.slice(2));
