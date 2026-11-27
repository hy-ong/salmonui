// Source files behind each indexable route: they date the sitemap `lastmod` and the TechArticle
// `dateModified`, so both always agree. Server-only.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sitePaths, type DemoMeta, type DocPage } from './catalog.mjs';
import { buildSymbolPages, entryHref, type ApiReference } from './api-reference';
import { lastModified } from './lastmod';

const paths = sitePaths(process.cwd());
const repoRoot = join(paths.site, '..', '..');

/** The content markdown of a docs page. */
export const docSources = (doc: DocPage): string[] => [doc.path];

/** `demo.md` and `Demo.tsx` of a demo (the later of the two). */
export const demoSources = (demo: DemoMeta): string[] => [join(demo.folder, 'demo.md'), join(demo.folder, 'Demo.tsx')];

/** Every file under a published package's `src/` (`slug` is the package directory: `core`, `data-grid`, `buttons`, ...). */
export const packageSources = (slug: string): string[] => [join(repoRoot, 'packages', slug, 'src')];

/** A page component under `app/`, for example `(docs)/demos/page.tsx`. */
export const appSource = (file: string): string[] => [join(paths.site, 'app', file)];

export const lastModifiedOf = (sources: readonly string[]): string => lastModified(sources, paths.site);

export type ReferenceRoute = { pkg: string; path: string };

/** `generated/api.json`, or `undefined` when it has not been generated or does not parse. */
function readApiReference(): ApiReference | undefined {
  const file = join(paths.site, 'generated', 'api.json');
  if (!existsSync(file)) return undefined;
  try {
    const api = JSON.parse(readFileSync(file, 'utf8')) as Partial<ApiReference>;
    return Array.isArray(api.packages) ? (api as ApiReference) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Reference entry and symbol page routes from `generated/api.json`;
 * empty when the file has not been
 * generated.
 */
export function getReferenceRoutes(): ReferenceRoute[] {
  const api = readApiReference();
  if (!api) return [];
  return [
    ...api.packages.flatMap((pkg) => pkg.entries.map((entry) => ({ pkg: pkg.slug, path: entryHref(pkg, entry) }))),
    ...buildSymbolPages(api).pages.map((page) => ({ pkg: page.pkg.slug, path: page.href })),
  ];
}
