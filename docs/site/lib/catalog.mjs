// Docs site catalog: docs pages (content/*.md) and demos
// (demos/<id>/demo.md). Plain Node ESM with no dependencies, shared by the
// Next.js site (server components only) and tooling/checks/docs-coverage.mjs.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Paths of a site directory (docs/site). Callers pass the directory: the
 * checker resolves it from its own location, the site from `process.cwd()`
 * (bundled server code has no reliable `import.meta.url`).
 */
export function sitePaths(siteDir) {
  return {
    site: siteDir,
    content: join(siteDir, 'content'),
    demos: join(siteDir, 'demos'),
    registry: join(siteDir, 'demos', 'registry.ts'),
  };
}

const SLUG_PATTERN =/^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function parseScalar(raw) {
  const value = raw.trim();
  if (value === '') return '';
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) return value.slice(1, -1);
  if (value.startsWith('[') && value.endsWith(']')) {
    const inner = value.slice(1, -1).trim();
    return inner === '' ? [] : inner.split(',').map((part) => parseScalar(part));
  }
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

/**
 * Parses a leading `---` block of flat `key: value` lines. Values are strings,
 * numbers, booleans, inline lists (`[A, B]`) or block lists (`key:` followed by
 * `  - item` lines). Returns `{ data, body }`.
 */
export function parseFrontmatter(source) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(source);
  if (!match) return { data: {}, body: source };
  const data = {};
  let listKey = null;
  for (const line of (match[1] ?? '').split(/\r?\n/)) {
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue;
    const item = /^\s+-\s+(.*)$/.exec(line);
    if (item && listKey) {
      data[listKey].push(parseScalar(item[1] ?? ''));
      continue;
    }
    const pair = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (!pair) throw new Error(`frontmatter: cannot parse line "${line}"`);
    const [, key, rest] = pair;
    if ((rest ?? '').trim() === '') {
      data[key] = [];
      listKey = key;
    } else {
      data[key] = parseScalar(rest ?? '');
      listKey = null;
    }
  }
  return { data, body: source.slice(match[0].length) };
}

/** True when a frontmatter value is a non-empty string (titles and descriptions are required). */
const hasText = (value) => typeof value === 'string' && value.trim() !== '';

const asList = (value) => (Array.isArray(value) ? value.map(String) : value === undefined || value === '' ? [] : [String(value)]);

/**
 * Docs pages of one section, sorted by `order` then title. The flat
 * `content/*.md` files are the Data Grid section; `content/<section>/*.md`
 * are the other component categories.
 */
export function loadDocs(dir, section = 'data-grid') {
  if (!existsSync(dir)) return [];
  const docs = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.md')) continue;
    const slug = file.slice(0, -3);
    const path = join(dir, file);
    const { data, body } = parseFrontmatter(readFileSync(path, 'utf8'));
    docs.push({
      slug,
      section,
      path,
      title: String(data.title ?? slug),
      description: String(data.description ?? ''),
      hasTitle: hasText(data.title),
      hasDescription: hasText(data.description),
      category: String(data.category ?? 'General'),
      order: typeof data.order === 'number' ? data.order : 1000,
      demos: asList(data.demos),
      body,
    });
  }
  return docs.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
}

/**
 * Docs pages of every non-grid section: one `content/<section>/` folder per
 * component category, in name order.
 */
export function loadSectionDocs(contentDir) {
  if (!existsSync(contentDir)) return [];
  return readdirSync(contentDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .map((section) => ({ section, docs: loadDocs(join(contentDir, section), section) }));
}

/** Every docs page: the Data Grid pages, then each section's pages. */
export function loadAllDocs(contentDir) {
  return [...loadDocs(contentDir), ...loadSectionDocs(contentDir).flatMap((s) => s.docs)];
}

/**
 * Demos: one folder per demo id with `demo.md` (frontmatter: `title`,
 * `description`, `category`; the body holds optional notes) and
 * `Demo.tsx` (the only file that touches the DataGrid API).
 */
export function loadDemos(dir) {
  if (!existsSync(dir)) return [];
  const demos = [];
  for (const id of readdirSync(dir).sort()) {
    const folder = join(dir, id);
    if (!statSync(folder).isDirectory()) continue;
    const metaPath = join(folder, 'demo.md');
    const meta = existsSync(metaPath) ? parseFrontmatter(readFileSync(metaPath, 'utf8')).data : {};
    demos.push({
      id,
      folder,
      hasMeta: existsSync(metaPath),
      hasComponent: existsSync(join(folder, 'Demo.tsx')),
      title: String(meta.title ?? id),
      description: String(meta.description ?? ''),
      hasTitle: hasText(meta.title),
      hasDescription: hasText(meta.description),
      // The docs section (category) that owns the demo; `demoHref()` builds `/demos/<category>/<id>`.
      category: String(meta.category ?? 'data-grid'),
    });
  }
  return demos;
}

export function isValidSlug(slug) {
  return SLUG_PATTERN.test(slug);
}

/**
 * Docs slugs taken by static routes (`/docs/reference`): a content file with one of these names would be shadowed by the
 * route.
 */
export const RESERVED_SLUGS = Object.freeze(['reference']);

export function isReservedSlug(slug) {
  return RESERVED_SLUGS.includes(slug);
}

/**
 * Integrity problems of the catalog: file names, required front matter,
 * reserved slugs, dangling or unembedded demos, a demo embedded by another
 * section's page and titles shared within a section. Returns `{ errors }`.
 */
export function checkCatalog(docs, demos) {
  const errors = [];
  const demoIds = new Set(demos.map((demo) => demo.id));
  const embedded = new Set();
  for (const doc of docs) {
    const where = doc.section && doc.section !== 'data-grid' ? `${doc.section}/${doc.slug}` : doc.slug;
    if (!isValidSlug(doc.slug)) errors.push(`docs page "${where}": file name must be kebab-case`);
    if (isReservedSlug(doc.slug)) errors.push(`docs page "${where}": the slug is reserved for a static docs route`);
    if (doc.hasTitle === false) errors.push(`docs page "${where}": frontmatter has no \`title\``);
    if (doc.hasDescription === false) errors.push(`docs page "${where}": frontmatter has no \`description\``);
    for (const id of doc.demos) {
      if (!demoIds.has(id)) errors.push(`docs page "${where}": unknown demo "${id}"`);
      embedded.add(id);
    }
  }
  for (const demo of demos) {
    if (!isValidSlug(demo.id)) errors.push(`demo "${demo.id}": folder name must be kebab-case`);
    if (!demo.hasMeta) errors.push(`demo "${demo.id}": missing demo.md`);
    if (!demo.hasComponent) errors.push(`demo "${demo.id}": missing Demo.tsx`);
    if (demo.hasMeta && demo.hasTitle === false) errors.push(`demo "${demo.id}": demo.md frontmatter has no \`title\``);
    if (demo.hasMeta && demo.hasDescription === false) errors.push(`demo "${demo.id}": demo.md frontmatter has no \`description\``);
    if (!embedded.has(demo.id)) errors.push(`demo "${demo.id}": not embedded in any docs page (frontmatter \`demos\`)`);
    if (demo.category && !docs.some((doc) => (doc.section ?? 'data-grid') === demo.category && doc.demos.includes(demo.id)) && embedded.has(demo.id)) errors.push(`demo "${demo.id}": category ${demo.category} but embedded by another section's page`);
  }
  // Page titles add the section, so a title only has to be unique within its section.
  const titled = new Map();
  for (const [kind, items] of [['docs page', docs.map((doc) => ({ section: doc.section ?? 'data-grid', title: doc.title, name: doc.slug }))], ['demo', demos.map((demo) => ({ section: demo.category ?? 'data-grid', title: demo.title, name: demo.id }))]]) {
    for (const item of items) {
      const key = `${kind}\u0000${item.section}\u0000${item.title.trim().toLowerCase()}`;
      const names = titled.get(key) ?? [];
      names.push(item.name);
      titled.set(key, names);
      if (names.length === 2) errors.push(`${kind}s ${names.join(', ')} of section ${item.section} share the title "${item.title}"; titles must be unique within a section`);
    }
  }
  return { errors };
}
