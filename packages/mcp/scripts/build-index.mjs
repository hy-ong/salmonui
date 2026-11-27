#!/usr/bin/env node
// mcp:index: writes packages/mcp/dist/index.json, the offline index the
// @salmonui/mcp server answers from. Runs from the repository (it is the
// package's `prepack` script, so `npm publish` always bundles an index of the
// version being published). Requires `npm run build` (the API reference is
// read from the built declaration files).
//
//   node packages/mcp/scripts/build-index.mjs [--api docs/site/generated/api.json] [--out <file>]
//
// Sources: tooling/checks/packages.manifest.mjs (packages, families), each
// package.json `exports`, the API reference (`buildApiReference()` of
// tooling/site/api-reference.mjs, or a saved `npm run site:api` output via
// --api), docs/site/content/**/*.md and docs/site/demos/<id>/. Private
// `./internal/*` entries and `@internal` symbols are left out.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
export const OUTPUT = join(repoRoot, 'packages/mcp/dist/index.json');
export const SITE_URL = 'https://salmonui.dev';
/** Packages documented by the index (the server itself is not a component package). */
const SELF = '@salmonui/mcp';

const MAX_SUMMARY = 240;
const MAX_DOCS = 1200;
const MAX_SIGNATURE = 1500;

/** `'@salmonui/buttons'` + `'./button'` -> `'@salmonui/buttons/button'`. */
export const specifierOf = (pkgName, subpath) => (subpath === '.' ? pkgName : `${pkgName}${subpath.slice(1)}`);

/** A family's further entry: its `subpaths` keys are relative to the family (`./features` of `chart` -> `@salmonui/charts/chart/features`). */
export const familySubSpecifier = (pkg, fam, sub) => (fam.root ? specifierOf(pkg.name, sub) : `${pkg.name}/${fam.name}${sub.slice(1)}`);

const isPrivateSubpath = (subpath) => subpath.includes('*') || /(^|\/)internal(\/|$)/.test(subpath) || subpath === './package.json';

/** Prose for the index: HTML comments and `{@link}` tags reduced, site links made absolute. */
export function cleanText(text, { siteUrl = SITE_URL } = {}) {
  return String(text ?? '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\{@link(?:code|plain)?\s+([^\s}|]+)(?:[\s|]+([^}]*))?\}/g, (_, target, label) => `\`${label?.trim() || target}\``)
    .replace(/\]\((\/(?:docs|demos)\/[^)\s]*)\)/g, `](${siteUrl}$1)`)
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** First sentence of a text (at most `max` characters, cut at a word). */
export function firstSentence(text, max = MAX_SUMMARY) {
  const flat = String(text ?? '').split(/\n\s*\n/)[0].replace(/\s+/g, ' ').trim();
  const match = /^(.+?[.!?])(?:\s|$)/.exec(flat);
  let sentence = match ? match[1] : flat;
  if (sentence.length > max) sentence = `${sentence.slice(0, max).replace(/\s+\S*$/, '')}...`;
  return sentence;
}

const clip = (text, max) => (text.length > max ? `${text.slice(0, max).replace(/\s+\S*$/, '')} ...` : text);

/** Markdown heading -> the site's anchor (docs/site/lib/markdown.ts `slugify`). */
export function slugify(text) {
  const slug = text
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug === '' ? 'section' : slug;
}

/** Splits a docs body into sections at `##` / `###` headings outside code fences. */
export function splitSections(title, body) {
  const sections = [{ heading: title, anchor: '', lines: [] }];
  const seen = new Map();
  let fence = null;
  for (const line of body.split(/\r?\n/)) {
    const open = /^\s*(```+|~~~+)/.exec(line);
    if (open) {
      if (fence === null) fence = open[1][0];
      else if (open[1][0] === fence) fence = null;
    }
    const heading = fence === null && !open ? /^(#{2,3})\s+(.+?)\s*#*\s*$/.exec(line) : null;
    if (heading) {
      const base = slugify(heading[2]);
      const count = (seen.get(base) ?? 0) + 1;
      seen.set(base, count);
      sections.push({ heading: heading[2].replace(/`/g, ''), anchor: count === 1 ? base : `${base}-${count}`, lines: [] });
    } else {
      sections.at(-1).lines.push(line);
    }
  }
  return sections.map((s) => ({ heading: s.heading, anchor: s.anchor, text: s.lines.join('\n').trim() })).filter((s, i) => i === 0 || s.text !== '');
}

const tagText = (tags, ...names) => tags.find((t) => names.includes(t.name))?.text;

/** A default value from `@default` / `@defaultValue` or "(default `x`)" prose. */
export function defaultOf(tags, docs) {
  const tag = tagText(tags, 'default', 'defaultValue');
  if (tag !== undefined && tag.trim() !== '') return tag.trim().replace(/^`(.*)`$/s, '$1');
  const prose = /\(default:?\s+`([^`]+)`\)|[Dd]efaults? (?:to |is )?`([^`]+)`|[Dd]efault:\s*`([^`]+)`/.exec(docs ?? '');
  return prose ? (prose[1] ?? prose[2] ?? prose[3]) : undefined;
}

/** The type part of a printed member (`readonly label?: string;` -> `string`); methods keep their signature. */
export function memberType(name, signature) {
  const flat = signature.replace(/\s+/g, ' ').trim().replace(/;$/, '');
  const escaped = name.replace(/[$]/g, '\\$');
  const m = new RegExp(`^(?:readonly )?["']?${escaped}["']?\\??: (.*)$`, 's').exec(flat);
  return m ? m[1] : flat;
}

/** The head of an interface / object type declaration (`interface ButtonProps extends X`). */
const declarationHead = (signature) => {
  const brace = signature.indexOf('{');
  return brace === -1 ? signature : `${signature.slice(0, brace).trim()} { ... }`;
};

const ELEMENT_RETURN = /\):\s*(?:import\("react"\)\.)?(?:React\.)?(?:JSX\.Element|ReactElement|ReactNode|ReactPortal|Element)(?:<[^;]*>)?(?:\s*\|\s*null)?;?\s*$/m;

/**
 * The index kind of a symbol: the reference's kind, except that a capitalized
 * function (or class) returning a React element is a component even when the
 * reference printed its return type without resolving it.
 */
export function kindOf(symbol) {
  if (symbol.kind !== 'function' && symbol.kind !== 'const') return symbol.kind;
  if (!/^[A-Z]/.test(symbol.name) || /^[A-Z0-9_]+$/.test(symbol.name)) return symbol.kind;
  if (symbol.kind === 'function' && ELEMENT_RETURN.test(symbol.signature)) return 'component';
  if (symbol.kind === 'const' && /ExoticComponent<|=> (?:React\.)?(?:JSX\.Element|ReactElement|ReactNode)/.test(symbol.signature)) return 'component';
  return symbol.kind;
}

const isInternal = (symbol) => symbol.tags?.some((t) => t.name === 'internal');

/**
 * Builds the index object from loaded sources (pure; the tests feed it fixtures).
 *
 * @param {object} input
 * @param {readonly object[]} input.manifest      PACKAGES of packages.manifest.mjs
 * @param {Record<string, object>} input.packageJsons  package name -> package.json
 * @param {object} input.api                     ApiReference (tooling/site/api-reference.mjs)
 * @param {readonly object[]} input.docs         loadAllDocs() pages
 * @param {readonly object[]} input.demos        loadDemos() entries plus `source` and `notes`
 * @param {string} input.version
 * @param {string} [input.generatedFrom]
 * @param {string} [input.siteUrl]
 */
export function buildIndex({ manifest, packageJsons, api, docs, demos, version, generatedFrom = 'unknown', siteUrl = SITE_URL }) {
  const clean = (text) => cleanText(text, { siteUrl });
  const packages = manifest.filter((p) => p.name !== SELF);

  // Family membership of every public specifier, ranked so a symbol's home is its family entry.
  const familyOf = new Map();
  const rank = new Map();
  packages.forEach((pkg, pi) => {
    pkg.families.forEach((fam) => {
      const spec = fam.root ? pkg.name : `${pkg.name}/${fam.name}`;
      familyOf.set(spec, fam.name);
      rank.set(spec, pi * 1000);
      for (const sub of Object.keys(fam.subpaths ?? {})) {
        familyOf.set(familySubSpecifier(pkg, fam, sub), fam.name);
        rank.set(familySubSpecifier(pkg, fam, sub), pi * 1000 + 1);
      }
    });
  });
  const rankOf = (spec) => rank.get(spec) ?? packages.findIndex((p) => p.name === spec.split('/').slice(0, 2).join('/')) * 1000 + 2;

  // Symbols, merged across the entries that export the same declaration.
  const names = new Map();
  const merged = new Map();
  for (const apiPkg of api.packages) {
    if (apiPkg.name === SELF || !packages.some((p) => p.name === apiPkg.name)) continue;
    for (const entry of apiPkg.entries) {
      if (isPrivateSubpath(entry.subpath)) continue;
      const spec = specifierOf(apiPkg.name, entry.subpath);
      const list = [];
      for (const symbol of entry.symbols) {
        if (isInternal(symbol)) continue;
        list.push(symbol.name);
        const key = `${symbol.name}\0${symbol.kind}\0${symbol.signature}`;
        const known = merged.get(key);
        if (known) known.specifiers.push(spec);
        else merged.set(key, { symbol, specifiers: [spec] });
      }
      names.set(spec, list);
    }
  }
  const symbols = [...merged.values()]
    .map(({ symbol, specifiers }) => {
      const tags = symbol.tags ?? [];
      const docsText = clean(symbol.docs);
      const summary = firstSentence(clean(symbol.summary || symbol.docs));
      const members = (symbol.members ?? [])
        .filter((m) => !isInternal(m))
        .map((m) => {
          const mTags = m.tags ?? [];
          const deprecated = tagText(mTags, 'deprecated');
          const def = defaultOf(mTags, m.docs);
          return {
            name: m.name,
            type: clip(memberType(m.name, m.signature), 400),
            optional: Boolean(m.optional),
            summary: firstSentence(clean(m.summary || m.docs), 200),
            ...(def !== undefined ? { default: def } : {}),
            ...(deprecated !== undefined ? { deprecated: clean(deprecated) } : {}),
            ...(m.inherited ? { inherited: true } : {}),
          };
        });
      const params = tags
        .filter((t) => t.name === 'param')
        .map((t) => /^\s*\[?([\w$.]+)\]?\s*(?:-\s*)?([\s\S]*)$/.exec(t.text))
        .filter(Boolean)
        .map((m) => ({ name: m[1], text: firstSentence(clean(m[2]), 300) }));
      const returns = tagText(tags, 'returns', 'return');
      const deprecated = tagText(tags, 'deprecated');
      const signature = members.length && (symbol.kind === 'interface' || symbol.kind === 'type' || symbol.kind === 'class') ? declarationHead(symbol.signature) : symbol.signature;
      return {
        name: symbol.name,
        kind: kindOf(symbol),
        specifiers: [...specifiers].sort((a, b) => rankOf(a) - rankOf(b) || a.length - b.length || a.localeCompare(b)),
        summary,
        ...(docsText && docsText !== summary ? { docs: clip(docsText, MAX_DOCS) } : {}),
        signature: clip(signature, MAX_SIGNATURE),
        ...(deprecated !== undefined ? { deprecated: clean(deprecated) } : {}),
        ...(params.length ? { params } : {}),
        ...(returns ? { returns: firstSentence(clean(returns), 300) } : {}),
        ...(members.length ? { members } : {}),
      };
    })
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : rankOf(a.specifiers[0]) - rankOf(b.specifiers[0])));
  const symbolAt = (spec, name) => symbols.find((s) => s.name === name && s.specifiers.includes(spec));

  // Docs pages.
  const docPages = docs.map((doc) => {
    const section = doc.section ?? 'data-grid';
    return {
      title: doc.title,
      description: clean(doc.description),
      path: `/docs/${section}/${doc.slug}`,
      section,
      sections: splitSections(doc.title, clean(doc.body)),
      imports: [...new Set([...doc.body.matchAll(/from\s+['"](@salmonui\/[^'"]+)['"]/g)].map((m) => m[1]))],
    };
  });

  // Packages and families.
  const entries = [];
  // Family name -> its stylesheet specifier, for `alsoImport` (the manifest's
  // stylesheets an application imports with a family besides its own).
  const sheetOf = new Map(packages.flatMap((pkg) => pkg.families.map((fam) => [fam.name, `${fam.root ? pkg.name : `${pkg.name}/${fam.name}`}/styles.css`])));
  const indexPackages = packages.map((pkg) => {
    const pj = packageJsons[pkg.name] ?? {};
    const exportKeys = Object.keys(pj.exports ?? {}).filter((k) => !isPrivateSubpath(k));
    const familySpecs = new Set();
    const families = pkg.families.map((fam) => {
      const sub = fam.root ? '.' : `./${fam.name}`;
      const specifier = specifierOf(pkg.name, sub);
      const subpaths = Object.keys(fam.subpaths ?? {}).map((s) => familySubSpecifier(pkg, fam, s));
      for (const s of [specifier, ...subpaths]) familySpecs.add(s);
      const cssKey = fam.root ? './styles.css' : `${sub}/styles.css`;
      const own = names.get(specifier) ?? [];
      const ownSymbols = own.map((n) => symbolAt(specifier, n)).filter(Boolean);
      const components = ownSymbols.filter((s) => s.kind === 'component').map((s) => s.name);
      const hooks = ownSymbols.filter((s) => s.kind === 'function' && /^use[A-Z]/.test(s.name)).map((s) => s.name);
      const kebab = (n) => n.replace(/(?<=[a-z0-9])(?=[A-Z])/g, '-').toLowerCase();
      const main = ownSymbols.find((s) => s.kind === 'component' && kebab(s.name) === fam.name) ?? ownSymbols.find((s) => s.kind === 'component');
      const famDocs = docPages.filter((d) => d.imports.some((i) => i === specifier || i.startsWith(`${specifier}/`)));
      return {
        name: fam.name,
        specifier,
        subpaths,
        stylesheet: exportKeys.includes(cssKey) ? specifierOf(pkg.name, cssKey) : null,
        summary: main?.summary || firstSentence(famDocs[0]?.description ?? '') || pkg.description,
        components,
        hooks,
        docs: famDocs.slice(0, 6).map((d) => d.path),
        ...(fam.alsoImport ? { alsoImport: Object.entries(fam.alsoImport).filter(([n]) => sheetOf.has(n)).map(([n, when]) => ({ stylesheet: sheetOf.get(n), when })) } : {}),
      };
    });
    for (const key of exportKeys) {
      const spec = specifierOf(pkg.name, key);
      const isCss = key.endsWith('.css');
      entries.push({ specifier: spec, package: pkg.name, kind: isCss ? 'css' : 'js', ...(familyOf.has(spec) ? { family: familyOf.get(spec) } : {}), ...(isCss ? {} : { names: names.get(spec) ?? [] }) });
    }
    return {
      name: pkg.name,
      description: pkg.description,
      react: pkg.react,
      deps: pkg.deps,
      optionalPeers: pkg.optionalPeers,
      stylesheet: exportKeys.includes('./styles.css') ? `${pkg.name}/styles.css` : null,
      families,
      entries: exportKeys.filter((k) => !k.endsWith('.css')).map((k) => specifierOf(pkg.name, k)).filter((s) => !familySpecs.has(s)),
    };
  });
  entries.sort((a, b) => rankOf(a.specifier) - rankOf(b.specifier) || a.specifier.localeCompare(b.specifier));

  const indexDemos = demos.map((demo) => ({
    id: demo.id,
    title: demo.title,
    description: clean(demo.description),
    category: demo.category ?? 'data-grid',
    path: `/demos/${demo.category ?? 'data-grid'}/${demo.id}`,
    notes: clean(demo.notes ?? ''),
    imports: [...new Set([...(demo.source ?? '').matchAll(/from\s+['"](@salmonui\/[^'"]+)['"]/g)].map((m) => m[1]))],
    source: demo.source ?? '',
  }));

  return {
    format: 1,
    version,
    generatedFrom,
    siteUrl,
    packages: indexPackages,
    entries,
    symbols,
    docs: docPages.map(({ imports: _imports, ...page }) => page),
    demos: indexDemos,
  };
}

function gitSha() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return 'unknown';
  }
}

/** Loads every source from the repository and builds the index. */
export async function buildRepositoryIndex({ apiFile } = {}) {
  const [{ PACKAGES, VERSION }, catalog] = await Promise.all([import('../../../tooling/checks/packages.manifest.mjs'), import('../../../docs/site/lib/catalog.mjs')]);
  const { loadAllDocs, loadDemos, parseFrontmatter } = catalog;
  let api;
  if (apiFile) api = JSON.parse(readFileSync(resolve(apiFile), 'utf8'));
  else {
    const { buildApiReference } = await import('../../../tooling/site/api-reference.mjs');
    api = await buildApiReference();
  }
  const packageJsons = {};
  for (const pkg of PACKAGES) {
    const file = join(repoRoot, pkg.dir, 'package.json');
    if (existsSync(file)) packageJsons[pkg.name] = JSON.parse(readFileSync(file, 'utf8'));
  }
  const demosDir = join(repoRoot, 'docs/site/demos');
  const demos = loadDemos(demosDir)
    .filter((d) => d.hasComponent)
    .map((d) => {
      const md = join(d.folder, 'demo.md');
      return { ...d, source: readFileSync(join(d.folder, 'Demo.tsx'), 'utf8'), notes: existsSync(md) ? parseFrontmatter(readFileSync(md, 'utf8')).body : '' };
    });
  return buildIndex({
    manifest: PACKAGES,
    packageJsons,
    api,
    docs: loadAllDocs(join(repoRoot, 'docs/site/content')),
    demos,
    version: VERSION,
    generatedFrom: gitSha(),
  });
}

/** Writes the index compact and atomically (temp file + rename). */
export function writeIndex(index, file = OUTPUT) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(index));
  renameSync(tmp, file);
  return readFileSync(file).length;
}

async function main(argv) {
  const opt = (name) => {
    const i = argv.indexOf(name);
    return i === -1 ? undefined : argv[i + 1];
  };
  const started = performance.now();
  const index = await buildRepositoryIndex({ apiFile: opt('--api') });
  const out = resolve(opt('--out') ?? OUTPUT);
  const bytes = writeIndex(index, out);
  const ms = Math.round(performance.now() - started);
  console.log(
    `mcp:index: ${index.packages.length} packages, ${index.entries.length} entries, ${index.symbols.length} symbols, ${index.docs.length} docs pages, ${index.demos.length} demos -> ${out} (${(bytes / 1024 / 1024).toFixed(2)} MB, ${ms} ms)`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`mcp:index: ${error.message}`);
    process.exit(1);
  });
}
