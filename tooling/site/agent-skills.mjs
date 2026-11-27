#!/usr/bin/env node
// skills:build (AI-readable docs): one Agent Skill per component family,
// `skills/salmonui-<family>/SKILL.md`, generated from the same sources as
// llms.txt (the docs pages in docs/site/content, the generated api.json and
// the packages' `exports`). Nothing here is hand-written or committed: the
// repository `skills/` folder is git-ignored, and build-export.mjs writes the
// same files into the static export (`/skills/<name>/SKILL.md`) with a
// well-known discovery index (`/.well-known/agent-skills/index.json`), so
// `npx skills add <site>` finds every skill.
//
//   node tooling/site/agent-skills.mjs [--out <dir>] [--site-url <url>]
//
// Families come from the package manifest (tooling/checks/packages.manifest.mjs):
// one skill per component family (its subpath plus the family's further
// subpaths: `@salmonui/data-grid/features` joins `data-grid`, a package's
// other public entries such as `@salmonui/charts/server` join its first
// family, the pivot engine joins `pivot-table`), and one package-level skill
// each for @salmonui/core, @salmonui/data, @salmonui/export and the Data Grid
// engine (`@salmonui/data-grid/engine` and its subpaths). A docs page belongs
// to the families it imports from; a Data Grid page always belongs to
// `data-grid`; a section page without imports belongs to the component
// families whose components it names most.
//
// Plain Node ESM, no dependencies; parsing is reused from
// docs/site/lib/catalog.mjs and tooling/site/api-reference.mjs.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadAllDocs } from '../../docs/site/lib/catalog.mjs';
import { PACKAGES, allFamilies } from '../checks/packages.manifest.mjs';
import { buildApiReference, writeApiReference } from './api-reference.mjs';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

export const SKILLS_DIR = join(repoRoot, 'skills');
/** Well-known discovery index read by `npx skills add <site>` (agentskills.io discovery 0.2.0). */
export const WELL_KNOWN_INDEX = '.well-known/agent-skills/index.json';
export const DISCOVERY_SCHEMA = 'https://schemas.agentskills.io/discovery/0.2.0/schema.json';
export const SKILL_PREFIX = 'salmonui-';
/** The theme stylesheet every app imports once (the theme variables only; each family stylesheet carries what it renders). */
export const CORE_STYLES = '@salmonui/core/styles.css';
/** Packages whose engine subpaths (`./engine`, `./engine/*`) get a package-level skill of their own. */
const ENGINE_SKILLS = Object.freeze({
  '@salmonui/data-grid': {
    slug: 'data-grid-engine',
    description:
      'The framework-agnostic Data Grid engine: a store with sorting, filtering, search, paging, grouping, aggregates, selection, editing, validation, tree and export models, without React or the DOM.',
  },
});
const MAX_MAIN = 8;
const MAX_IMPORT_NAMES = 6;
const MAX_API_SYMBOLS = 40;
const MAX_TYPE_NAMES = 30;
const MAX_API_SYMBOLS_WIDE = 6;

/** Base URL rule of docs/site/lib/site-url.ts: `SITE_URL`, default https://salmonui.dev, no trailing slash. */
export function resolveSiteUrl(value = process.env.SITE_URL) {
  return (String(value ?? '').trim() || 'https://salmonui.dev').replace(/\/+$/, '');
}

/** `'@salmonui/buttons'` + `'./button'` -> `'@salmonui/buttons/button'`. */
export const specifierOf = (pkgName, subpath) => (subpath === '.' ? pkgName : `${pkgName}${subpath.slice(1)}`);

/** `'date-picker'` -> `'Date Picker'`. */
export const humanize = (slug) => slug.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');

/** `'date-picker'` -> `'DatePicker'`. */
const pascal = (slug) => humanize(slug).replaceAll(' ', '');

/** Markdown route of a docs page (`docHref()` in docs/site/lib/site.ts plus `.md`). */
export const docMarkdownUrl = (siteUrl, doc) => `${siteUrl}/docs/${doc.section ?? 'data-grid'}/${doc.slug}.md`;

/** Markdown route of a reference entry (`entryHref()` in docs/site/lib/api-reference.ts plus `.md`). */
export const entryMarkdownUrl = (siteUrl, pkg, entry) =>
  `${siteUrl}/docs/reference/${pkg.slug}${entry.subpath === '.' ? '' : `/${entry.slug}`}.md`;

/** Values (not types) a reader calls or renders: components, functions, classes, constants. */
const isValueSymbol = (symbol) => symbol.kind !== 'interface' && symbol.kind !== 'type';

/** Components and capitalized functions (React components typed as functions). */
const isComponent = (symbol) => symbol.kind === 'component' || ((symbol.kind === 'function' || symbol.kind === 'class') && /^[A-Z]/.test(symbol.name) && !/^[A-Z0-9_]+$/.test(symbol.name));

/**
 * Plain prose for a skill: HTML comments dropped, links reduced to their
 * label (a skill links only to absolute `.md` pages it builds itself),
 * `{@link}` tags reduced to code, whitespace collapsed.
 */
export function cleanProse(text) {
  return String(text ?? '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/!?\[((?:[^\][]|\[[^\]]*\])*)\]\([^)]*\)/g, '$1')
    .replace(/\{@link(?:code|plain)?\s+([^\s}|]+)(?:[\s|]+([^}]*))?\}/g, (_, target, label) => `\`${label?.trim() || target}\``)
    .replace(/\s+/g, ' ')
    .trim();
}

/** First sentence of a text, at most `max` characters (cut at a word). */
export function firstSentence(text, max = 220) {
  const clean = cleanProse(text);
  const match = /^(.+?[.!?])(?:\s|$)/.exec(clean);
  let sentence = match ? match[1] : clean;
  if (sentence.length > max) sentence = `${sentence.slice(0, max).replace(/\s+\S*$/, '')}...`;
  return sentence;
}

/** As many whole sentences of a text as fit in `max` characters (at least the first, cut at a word). */
export function sentences(text, max = 320) {
  const clean = cleanProse(text);
  const parts = clean.split(/(?<=[.!?])\s+/).filter(Boolean);
  let out = '';
  for (const part of parts) {
    const next = out ? `${out} ${part}` : part;
    if (out && next.length > max) break;
    out = next;
  }
  return out.length > max ? firstSentence(out, max) : out;
}

/** Non-code body lines (fenced code removed). */
function proseLines(body) {
  const out = [];
  let open = null;
  for (const line of body.split(/\r?\n/)) {
    const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (open === null && marker) {
      open = marker;
      out.push('');
    } else if (open !== null) {
      if (marker && marker[0] === open[0] && marker.length >= open.length && line.trim() === marker) open = null;
    } else out.push(line);
  }
  return out;
}

/** The first prose paragraph of a docs page body (no heading, list, table, quote or HTML). */
export function leadingParagraph(body) {
  const paragraphs = proseLines(body).join('\n').split(/\n\s*\n/);
  for (const paragraph of paragraphs) {
    const text = paragraph.trim();
    if (text === '' || /^(#|[-*+]\s|\d+\.\s|\||>|<)/.test(text)) continue;
    const clean = cleanProse(text);
    // A paragraph that introduces a list or code block (ends with `:`) does not stand alone.
    if (clean !== '' && !clean.endsWith(':')) return clean;
  }
  return '';
}

/** Bullets of an optional `## Common mistakes` section of a docs page (continuation lines joined). */
export function commonMistakesOf(body) {
  const lines = proseLines(body);
  const start = lines.findIndex((line) => /^##\s+Common mistakes\s*$/i.test(line));
  if (start < 0) return [];
  const bullets = [];
  for (const line of lines.slice(start + 1)) {
    if (/^#{1,2}\s/.test(line)) break;
    const item = /^\s{0,3}[-*+]\s+(.*)$/.exec(line);
    if (item) bullets.push(item[1]);
    else if (line.trim() !== '' && bullets.length > 0 && /^\s/.test(line)) bullets[bullets.length - 1] += ` ${line.trim()}`;
  }
  return bullets.map(cleanProse).filter(Boolean);
}

/** Package specifiers a docs page imports from (`from '@salmonui/...'`, code included). */
export function importsOf(body) {
  return [...new Set([...body.matchAll(/from\s+['"](@salmonui\/[a-z0-9/-]+)['"]/g)].map((match) => match[1]))];
}

/**
 * Skills of the API reference: `Map<familySlug, family>`, with
 * `{ slug, name, title, react, pkgName, entries: [{ pkg, entry }] }` in
 * api.json order. `manifest` is the package manifest (`PACKAGES`); a package
 * missing from it gets one package-level skill.
 */
export function skillFamilies(api, manifest = PACKAGES) {
  const families = new Map();
  const add = (slug, title, react, pkg, entry) => {
    const about = Object.values(ENGINE_SKILLS).find((engine) => engine.slug === slug)?.description;
    const family = families.get(slug) ?? { slug, name: `${SKILL_PREFIX}${slug}`, title, react, pkgName: pkg.name, about, entries: [], alsoImport: [] };
    family.entries.push({ pkg, entry });
    families.set(slug, family);
  };
  for (const pkg of api.packages) {
    const m = manifest.find((candidate) => candidate.name === pkg.name);
    const fams = m?.families ?? [];
    const engineSlug = ENGINE_SKILLS[pkg.name]?.slug;
    for (const entry of pkg.entries) {
      const isEngine = entry.subpath === './engine' || entry.subpath.startsWith('./engine/');
      if (isEngine && engineSlug) {
        add(engineSlug, `${pkg.name}/engine`, false, pkg, entry);
        continue;
      }
      if (fams.length === 0) {
        add(pkg.slug, pkg.name, false, pkg, entry);
        continue;
      }
      const own = fams.find((fam) => (fam.root ? entry.subpath === '.' : entry.subpath === `./${fam.name}` || entry.subpath.startsWith(`./${fam.name}/`)));
      const fam = own ?? fams[0];
      add(fam.name, humanize(fam.name), true, pkg, entry);
      const family = families.get(fam.name);
      if (family.alsoImport.length === 0) family.alsoImport = alsoImportOf(fam, manifest);
    }
  }
  // Entries in api.json order, the family's own subpath first.
  const ownEntry = (family, entry) => entry.slug === family.slug || (entry.subpath === '.' && family.react);
  for (const family of families.values()) {
    family.entries.sort((a, b) => Number(ownEntry(family, b.entry)) - Number(ownEntry(family, a.entry)));
  }
  return families;
}

/**
 * The stylesheets of other families an application imports with `fam`
 * because its stylesheet does not carry them (manifest `alsoImport`):
 * `[{ sheet, when }]`, `when` null when always needed.
 */
export function alsoImportOf(fam, manifest = PACKAGES) {
  const specifiers = new Map(
    (manifest === PACKAGES ? allFamilies() : manifest.flatMap((pkg) => (pkg.families ?? []).map((f) => ({ family: f, specifier: f.root ? pkg.name : `${pkg.name}/${f.name}` })))).map(({ family, specifier }) => [family.name, specifier]),
  );
  return Object.entries(fam.alsoImport ?? {}).flatMap(([name, when]) => (specifiers.has(name) ? [{ sheet: `${specifiers.get(name)}/styles.css`, when }] : []));
}

/**
 * Main symbols of a family: React components (the one named after the
 * family first), or a package's functions.
 */
function mainComponents(family) {
  const primary = pascal(family.slug);
  const pick = family.react ? isComponent : (symbol) => symbol.kind === 'function' || symbol.kind === 'component';
  const out = family.entries.flatMap(({ entry }) => entry.symbols.filter(pick));
  const unique = [...new Map(out.map((s) => [s.name, s])).values()];
  // Package-level skills lead with their components, then the `create*` factories.
  const rank = (s) => (s.name === primary ? 0 : family.react ? 1 : s.kind === 'component' ? 1 : /^create[A-Z]/.test(s.name) ? 2 : 3);
  return unique.sort((a, b) => rank(a) - rank(b));
}

/**
 * Assigns docs pages to families: `Map<familySlug, DocPage[]>` (page order
 * kept). See the file header for the rules.
 */
export function assignDocs(families, docs) {
  const bySpecifier = new Map();
  for (const family of families.values()) for (const { pkg, entry } of family.entries) bySpecifier.set(specifierOf(pkg.name, entry.subpath), family.slug);
  const names = [...families.values()].filter((f) => f.react).map((f) => ({ slug: f.slug, names: mainComponents(f).map((s) => s.name) }));
  const out = new Map([...families.keys()].map((slug) => [slug, []]));
  for (const doc of docs) {
    const owners = new Set();
    for (const specifier of importsOf(doc.body)) {
      const slug = bySpecifier.get(specifier);
      if (slug) owners.add(slug);
    }
    const section = doc.section ?? 'data-grid';
    if (section === 'data-grid' && out.has('data-grid')) owners.add('data-grid');
    if (owners.size === 0 && section !== 'data-grid') {
      let best = 0;
      let winners = [];
      for (const { slug, names: list } of names) {
        const count = list.reduce((n, name) => n + (doc.body.match(new RegExp(`[\`<]${name}\\b`, 'g'))?.length ?? 0), 0);
        if (count > best) [best, winners] = [count, [slug]];
        else if (count === best && count > 0) winners.push(slug);
      }
      for (const slug of winners) owners.add(slug);
    }
    for (const slug of owners) out.get(slug).push(doc);
  }
  return out;
}

/** Member names of a family's symbols, including the inline object members of type aliases. */
function memberNames(family) {
  const names = new Set();
  for (const { entry } of family.entries) {
    for (const symbol of entry.symbols) {
      for (const member of symbol.members ?? []) names.add(member.name);
      for (const match of symbol.signature.matchAll(/(?:^|[\s{;(,])'?([A-Za-z][\w-]*)'?\??:/g)) names.add(match[1]);
    }
  }
  return names;
}

const CONTROLLED_PAIRS = [
  ['value', 'onValueChange', 'defaultValue'],
  ['open', 'onOpenChange', 'defaultOpen'],
  ['pressed', 'onPressedChange', 'defaultPressed'],
  ['selectedKeys', 'onSelectionChange', 'defaultSelectedKeys'],
];

/** Common mistakes backed by the family's symbols and exports, then the docs pages' own bullets. */
export function commonMistakes(family, docs, exportsMap) {
  const out = [];
  const css = stylesheets(family, exportsMap);
  if (css.length > 0) {
    const others = css.filter((sheet) => sheet !== CORE_STYLES);
    const also = others.length > 0 ? ` and ${others.map((sheet) => `\`'${sheet}'\``).join(' and ')}` : '';
    out.push(`Forgetting a stylesheet: import \`'${CORE_STYLES}'\` once per app${also}, or the components render unstyled. Theme colors come from the five \`--salmon-*\` seeds, not from overriding component CSS.`);
  }
  const extras = family.alsoImport ?? [];
  if (extras.length > 0) {
    const list = extras.map(({ sheet, when }) => `\`'${sheet}'\`${when ? ` (${when})` : ''}`).join(', ');
    out.push(`Leaving out a stylesheet the family stylesheet does not carry: also import ${list}. The family stylesheet carries every other family it renders; do not import those.`);
  }
  const members = memberNames(family);
  for (const [value, onChange, initial] of CONTROLLED_PAIRS) {
    if (!members.has(value) || !members.has(onChange)) continue;
    const alt = members.has(initial) ? ` Use \`${initial}\` for an uncontrolled start value.` : '';
    out.push(`Passing \`${value}\` without \`${onChange}\`: the prop is controlled, so the component cannot change it and user input appears frozen.${alt}`);
  }
  const symbols = family.entries.flatMap(({ entry }) => entry.symbols);
  const named = symbols.find((s) => /accessible name/i.test(s.summary));
  if (named || members.has('aria-label') || symbols.some((s) => /accessible name/i.test(s.docs))) {
    out.push(`Leaving a control without an accessible name: icon-only or unlabelled controls need \`aria-label\` or \`aria-labelledby\`${named ? ` (\`${named.name}\`: ${firstSentence(named.summary || named.docs)})` : ''}.`);
  }
  if (family.react && [...members].some((name) => /^on[A-Z]/.test(name))) {
    out.push(`Passing event handlers or render functions from a React Server Component: functions cannot cross the server/client boundary. Render the component inside your own \`'use client'\` component when you pass callbacks.`);
  }
  for (const doc of docs) for (const bullet of commonMistakesOf(doc.body)) out.push(bullet);
  return [...new Set(out)];
}

/**
 * Stylesheet specifiers of a skill from its package's `exports`: a component
 * family's `./<subpath>/styles.css`, a package-level skill's `./styles.css`
 * (`@salmonui/core/styles.css`).
 */
function stylesheets(family, exportsMap) {
  const out = [];
  if (!family.react) {
    const own = exportsMap?.[family.pkgName];
    return own && './styles.css' in own && family.title === family.pkgName ? [specifierOf(family.pkgName, './styles.css')] : [];
  }
  for (const { pkg, entry } of family.entries) {
    const sub = entry.subpath === '.' ? './styles.css' : `${entry.subpath}/styles.css`;
    if (exportsMap?.[pkg.name] && sub in exportsMap[pkg.name]) out.push(specifierOf(pkg.name, sub));
  }
  return [...new Set(out)];
}

/** The docs page named after the family (`button.md`, title `DataGrid`), else the first one when `fallback`. */
function primaryDoc(family, docs, fallback = true) {
  return docs.find((doc) => doc.slug === family.slug || doc.title === pascal(family.slug) || doc.title === family.title) ?? (fallback ? docs[0] : undefined);
}

/** YAML double-quoted scalar (JSON strings are valid YAML). */
const yamlString = (text) => JSON.stringify(text);

/** The `description` front matter: what the family is and when to use the skill, one line. */
function skillDescription(family, docs, packageDescriptions = {}) {
  const specifiers = family.entries.map(({ pkg, entry }) => specifierOf(pkg.name, entry.subpath));
  // The family's own docs page describes it best; else its main component, else its package.
  const page = primaryDoc(family, docs, false);
  const main = family.react ? mainComponents(family)[0] : undefined;
  const source = page?.description || (family.react ? main?.summary : (family.about ?? packageDescriptions[family.pkgName])) || docs[0]?.description;
  const what = sentences(source || '', 300).replace(/`/g, '');
  const label = family.react ? `Salmon UI ${family.title} for React 19` : `Salmon UI ${family.title}`;
  const text = `${label}${what ? `: ${what}` : '.'} Use when writing, reviewing or debugging code that imports ${specifiers.slice(0, 3).join(', ')}${specifiers.length > 3 ? ' and its other subpaths' : ''}.`;
  return text.replace(/\s+/g, ' ').slice(0, 1024);
}

/** One SKILL.md. */
export function skillMarkdown(family, docs, { exportsMap, siteUrl, packageDescriptions = {} }) {
  const description = skillDescription(family, docs, packageDescriptions);
  const main = mainComponents(family);
  const about = family.react ? '' : (family.about ?? packageDescriptions[family.pkgName]);
  const lines = ['---', `name: ${family.name}`, `description: ${yamlString(description)}`, '---', ''];
  lines.push(`# Salmon UI: ${family.title}`, '');
  lines.push(
    `Generated from the Salmon UI docs and API reference (the same sources as ${siteUrl}/llms.txt). Prefer the linked Markdown pages over memory: they are the current documentation.`,
    '',
  );

  lines.push('## Import', '', '```sh', `npm install ${family.pkgName}`, '```', '', '```tsx');
  const imported = new Set();
  // A wide family (a whole package) shows its main entry; Public API lists the other subpaths.
  const wide = family.entries.length > 3;
  for (const { pkg, entry } of wide ? family.entries.slice(0, 1) : family.entries) {
    // A symbol re-exported by several entries is imported once, from the first.
    const names = new Set(entry.symbols.map((s) => s.name).filter((name) => !imported.has(name)));
    const ordered = main.map((s) => s.name).filter((name) => names.has(name)).slice(0, MAX_IMPORT_NAMES);
    const fallback = ordered.length > 0 ? ordered : entry.symbols.filter((s) => isValueSymbol(s) && names.has(s.name)).slice(0, MAX_IMPORT_NAMES).map((s) => s.name);
    for (const name of fallback) imported.add(name);
    if (fallback.length > 0) lines.push(`import { ${fallback.join(', ')} } from '${specifierOf(pkg.name, entry.subpath)}';`);
  }
  const css = stylesheets(family, exportsMap);
  if (css.length > 0) lines.push(`import '${CORE_STYLES}'; // once per app`);
  for (const { sheet, when } of family.alsoImport ?? []) if (when === null) lines.push(`import '${sheet}';`);
  for (const sheet of css) if (sheet !== CORE_STYLES) lines.push(`import '${sheet}';`);
  for (const { sheet, when } of family.alsoImport ?? []) if (when !== null) lines.push(`import '${sheet}'; // ${when.replace(/`/g, '')}`);
  lines.push('```', '');
  lines.push('Every `@salmonui/*` package of an app must be the same version.', '');

  lines.push('## Mental model', '');
  if (about) lines.push(cleanProse(about), '');
  for (const symbol of main.slice(0, MAX_MAIN)) {
    const summary = sentences(symbol.summary || symbol.docs, 320);
    lines.push(`- \`${symbol.name}\`${summary ? `: ${summary}` : ''}`);
  }
  const primary = primaryDoc(family, docs);
  const lead = primary ? leadingParagraph(primary.body) : '';
  if (main.length > 0) lines.push('');
  if (lead) lines.push(lead, '');
  if (docs.length > 0) lines.push(`The docs cover: ${docs.map((doc) => doc.title).join(', ')} (links under Docs).`, '');

  lines.push('## Public API', '');
  // Wide families list fewer values per entry; the entry reference has all.
  const cap = wide ? MAX_API_SYMBOLS_WIDE : MAX_API_SYMBOLS;
  for (const { pkg, entry } of family.entries) {
    const specifier = specifierOf(pkg.name, entry.subpath);
    const values = entry.symbols.filter(isValueSymbol);
    const types = entry.symbols.filter((s) => !isValueSymbol(s));
    lines.push(`### \`${specifier}\``, '');
    for (const symbol of values.slice(0, cap)) {
      const summary = firstSentence(symbol.summary, 200);
      lines.push(`- \`${symbol.name}\` (${symbol.kind})${summary ? `: ${summary}` : ''}`);
    }
    if (values.length > cap) lines.push(`- ...and ${values.length - cap} more values in the reference.`);
    // Wide families leave the type names to the entry reference.
    if (types.length > 0 && cap === MAX_API_SYMBOLS) {
      const typeCap = MAX_TYPE_NAMES;
      const shown = types.slice(0, typeCap).map((s) => `\`${s.name}\``).join(', ');
      lines.push(`- Types: ${shown}${types.length > typeCap ? `, and ${types.length - typeCap} more` : ''}.`);
    }
    lines.push(`- Full reference (signatures, JSDoc, props): [${specifier}](${entryMarkdownUrl(siteUrl, pkg, entry)})`, '');
  }

  const mistakes = commonMistakes(family, docs, exportsMap);
  if (mistakes.length > 0) {
    lines.push('## Common mistakes', '');
    for (const mistake of mistakes) lines.push(`- ${mistake}`);
    lines.push('');
  }

  lines.push('## Docs', '');
  if (family.slug === 'data-grid') {
    lines.push(`- [Data Grid documentation](${siteUrl}/docs/data-grid.md): every Data Grid guide by feature area.`);
  }
  for (const doc of docs) lines.push(`- [${doc.title}](${docMarkdownUrl(siteUrl, doc)}): ${cleanProse(doc.description)}`);
  lines.push(`- [API reference](${siteUrl}/docs/reference.md): every package and entry point.`);
  lines.push(`- [llms.txt](${siteUrl}/llms.txt): the index of every Markdown page.`);
  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`;
}

/**
 * Every skill from the sources: `api` (api.json), `docs` (catalog.mjs
 * `loadAllDocs()`), `exportsMap` (`{ [packageName]: exports }`) and
 * `siteUrl`, plus optional `packageDescriptions` (`{ [packageName]:
 * description }`, used for package-level skills) and `manifest` (the package
 * manifest). Returns `[{ name, slug, description, path, markdown }]` sorted
 * by name: every component family and every package-level skill.
 */
export function skillsFromSources({ api, docs, exportsMap = {}, siteUrl = resolveSiteUrl(), packageDescriptions = {}, manifest = PACKAGES }) {
  const site = resolveSiteUrl(siteUrl);
  const families = skillFamilies(api, manifest);
  const pages = assignDocs(families, docs);
  const out = [];
  for (const family of families.values()) {
    const familyDocs = pages.get(family.slug) ?? [];
    out.push({
      name: family.name,
      slug: family.slug,
      description: skillDescription(family, familyDocs, packageDescriptions),
      path: `${family.name}/SKILL.md`,
      markdown: skillMarkdown(family, familyDocs, { exportsMap, siteUrl: site, packageDescriptions }),
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export const sha256 = (text) => `sha256:${createHash('sha256').update(text).digest('hex')}`;

/** The well-known discovery index (agentskills.io 0.2.0): one `skill-md` artifact per skill. */
export function skillsIndex(skills, siteUrl = resolveSiteUrl()) {
  const site = resolveSiteUrl(siteUrl);
  return {
    $schema: DISCOVERY_SCHEMA,
    skills: skills.map((skill) => ({
      name: skill.name,
      type: 'skill-md',
      description: skill.description,
      url: `${site}/skills/${skill.path}`,
      digest: sha256(skill.markdown),
    })),
  };
}

/** Writes `<dir>/<name>/SKILL.md` for every skill, replacing the folder. */
export function writeSkills(dir, skills) {
  rmSync(dir, { recursive: true, force: true });
  for (const skill of skills) {
    mkdirSync(join(dir, skill.name), { recursive: true });
    writeFileSync(join(dir, skill.path), skill.markdown);
  }
}

/**
 * `{ exportsMap, packageDescriptions }` (`exports` and `description` by package
 * name) of the manifest packages under the repository, or of every
 * `<root>/packages/*\/package.json` under another root (tests).
 */
export function loadPackages(root = repoRoot) {
  const map = {};
  const descriptions = {};
  const dir = join(root, 'packages');
  const dirs = resolve(root) === resolve(repoRoot) ? PACKAGES.map((p) => join(root, p.dir)) : (existsSync(dir) ? readdirSync(dir).sort() : []).map((name) => join(dir, name));
  for (const pkgDir of dirs) {
    const file = join(pkgDir, 'package.json');
    if (!existsSync(file)) continue;
    const pkg = JSON.parse(readFileSync(file, 'utf8'));
    if (pkg.name && pkg.exports) map[pkg.name] = pkg.exports;
    if (pkg.name && typeof pkg.description === 'string') descriptions[pkg.name] = pkg.description;
  }
  return { exportsMap: map, packageDescriptions: descriptions };
}

/** `<root>/docs/site/generated/api.json` (api-reference.mjs `OUTPUT`), built when missing (needs `npm run build`). */
export async function loadApi({ root = repoRoot, file = join(root, 'docs/site/generated/api.json') } = {}) {
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  try {
    const reference = await buildApiReference({ root });
    writeApiReference(reference, file);
    return reference;
  } catch (error) {
    throw new Error(`skills: ${file} is missing and could not be built (${error.message}); run \`npm run build && npm run site:api\``);
  }
}

/** Skills from the repository sources. */
export async function loadSkills({ root = repoRoot, siteUrl = resolveSiteUrl() } = {}) {
  const api = await loadApi({ root });
  const docs = loadAllDocs(join(root, 'docs/site/content'));
  return skillsFromSources({ api, docs, ...loadPackages(root), siteUrl });
}

/** Static export: `<out>/skills/<name>/SKILL.md` and `<out>/.well-known/agent-skills/index.json`. */
export async function writeSiteSkills(out, { root = repoRoot, siteUrl = resolveSiteUrl() } = {}) {
  const skills = await loadSkills({ root, siteUrl });
  writeSkills(join(out, 'skills'), skills);
  const index = join(out, WELL_KNOWN_INDEX);
  mkdirSync(join(index, '..'), { recursive: true });
  writeFileSync(index, `${JSON.stringify(skillsIndex(skills, siteUrl), null, 2)}\n`);
  return skills;
}

async function main(argv) {
  let out = SKILLS_DIR;
  let siteUrl = resolveSiteUrl();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--out') out = resolve(argv[++i] ?? '');
    else if (arg === '--site-url') siteUrl = resolveSiteUrl(argv[++i]);
    else throw new Error(`unknown argument ${arg}; usage: agent-skills.mjs [--out <dir>] [--site-url <url>]`);
  }
  const skills = await loadSkills({ siteUrl });
  writeSkills(out, skills);
  for (const skill of skills) console.log(`  ${skill.path} (${skill.markdown.length} bytes)`);
  console.log(`skills:build: ${skills.length} skills -> ${out}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
