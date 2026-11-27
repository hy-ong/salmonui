// AI-readable docs: the Markdown version of
// every `/docs` page, `/llms.txt` and `/llms-full.txt`, built at build time
// from the same catalog, content, demo sources and generated api.json as
// the HTML pages, so they never drift. Server-only; the route handlers are
// thin `force-static` wrappers over this module.
import {
  describeKinds,
  entryHref,
  entryListing,
  entrySpecifier,
  getApiReference,
  getSymbolPages,
  groupByKind,
  importLine,
  kindLabel,
  summaryText,
  type SymbolPage,
  type ApiEntry,
  type ApiMember,
  type ApiPackage,
  type ApiSymbol,
  type ApiTag,
} from './api-reference';
import { rewriteLink } from './markdown';
import { SITE_NAME } from './seo';
import {
  DATA_GRID_PATH,
  DATA_GRID_TITLE,
  demoHref,
  docHref,
  getDemo,
  getDemoGroups,
  getDemoSource,
  getDocs,
  getNavigation,
  getSections,
  groupDocs,
  type Section,
} from './site';
import { absoluteUrl, SITE_URL } from './site-url';
import type { DocPage } from './catalog.mjs';

export const MARKDOWN_CONTENT_TYPE = 'text/markdown; charset=utf-8';
export const TEXT_CONTENT_TYPE = 'text/plain; charset=utf-8';

/** Path of the Markdown version of a docs page: the page path plus `.md`. */
export const markdownPath = (pagePath: string): string => `${pagePath.replace(/\/+$/, '')}.md`;

const DOCS_SUMMARY =
  'Salmon UI is an open-source React 19 component library: a virtualized data grid, charts, scheduler and Gantt, pivot table, rich text and document editors, inputs, navigation and more, server-rendered, themed with five colors and measured against performance budgets.';

// --- Markdown helpers ---------------------------------------------------------

/** A fence longer than any backtick run in `code`. */
export function fence(code: string, lang: string): string {
  const longest = Math.max(2, ...[...code.matchAll(/`+/g)].map((match) => match[0].length));
  const ticks = '`'.repeat(longest + 1);
  return `${ticks}${lang}\n${code.replace(/\n+$/, '')}\n${ticks}`;
}

/** An absolute URL for a markdown link written on the page at `pagePath`, or `null` for plain text. */
function absoluteHref(href: string, pagePath: string, sourceDir: string): string | null {
  if (href.startsWith('#')) return `${absoluteUrl(pagePath)}${href}`;
  const target = rewriteLink(href, sourceDir);
  if ('plain' in target) return null;
  if (!target.href.startsWith('/') || target.href.startsWith('//')) return target.href;
  const hashAt = target.href.indexOf('#');
  const path = hashAt >= 0 ? target.href.slice(0, hashAt) : target.href;
  return `${absoluteUrl(path)}${hashAt >= 0 ? target.href.slice(hashAt) : ''}`;
}

const INLINE = /(`+)[\s\S]*?\1|<!--[\s\S]*?-->|(!?)\[((?:[^\][]|\[[^\]]*\])*)\]\(\s*<?([^)\s>]*)>?((?:\s+"[^"]*")?)\s*\)/g;

/** Rewrites links outside code to absolute URLs and drops HTML comments. */
function rewriteProse(text: string, pagePath: string, sourceDir: string): string {
  return text.replace(INLINE, (match, ticks: string | undefined, bang: string, label: string, href: string, title: string) => {
    if (ticks) return match;
    if (match.startsWith('<!--')) return '';
    const absolute = absoluteHref(href, pagePath, sourceDir);
    if (absolute === null) return bang ? '' : label;
    return `${bang}[${label}](${absolute}${title})`;
  });
}

/**
 * Clean Markdown for an AI reader: every link outside fenced code is
 * absolute on SITE_URL (or plain text for repository files), and HTML
 * comments are removed. Fenced code is kept verbatim.
 */
export function cleanMarkdown(markdown: string, pagePath: string, sourceDir = 'docs/site/content'): string {
  const out: string[] = [];
  let prose: string[] = [];
  let open: string | null = null;
  const flush = () => {
    if (prose.length > 0) out.push(rewriteProse(prose.join('\n'), pagePath, sourceDir));
    prose = [];
  };
  for (const line of markdown.split(/\r?\n/)) {
    const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (open === null && marker) {
      flush();
      open = marker;
      out.push(line);
    } else if (open !== null) {
      out.push(line);
      if (marker && marker[0] === open[0] && marker.length >= open.length && line.trim() === marker) open = null;
    } else prose.push(line);
  }
  flush();
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * A plain-text description (summaries lose their inline code) as one line
 * of Markdown prose: `<` becomes `&lt;`, so a summary that mentions `<!-- -->`
 * or a tag is not read as an HTML comment or raw HTML.
 */
const prose = (text: string): string => text.replace(/\s+/g, ' ').trim().replace(/</g, '&lt;');

/** `# title`, the description quote and the canonical URL line every Markdown page starts with. */
function header(title: string, description: string, pagePath: string): string {
  return `# ${title}\n\n> ${prose(description)}\n\nCanonical: ${absoluteUrl(pagePath)}`;
}

const link = (title: string, url: string, description?: string): string =>
  `- [${title}](${url})${description ? `: ${prose(description)}` : ''}`;

// --- Docs pages ---------------------------------------------------------------

const docPath = (doc: DocPage): string => docHref(doc);

/** A demo as Markdown: heading, live URL and its source files. */
export function demoMarkdown(id: string): string {
  const demo = getDemo(id);
  if (!demo) return `Live demo: ${absoluteUrl(demoHref(id))}`;
  const files = getDemoSource(demo).map((file) => `\`${file.name}\`:\n\n${fence(file.code, file.name.endsWith('.tsx') ? 'tsx' : 'ts')}`);
  return [`### Live demo: ${demo.title}`, `Live demo: ${absoluteUrl(demoHref(demo))}`, demo.description, ...files].filter(Boolean).join('\n\n');
}

/** One docs page: its body with each demo marker replaced by the demo's URL and source. */
export function docMarkdown(doc: DocPage): string {
  const path = docPath(doc);
  const placed = new Set<string>();
  const parts = doc.body.split(/^<!--\s*demo:\s*([a-z0-9-]+)\s*-->\s*$/m);
  const blocks = parts.map((part, index) => {
    if (index % 2 === 1) {
      placed.add(part);
      return demoMarkdown(part);
    }
    return cleanMarkdown(part, path);
  });
  for (const id of doc.demos) if (!placed.has(id)) blocks.push(demoMarkdown(id));
  return `${[header(doc.title, doc.description, path), ...blocks].filter((block) => block.trim() !== '').join('\n\n')}\n`;
}

export function docsHomeMarkdown(): string {
  const components = [
    '## Components',
    '',
    link(DATA_GRID_TITLE, absoluteUrl(markdownPath(DATA_GRID_PATH)), 'Guides with live demos for every Data Grid feature area.'),
    ...getSections().map((s) => link(s.title, absoluteUrl(markdownPath(`/docs/${s.section}`)), `Guides with live demos for the ${s.title} components.`)),
  ];
  const more = [
    '## More',
    '',
    link('API reference', absoluteUrl(markdownPath('/docs/reference')), 'Every exported symbol of every published entry point.'),
    link('Demos', absoluteUrl('/demos'), 'Every live demo, grouped by component.'),
    link('All guides in one file', absoluteUrl('/llms-full.txt'), 'Every guide of every component.'),
  ];
  return `${[header('Salmon UI documentation', DOCS_SUMMARY, '/docs'), components.join('\n'), more.join('\n')].join('\n\n')}\n`;
}

/** The index of a non-grid section (`/docs/<section>`). */
export function sectionIndexMarkdown(section: Section): string {
  const groups = groupDocs(section.docs).map(
    ({ category, docs }) => `## ${category}\n\n${docs.map((doc) => link(doc.title, absoluteUrl(markdownPath(docPath(doc))), doc.description)).join('\n')}`,
  );
  const intro = header(`Salmon UI ${section.title} documentation`, `Guides with live demos for the ${section.title} components.`, `/docs/${section.section}`);
  return `${[intro, ...groups].join('\n\n')}\n`;
}

export function dataGridIndexMarkdown(): string {
  const sections = getNavigation().map(
    ({ category, docs }) => `## ${category}\n\n${docs.map((doc) => link(doc.title, absoluteUrl(markdownPath(docPath(doc))), doc.description)).join('\n')}`,
  );
  const intro = header(
    'Salmon UI Data Grid documentation',
    'A virtualized React 19 data grid. Every page embeds live demos.',
    DATA_GRID_PATH,
  );
  return `${[intro, ...sections].join('\n\n')}\n`;
}

// --- API reference ------------------------------------------------------------

const entryPath = (pkg: ApiPackage, entry: ApiEntry): string => entryHref(pkg, entry);

export function referenceIndexMarkdown(): string {
  const reference = getApiReference();
  const intro = header(
    'API reference',
    'Generated API reference for the Salmon UI packages: every exported symbol of every entry point with its signature.',
    '/docs/reference',
  );
  const raw = `The whole reference as JSON (signatures, JSDoc and members of every symbol):${absoluteUrl('/docs/reference/api.json')}. Generated from \`${reference.generatedFrom}\`.`;
  const packages = reference.packages.map(
    (pkg) =>
      `## ${pkg.name}\n\n${pkg.entries
        .map((entry) => link(entrySpecifier(pkg, entry), absoluteUrl(markdownPath(entryPath(pkg, entry))), `${entry.symbols.length} symbols: ${describeKinds(entry.symbols)}`))
        .join('\n')}`,
  );
  return `${[intro, raw, ...packages].join('\n\n')}\n`;
}

/** JSDoc text as Markdown: `{@link X}` as inline code, links absolute. */
function jsdoc(text: string, pagePath: string, sourceDir: string): string {
  if (text.trim() === '') return '';
  const linked = text.replace(/\{@link(?:code|plain)?\s+([^\s}|]+)(?:[\s|]+([^}]*))?\}/g, (_, target: string, label?: string) =>
    label && label.trim() !== '' ? `${label.trim()} (\`${target}\`)` : `\`${target}\``,
  );
  return cleanMarkdown(linked, pagePath, sourceDir);
}

function tagsMarkdown(tags: readonly ApiTag[], pagePath: string, sourceDir: string): string {
  return tags
    .map((tag) => {
      if (tag.name === 'example' && !tag.text.includes('```')) return `- \`@example\`\n\n${fence(tag.text.trim(), 'tsx')}`;
      const text = jsdoc(tag.text, pagePath, sourceDir);
      return text.includes('\n') ? `- \`@${tag.name}\`\n\n${text}` : `- \`@${tag.name}\`${text ? ` ${text}` : ''}`;
    })
    .join('\n');
}

/** A table cell: one line, pipes escaped. */
const cell = (text: string): string => text.replace(/\r?\n+/g, ' ').replace(/\|/g, '\\|').trim();
const codeCell = (text: string): string => {
  const value = cell(text);
  const ticks = '`'.repeat(Math.max(0, ...[...value.matchAll(/`+/g)].map((match) => match[0].length)) + 1);
  return value === '' ? '' : `${ticks}${ticks.length > 1 ? ' ' : ''}${value}${ticks.length > 1 ? ' ' : ''}${ticks}`;
};

function membersTable(members: readonly ApiMember[], pagePath: string, sourceDir: string): string {
  const rows = members.map((member) => {
    const flags = [member.optional ? 'optional' : '', member.inherited ? 'inherited' : '', member.tags.some((tag) => tag.name === 'deprecated') ? 'deprecated' : '']
      .filter(Boolean)
      .join(', ');
    return `| ${codeCell(member.name)} | ${codeCell(member.signature)} | ${flags} | ${cell(jsdoc(member.summary || member.docs, pagePath, sourceDir))} |`;
  });
  return ['| Name | Signature | Flags | Description |', '| --- | --- | --- | --- |', ...rows].join('\n');
}

function symbolMarkdown(pkg: ApiPackage, symbol: ApiSymbol, entry: ApiEntry, pagePath: string, sourceDir: string, title = `### ${symbol.name}`): string {
  const pages = getSymbolPages();
  const page = pages.pageOf(pkg, entry, symbol.name)!;
  const parts = [title, `Kind: ${symbol.kind}`];
  if (page.href !== pagePath) parts.push(`Page: ${absoluteUrl(page.href)}`);
  parts.push(fence(symbol.signature, 'ts'));
  const docs = jsdoc(symbol.docs, pagePath, sourceDir);
  if (docs) parts.push(docs);
  if (symbol.tags.length > 0) parts.push(tagsMarkdown(symbol.tags, pagePath, sourceDir));
  const propsName = symbol.kind === 'component' ? /\(\s*(?:\{[^}]*\}|\w+)\s*:\s*([A-Z]\w*)/.exec(symbol.signature)?.[1] : undefined;
  if (propsName && propsName !== symbol.name && entry.symbols.some((candidate) => candidate.name === propsName && candidate.members?.length)) {
    parts.push(`Props: [\`${propsName}\`](${absoluteUrl(pages.pageOf(pkg, entry, propsName)!.href)}) (its members are the props)`);
  }
  if (symbol.members && symbol.members.length > 0) parts.push(`Members (${symbol.members.length}):\n\n${membersTable(symbol.members, pagePath, sourceDir)}`);
  return parts.join('\n\n');
}

/** One reference entry page: the import line, then symbols grouped by kind. */
export function referenceEntryMarkdown(pkg: ApiPackage, entry: ApiEntry): string {
  const path = entryPath(pkg, entry);
  const specifier = entrySpecifier(pkg, entry);
  const count = entry.symbols.length;
  const sourceDir = `packages/${pkg.slug}/src`;
  const intro = header(
    `${specifier} API reference`,
    `${count} exported ${count === 1 ? 'symbol' : 'symbols'} of ${specifier}: ${describeKinds(entry.symbols)}.`,
    path,
  );
  const { own, reexports } = entryListing(pkg, entry);
  const groups = groupByKind(own).map(
    (group) =>
      `## ${kindLabel(group.kind, 2).replace(/^./, (first) => first.toUpperCase())}\n\n${group.symbols.map((symbol) => symbolMarkdown(pkg, symbol, entry, path, sourceDir)).join('\n\n')}`,
  );
  // Re-exported names are documented in their home entry's Markdown; the
  // name list keeps them discoverable without repeating every family here.
  const reexported =
    reexports.length === 0
      ? []
      : [
          `## Re-exported entry points\n\n${reexports
            .map((group) => {
              const count = `${group.symbols.length} ${group.symbols.length === 1 ? 'symbol' : 'symbols'}: ${describeKinds(group.symbols)}`;
              const names = group.symbols.map((symbol) => `\`${symbol.name}\``).join(', ');
              return `${link(entrySpecifier(pkg, group.entry), absoluteUrl(markdownPath(entryHref(pkg, group.entry))), count)}\n  ${names}`;
            })
            .join('\n')}`,
        ];
  return `${[intro, fence(`import { … } from '${specifier}';`, 'ts'), ...groups, ...reexported].join('\n\n')}\n`;
}

/** One symbol page: its title and summary, the import line, then the symbol as in the entry Markdown. */
export function referenceSymbolMarkdown(page: SymbolPage): string {
  const { pkg, entry, symbol, href } = page;
  const specifier = entrySpecifier(pkg, entry);
  const summary = summaryText(symbol, 1000);
  const intro = header(`${symbol.name} (${specifier})`, `The ${symbol.name} ${kindLabel(symbol.kind)} of ${specifier}${summary === '' ? '.' : `: ${summary}`}`, href);
  const also = page.alsoFrom.length > 0 ? `Also exported from ${page.alsoFrom.map((other) => `\`${entrySpecifier(pkg, other)}\``).join(', ')}.` : '';
  const index = `Entry index: ${absoluteUrl(entryPath(pkg, entry))} (Markdown with every symbol of the entry: ${absoluteUrl(markdownPath(entryPath(pkg, entry)))}).`;
  const body = symbolMarkdown(pkg, symbol, entry, href, `packages/${pkg.slug}/src`, '## Reference');
  return `${[intro, fence(importLine(page), 'ts'), also, index, body].filter(Boolean).join('\n\n')}\n`;
}

// --- Page list ----------------------------------------------------------------

export type MarkdownPage = { path: string; markdown: string; render: () => string };

/** Every Markdown page: `path` is the HTML page path, `markdown` the `.md` path. */
export function getMarkdownPages(): MarkdownPage[] {
  const reference = getApiReference();
  const page = (path: string, render: () => string): MarkdownPage => ({ path, markdown: markdownPath(path), render });
  return [
    page('/docs', docsHomeMarkdown),
    page(DATA_GRID_PATH, dataGridIndexMarkdown),
    ...getDocs().map((doc) => page(docPath(doc), () => docMarkdown(doc))),
    ...getSections().flatMap((section) => [page(`/docs/${section.section}`, () => sectionIndexMarkdown(section)), ...section.docs.map((doc) => page(docPath(doc), () => docMarkdown(doc)))]),
    page('/docs/reference', referenceIndexMarkdown),
    ...reference.packages.flatMap((pkg) => pkg.entries.map((entry) => page(entryPath(pkg, entry), () => referenceEntryMarkdown(pkg, entry)))),
    ...getSymbolPages().pages.map((symbolPage) => page(symbolPage.href, () => referenceSymbolMarkdown(symbolPage))),
  ];
}

// --- llms.txt -----------------------------------------------------------------

/** `/llms.txt` per the llms.txt convention (llmstxt.org). */
export function llmsTxt(): string {
  const reference = getApiReference();
  const sections: string[] = [
    `# ${SITE_NAME}`,
    `> ${DOCS_SUMMARY}`,
    `Every documentation page below is available as Markdown at its URL plus \`.md\` (the links below point to the Markdown). ${absoluteUrl('/llms-full.txt')} holds every guide of every component in one file. The site is English-only; live demos need a browser, and their source code is inlined in the Markdown of the guide that embeds them.`,
    [
      '## Docs',
      '',
      link('Salmon UI documentation', absoluteUrl(markdownPath('/docs')), 'The docs home: components, API reference and demos.'),
      link('Data Grid documentation', absoluteUrl(markdownPath(DATA_GRID_PATH)), 'Every Data Grid guide by feature area.'),
      link('All guides in one file', absoluteUrl('/llms-full.txt'), 'Every guide of every component, concatenated in navigation order.'),
    ].join('\n'),
    ...getNavigation().map(({ category, docs }) =>
      [`## ${DATA_GRID_TITLE}: ${category}`, '', ...docs.map((doc) => link(doc.title, absoluteUrl(markdownPath(docPath(doc))), doc.description))].join('\n'),
    ),
    ...getSections().flatMap((section) =>
      groupDocs(section.docs).map(({ category, docs }) =>
        [`## ${section.title}: ${category}`, '', ...docs.map((doc) => link(doc.title, absoluteUrl(markdownPath(docPath(doc))), doc.description))].join('\n'),
      ),
    ),
    [
      '## Demos',
      '',
      ...[{ section: 'data-grid' }, ...getSections()].flatMap(({ section }) =>
        getDemoGroups(section).flatMap(({ category, demos }) => demos.map((demo) => link(`${demo.title} (${category})`, absoluteUrl(demoHref(demo)), demo.description))),
      ),
    ].join('\n'),
    [
      '## API reference',
      '',
      link('API reference index', absoluteUrl(markdownPath('/docs/reference')), 'Every package and entry point.'),
      ...reference.packages.flatMap((pkg) =>
        pkg.entries.map((entry) =>
          link(entrySpecifier(pkg, entry), absoluteUrl(markdownPath(entryPath(pkg, entry))), `${entry.symbols.length} symbols: ${describeKinds(entry.symbols)}.`),
        ),
      ),
      link('api.json', absoluteUrl('/docs/reference/api.json'), 'The whole generated reference as JSON: signatures, JSDoc and members of every exported symbol.'),
    ].join('\n'),
  ];
  return `${sections.join('\n\n')}\n`;
}

/**
 * `/llms-full.txt`: every guide of every component, Data Grid first and then
 * each category in `/docs` order, each in sidebar order (the API reference is
 * linked, not inlined).
 */
export function llmsFullTxt(): string {
  const docs = [
    ...getNavigation().flatMap((group) => group.docs),
    ...getSections().flatMap((section) => groupDocs(section.docs).flatMap((group) => group.docs)),
  ];
  const intro = `# ${SITE_NAME} documentation (full text)\n\n> ${DOCS_SUMMARY}\n\nEvery guide of every component in navigation order (Data Grid first, then each category). Each page starts with its title and canonical URL. The API reference is not included: see ${absoluteUrl(markdownPath('/docs/reference'))} and ${absoluteUrl('/docs/reference/api.json')}. Index: ${SITE_URL}/llms.txt`;
  return `${[intro, ...docs.map(docMarkdown)].map((page) => page.trim()).join('\n\n---\n\n')}\n`;
}
