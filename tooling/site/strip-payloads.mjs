// Document-only pages in the static export (docs/site/lib/document-only.mjs):
// build-export.mjs removes
// their client navigation payload after `next build`.
import { existsSync, readdirSync, rmdirSync, rmSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { isDocumentOnlyPath } from '../../docs/site/lib/document-only.mjs';

/**
 * Removes the client navigation payload of every document-only page
 * (docs/site/lib/document-only.mjs): the RSC payload `<page>.txt` beside `<page>.html` and the
 * `__next.*` segment prefetch files directly in `<page>/` (the directory
 * itself goes when nothing else is in it). Pages that are not
 * document-only keep theirs. Returns `{ pages, files }` counts.
 */
export function stripDocumentOnlyPayloads(out) {
  let pages = 0;
  let files = 0;
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.name.endsWith('.html')) continue;
      const rel = relative(out, full).split(sep).join('/');
      if (!isDocumentOnlyPath(`/${rel.slice(0, -'.html'.length)}`)) continue;
      pages += 1;
      const base = full.slice(0, -'.html'.length);
      if (existsSync(`${base}.txt`)) {
        rmSync(`${base}.txt`);
        files += 1;
      }
      if (existsSync(base) && statSync(base).isDirectory()) {
        for (const name of readdirSync(base)) {
          if (name.startsWith('__next.') && statSync(join(base, name)).isFile()) {
            rmSync(join(base, name));
            files += 1;
          }
        }
        if (readdirSync(base).length === 0) rmdirSync(base);
      }
    }
  };
  walk(out);
  return { pages, files };
}
