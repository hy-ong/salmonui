// Build-time `lastmod` dates: the git
// commit date (`%cI`) of the last commit touching a page's source files. A
// source with uncommitted changes, an untracked one, or any source outside
// a git checkout uses the build time. Server-only.
import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { relative, sep } from 'node:path';

/** Raw stdout (not trimmed: `git status --porcelain` lines start with a space), or undefined on failure. */
function git(args: readonly string[], cwd: string): string | undefined {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 256 * 1024 * 1024 });
  } catch {
    return undefined;
  }
}

/**
 * One read of the repository: the newest commit date of every path the
 * history touches and the paths `git status` reports. Two git processes
 * for the whole sitemap instead of two per source (the sitemap dates
 * thousands of reference routes, and per-route `git log` took the
 * `/sitemap.xml` export past Next's 60 s page limit).
 */
type GitSnapshot = { root: string; dates: Map<string, string>; dirty: string[]; memo: Map<string, string | undefined> };

function readSnapshot(cwd: string): GitSnapshot | undefined {
  const top = git(['rev-parse', '--show-toplevel'], cwd)?.trim();
  if (!top) return undefined;
  const log = git(['log', '--format=%x01%cI', '--name-only', '--diff-merges=combined', '-z'], top);
  const status = git(['status', '--porcelain', '-z', '--untracked-files=all'], top);
  if (log === undefined || status === undefined) return undefined;
  const dates = new Map<string, string>();
  for (const chunk of log.split('\x01')) {
    const [date, ...names] = chunk.split('\0');
    if (!date) continue;
    for (const raw of names) {
      const name = raw.replace(/^\n/, '');
      if (name === '') continue;
      const known = dates.get(name);
      if (known === undefined || Date.parse(date) > Date.parse(known)) dates.set(name, date);
    }
  }
  // `XY path` entries; a rename or copy is followed by its source path.
  const dirty: string[] = [];
  const entries = status.split('\0');
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    if (entry.length < 4) continue;
    dirty.push(entry.slice(3));
    if (entry[0] === 'R' || entry[0] === 'C') dirty.push(entries[++i] ?? '');
  }
  return { root: realpathSync(top), dates, dirty: dirty.filter(Boolean), memo: new Map() };
}

/**
 * The snapshot, read once per production build or `next start` process; in
 * `next dev` it is re-read after a second, so one sitemap request shares
 * one read and later commits or edits still show.
 */
let snapshot: { cwd: string; at: number; value: GitSnapshot | undefined } | undefined;

function currentSnapshot(cwd: string): GitSnapshot | undefined {
  const now = Date.now();
  const fresh = snapshot && snapshot.cwd === cwd && (process.env.NODE_ENV === 'production' || now - snapshot.at < 1000);
  if (!fresh) snapshot = { cwd, at: now, value: readSnapshot(cwd) };
  return snapshot!.value;
}

/** Repository-relative `/` path of `path`, or undefined outside the repository. */
function repoPath(root: string, path: string): string | undefined {
  let real: string;
  try {
    real = realpathSync(path);
  } catch {
    return undefined;
  }
  const rel = relative(root, real);
  if (rel.startsWith('..')) return undefined;
  return rel.split(sep).join('/');
}

/** Commit date of one file or directory, or undefined when it has none (untracked, dirty, no git). */
function commitDate(path: string, cwd: string): string | undefined {
  const git = currentSnapshot(cwd);
  if (!git) return undefined;
  if (git.memo.has(path)) return git.memo.get(path);
  const rel = repoPath(git.root, path);
  const date = rel === undefined ? undefined : dateOf(git, rel);
  git.memo.set(path, date);
  return date;
}

function dateOf(git: GitSnapshot, rel: string): string | undefined {
  const inside = (name: string): boolean => rel === '' || name === rel || name.startsWith(`${rel}/`);
  if (git.dirty.some(inside)) return undefined;
  let latest = git.dates.get(rel);
  if (latest === undefined) {
    // A directory: the newest file under it.
    for (const [name, date] of git.dates) if (inside(name) && (latest === undefined || Date.parse(date) > Date.parse(latest))) latest = date;
  }
  return latest;
}

/** The build time: one instant per build or dev server (set in next.config.mjs), else now. */
const buildTime = (): string => process.env.SALMON_SITE_BUILD_TIME ?? new Date().toISOString();

/**
 * The latest modification date of `paths` (absolute files or directories)
 * as an ISO 8601 string. Any path without a clean commit date makes the
 * result the build time, since that path is newer than every commit.
 */
export function lastModified(paths: readonly string[], cwd: string = process.cwd()): string {
  let latest: string | undefined;
  for (const path of paths) {
    const date = commitDate(path, cwd);
    if (date === undefined) return buildTime();
    if (latest === undefined || Date.parse(date) > Date.parse(latest)) latest = date;
  }
  return latest ?? buildTime();
}
