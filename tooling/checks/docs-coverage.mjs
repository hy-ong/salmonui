// docs:coverage: integrity of the docs site catalog.
//
// Reads docs/site/content/*.md and content/<section>/*.md frontmatter
// (`title`, `description`, `demos`) and docs/site/demos/<id>/demo.md, then
// reports, and exits 1 on, catalog errors: a docs page embedding an unknown
// demo, a demo that no docs page embeds, a demo folder missing from
// demos/registry.ts, a docs page or demo without a `title` or `description`,
// titles shared within a section, reserved or non-kebab-case slugs, and a
// docs page, demo or site source importing a private
// `@salmonui/<package>/internal/*` subpath (docs and demos import the way
// users do).
//
//   node tooling/checks/docs-coverage.mjs          summary; exit 1 on catalog errors
//   node tooling/checks/docs-coverage.mjs --json   machine-readable report
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkCatalog, loadAllDocs, loadDemos, sitePaths } from '../../docs/site/lib/catalog.mjs';

const json = process.argv.includes('--json');

const paths = sitePaths(fileURLToPath(new URL('../../docs/site', import.meta.url)));
const docs = loadAllDocs(paths.content);
const demos = loadDemos(paths.demos);
const errors = [...checkCatalog(docs, demos).errors];

// Registry check: Next.js needs static imports, so each demo folder is listed by hand.
const registry = readFileSync(paths.registry, 'utf8');
for (const demo of demos) {
  if (!registry.includes(`'./${demo.id}/Demo'`) || !registry.includes(`'${demo.id}':`)) {
    errors.push(`demo "${demo.id}": not registered in docs/site/demos/registry.ts`);
  }
}

// Private subpaths: shared between @salmonui packages only, never in docs or demos.
const INTERNAL_IMPORT = /@salmonui\/[a-z0-9-]+\/internal(?:\/|['"`])/;
const sourceFiles = (dir) =>
  readdirSync(dir).flatMap((name) => {
    if (name === 'node_modules' || name === 'generated' || name === 'out' || name.startsWith('.next') || name === 'test-results') return [];
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : /\.(md|tsx?|mts|mjs|css)$/.test(name) ? [path] : [];
  });
for (const file of sourceFiles(paths.site)) {
  const text = readFileSync(file, 'utf8');
  if (INTERNAL_IMPORT.test(text)) errors.push(`${relative(paths.site, file)}: imports a private @salmonui/*/internal subpath; use the public entry points`);
}

const sections = [...new Set(docs.map((doc) => doc.section))];
if (json) {
  process.stdout.write(`${JSON.stringify({ docsPages: docs.length, demos: demos.length, sections, errors }, null, 2)}\n`);
} else {
  console.log(`Docs site catalog: ${docs.length} docs pages in ${sections.length} sections, ${demos.length} demos.`);
  if (errors.length) {
    console.log(`\nCatalog errors (${errors.length}):`);
    for (const error of errors) console.log(`  - ${error}`);
  } else console.log('No catalog errors.');
}

if (errors.length > 0) process.exitCode = 1;
