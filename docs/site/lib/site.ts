// Server-only catalog access for the App Router pages. Reads the docs pages
// and demo metadata from disk at build/render time.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  loadDemos,
  loadDocs,
  loadSectionDocs,
  parseFrontmatter,
  sitePaths,
  type DemoMeta,
  type DocPage,
} from './catalog.mjs';
import { getApiReference, packageIndexHref } from './api-reference';
import { createSlugger, renderMarkdown, slugify, type TocEntry } from './markdown';

// `next dev`, `next build` and `next start` run with the site directory as cwd.
const paths = sitePaths(process.cwd());

export function getDocs(): DocPage[] {
  return loadDocs(paths.content);
}

export function getDoc(slug: string): DocPage | undefined {
  return getDocs().find((doc) => doc.slug === slug);
}

/** Every demo of every section (`demo.md` `category`, default `'data-grid'`). */
export function getDemos(): DemoMeta[] {
  return loadDemos(paths.demos);
}

/** The Data Grid demos (the `/demos/data-grid` browser and routes). */
export function getDataGridDemos(): DemoMeta[] {
  return getDemos().filter((demo) => demo.category === 'data-grid');
}

export function getDemo(id: string): DemoMeta | undefined {
  return getDemos().find((demo) => demo.id === id);
}

// --- Component sections ---------------------

/** Display names of the docs sections. */
const SECTION_TITLES: Readonly<Record<string, string>> = { 'data-grid': 'Data Grid', buttons: 'Buttons' };

export const sectionTitle = (section: string): string => SECTION_TITLES[section] ?? section.replace(/(^|-)([a-z])/g, (_, dash: string, c: string) => `${dash ? ' ' : ''}${c.toUpperCase()}`);

export type Section = { section: string; title: string; docs: DocPage[] };

/** The non-grid sections with docs pages (`content/<section>/*.md`), in name order. */
export function getSections(): Section[] {
  return loadSectionDocs(paths.content)
    .filter((s) => s.docs.length > 0)
    .map((s) => ({ section: s.section, title: sectionTitle(s.section), docs: s.docs }));
}

export function getSection(section: string): Section | undefined {
  return getSections().find((s) => s.section === section);
}

/** Every docs page: Data Grid, then each section. */
export function getAllDocs(): DocPage[] {
  return [...getDocs(), ...getSections().flatMap((s) => s.docs)];
}

/** URL of a docs page in its section. */
export const docHref = (doc: DocPage): string => `/docs/${doc.section}/${doc.slug}`;

/** Whether `doc` is the lead page of its group: its title is the group's label. */
export const isLeadDoc = (doc: Pick<DocPage, 'title' | 'category'>): boolean => doc.title.toLowerCase() === doc.category.toLowerCase();

/**
 * Docs grouped by their `category` front matter, in catalog order:
 * categories by first appearance, pages in page order except that a group's
 * lead page (`isLeadDoc`) comes first, as the sidebar nests the others under it.
 */
export function groupDocs(docs: readonly DocPage[]): { category: string; docs: DocPage[] }[] {
  const groups = new Map<string, DocPage[]>();
  for (const doc of docs) {
    const list = groups.get(doc.category) ?? [];
    if (isLeadDoc(doc)) list.unshift(doc);
    else list.push(doc);
    groups.set(doc.category, list);
  }
  return [...groups].map(([category, list]) => ({ category, docs: list }));
}

/** Docs page that embeds a demo (the first one, by page order). */
export function getDocForDemo(id: string): DocPage | undefined {
  return getAllDocs().find((doc) => doc.demos.includes(id));
}

/** Docs grouped by category, in catalog order. */
export function getNavigation(): { category: string; docs: DocPage[] }[] {
  return groupDocs(getDocs());
}

/** Anchor of a category section on the `/docs/data-grid` index. */
export const categoryAnchor = (category: string): string => `category-${slugify(category)}`;

// --- Sidebar navigation -------------------------------------------------------

export type NavItem = { title: string; href: string };
export type NavGroup = { title: string; items: NavItem[] };

/**
 * One node of a component's sidebar tree: a page link (`href`), a lead page
 * with the rest of its group nested under it (`href` and `children`), or a
 * heading that is not a page (`anchor`, its section on an index page, and
 * `children`).
 */
export type NavNode = { title: string; href?: string | undefined; anchor?: string | undefined; children: NavNode[] };

/** The Data Grid docs section (docs URLs are per component). */
export const DATA_GRID_PATH = '/docs/data-grid';
export const DATA_GRID_TITLE = 'Data Grid';

/** Demos are per component too: `/demos` lists the components. */
export const DEMOS_PATH = '/demos';
export const DATA_GRID_DEMOS_PATH = '/demos/data-grid';

/** URL of one demo page, `/demos/<category>/<id>` (the category comes from its `demo.md`). */
export function demoHref(demo: string | DemoMeta): string {
  const meta = typeof demo === 'string' ? getDemo(demo) : demo;
  return `${DEMOS_PATH}/${meta?.category ?? 'data-grid'}/${typeof demo === 'string' ? demo : demo.id}`;
}

/**
 * Page title of a demo: `<title> demo`, followed by ` · <Section>` outside Data Grid like
 * the docs pages, so demos of different sections never share a `<title>`
 * (the catalog rejects two demos of one section with the same title).
 */
export function demoPageTitle(demo: Pick<DemoMeta, 'title' | 'category'>): string {
  const section = demo.category ?? 'data-grid';
  return section === 'data-grid' ? `${demo.title} demo` : `${demo.title} demo · ${sectionTitle(section)}`;
}

/** Anchor of a category section on the `/demos/data-grid` browser. */
export const demoCategoryAnchor = (category: string): string => `category-${slugify(category)}`;

// --- Component families --------------

/**
 * Docs sections folded into a broader family: the sidebar's first level.
 * Every other section is a family of its own (same slug and title).
 */
const SECTION_FAMILY: Readonly<Record<string, string>> = { 'data-grid': 'grids', 'pivot-table': 'grids' };
const FAMILY_TITLES: Readonly<Record<string, string>> = { grids: 'Grids' };

/**
 * Sections that are one component as a whole: the section index is the
 * component's overview and its pages keep their front matter groups.
 */
const SECTION_COMPONENTS: Readonly<Record<string, string>> = { 'data-grid': DATA_GRID_TITLE, 'pivot-table': 'Pivot Table' };

/**
 * Components of a family with more than one docs page: component name ->
 * page slugs in reading order, the first being the component's overview.
 * Any page of a section not listed here or in `FAMILY_GUIDES` is a
 * single-page component named by its title. Slugs that do not exist are
 * ignored, so removing a page never breaks the tree.
 */
const COMPONENT_PAGES: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>> = {
  calendars: { DatePicker: ['date-picker', 'date-time-picker'] },
  chat: { Conversation: ['conversation', 'conversation-assistant', 'conversation-messages', 'conversation-history'] },
  'data-visualization': {
    Chart: ['chart', 'chart-axes', 'chart-interaction', 'chart-elements', 'chart-analysis'],
    Gauge: ['gauge', 'linear-gauge'],
    GeoMap: ['geo-map', 'geo-map-overlays'],
    Kanban: ['kanban', 'kanban-drag-drop', 'kanban-editing', 'kanban-performance', 'kanban-accessibility'],
  },
  dropdowns: {
    Combobox: ['combobox', 'combobox-multiple', 'autocomplete', 'multicolumn-combobox'],
    Listbox: ['listbox', 'listbox-data', 'dual-list'],
    Select: ['select', 'select-multiple'],
    TreeSelect: ['tree-select', 'tree-select-checkboxes'],
  },
  editors: { 'Rich Text Editor': ['rich-text-editor', 'html-sanitizer-and-paste', 'modern-rich-text-editor'] },
  navigation: {
    Toolbar: ['toolbar', 'app-bar'],
    'Tree View': ['tree-view', 'tree-view-templates', 'tree-view-checkboxes', 'tree-view-loading', 'tree-view-drag-drop'],
  },
};

/** Family-wide pages (behavior shared by the family's components), listed after the components under "Guides". */
const FAMILY_GUIDES: Readonly<Record<string, readonly string[]>> = {
  calendars: ['dates', 'picker-behavior', 'platform'],
  chat: ['smart-recipes', 'agent-skills'],
  'data-visualization': ['rendering-and-colors', 'size-animation-rtl'],
  dropdowns: ['dropdown-templates', 'dropdown-popup-data', 'dropdown-forms', 'dropdown-accessibility'],
  editors: ['headless-editor'],
  navigation: ['common-behavior'],
};

/** Label of the family-wide pages' heading in the sidebar and breadcrumbs. */
export const FAMILY_GUIDES_TITLE = 'Guides';

/** Anchor of a family's section on the `/docs` home. */
export const familyAnchor = (family: string): string => `family-${family}`;

/**
 * A component in the sidebar: a single-page component is a plain link
 * (`children` empty, `href` its page); a component with several pages is a
 * disclosure whose first child is its overview ("Overview", `href`).
 * `prefixes` are the paths the component owns as a whole (a section that
 * is one component), `pages` every docs page in it.
 */
export type NavComponent = { title: string; href: string; children: NavNode[]; prefixes: string[]; pages: string[] };

/**
 * A family: the sidebar's first level. `href` is its index (`/docs/<section>`
 * for a one-section family, else its section on the `/docs` home).
 */
export type NavFamily = {
  family: string;
  title: string;
  href: string;
  sections: string[];
  components: NavComponent[];
  /** The "Guides" heading over the family-wide pages, if the family has any. */
  guides?: NavNode | undefined;
};

const byTitle = (a: { title: string }, b: { title: string }) => a.title.localeCompare(b.title, 'en', { sensitivity: 'base' });

function collectHrefs(nodes: readonly NavNode[], into: string[] = []): string[] {
  for (const node of nodes) {
    if (node.href) into.push(node.href);
    collectHrefs(node.children, into);
  }
  return into;
}

/** Sidebar nodes of one component's docs groups (see `NavNode`). */
function groupNodes(indexHref: string, groups: readonly { category: string; docs: DocPage[] }[]): NavNode[] {
  const leaf = (doc: DocPage): NavNode => ({ title: doc.title, href: docHref(doc), children: [] });
  // A component with a single group has no group level.
  if (groups.length === 1) return groups[0]!.docs.map(leaf);
  return groups.map(({ category, docs }) => {
    const [first, ...rest] = docs;
    if (first && isLeadDoc(first)) return { ...leaf(first), children: rest.map(leaf) };
    return { title: category, anchor: `${indexHref}#${categoryAnchor(category)}`, children: docs.map(leaf) };
  });
}

const single = (doc: DocPage): NavComponent => ({ title: doc.title, href: docHref(doc), children: [], prefixes: [], pages: [docHref(doc)] });

/** Components and family-wide pages of one docs section. */
function sectionComponents(section: string, docs: readonly DocPage[]): { components: NavComponent[]; guides: DocPage[] } {
  const index = `/docs/${section}`;
  const whole = SECTION_COMPONENTS[section];
  if (whole) {
    const children: NavNode[] = [{ title: 'Overview', href: index, children: [] }, ...groupNodes(index, groupDocs(docs))];
    return { components: [{ title: whole, href: index, children, prefixes: [index, `${DEMOS_PATH}/${section}`], pages: collectHrefs(children) }], guides: [] };
  }
  const bySlug = new Map(docs.map((doc) => [doc.slug, doc]));
  const used = new Set<string>();
  const components: NavComponent[] = [];
  for (const [title, slugs] of Object.entries(COMPONENT_PAGES[section] ?? {})) {
    const pages = slugs.flatMap((slug) => bySlug.get(slug) ?? []);
    pages.forEach((doc) => used.add(doc.slug));
    const [overview, ...rest] = pages;
    if (!overview) continue;
    if (rest.length === 0) {
      components.push(single(overview));
      continue;
    }
    const children: NavNode[] = [{ title: 'Overview', href: docHref(overview), children: [] }, ...rest.map((doc) => ({ title: doc.title, href: docHref(doc), children: [] }))];
    components.push({ title, href: docHref(overview), children, prefixes: [], pages: collectHrefs(children) });
  }
  const guideSlugs = new Set(FAMILY_GUIDES[section] ?? []);
  const guides: DocPage[] = [];
  for (const doc of docs) {
    if (used.has(doc.slug)) continue;
    if (guideSlugs.has(doc.slug)) guides.push(doc);
    else components.push(single(doc));
  }
  return { components, guides };
}

/**
 * The sidebar's tree: families in
 * title order, each with its components in title order, then its
 * family-wide pages under "Guides". The breadcrumbs (`getDocsTrail`),
 * previous/next (`getPrevNext`), the `/docs` home and the landing page all
 * read this tree, so they cannot drift.
 */
export function getDocsNavTree(): NavFamily[] {
  const sections = [{ section: 'data-grid', docs: getDocs() }, ...getSections()];
  const families = new Map<string, NavFamily>();
  for (const { section, docs } of sections) {
    const family = SECTION_FAMILY[section] ?? section;
    const entry = families.get(family) ?? { family, title: FAMILY_TITLES[family] ?? sectionTitle(family), href: '', sections: [], components: [] };
    entry.sections.push(section);
    const { components, guides } = sectionComponents(section, docs);
    entry.components.push(...components);
    if (guides.length > 0) {
      const heading = entry.guides ?? { title: FAMILY_GUIDES_TITLE, anchor: `/docs/${section}`, children: [] };
      heading.children.push(...guides.map((doc) => ({ title: doc.title, href: docHref(doc), children: [] })));
      entry.guides = heading;
    }
    families.set(family, entry);
  }
  return [...families.values()]
    .map((family) => ({
      ...family,
      href: family.sections.length === 1 ? `/docs/${family.sections[0]}` : `/docs#${familyAnchor(family.family)}`,
      components: family.components.sort(byTitle),
    }))
    .sort(byTitle);
}

/**
 * One breadcrumb. `plain` marks a heading (a docs group or "Guides"): shown
 * as text like its sidebar heading, while `href` still gives the
 * structured-data breadcrumb a URL.
 */
export type TrailCrumb = { title: string; href?: string; plain?: boolean };

/**
 * Breadcrumb trail of a docs page, its ancestry in `getDocsNavTree()`:
 * Docs / Family / Component / [group /] page. A component's overview ends
 * the trail at the component, a family index at the family, and a crumb
 * whose label equals the next one is dropped (Pivot Table / Pivot Table /
 * Layouts reads Pivot Table / Layouts).
 */
export function getDocsTrail(href: string): TrailCrumb[] {
  const find = (nodes: readonly NavNode[], trail: NavNode[]): NavNode[] | undefined => {
    for (const node of nodes) {
      if (node.href === href) return [...trail, node];
      const found = find(node.children, [...trail, node]);
      if (found) return found;
    }
    return undefined;
  };
  const docs: TrailCrumb = { title: 'Docs', href: '/docs' };
  const crumbOf = (node: NavNode, fallback: string): TrailCrumb =>
    node.href ? { title: node.title, href: node.href } : { title: node.title, href: node.anchor ?? fallback, plain: true };
  const dedupe = (crumbs: TrailCrumb[]) => crumbs.filter((crumb, i) => crumbs[i + 1]?.title.toLowerCase() !== crumb.title.toLowerCase());
  for (const family of getDocsNavTree()) {
    if (family.href === href) return [docs, { title: family.title }];
    const head: TrailCrumb = { title: family.title, href: family.href };
    for (const component of family.components) {
      if (component.href === href) return dedupe([docs, head, { title: component.title }]);
      const path = find(component.children, []);
      if (!path) continue;
      const ancestors = path.slice(0, -1).map((node) => crumbOf(node, component.href));
      return dedupe([docs, head, { title: component.title, href: component.href }, ...ancestors, { title: path[path.length - 1]!.title }]);
    }
    const path = family.guides ? find([family.guides], []) : undefined;
    if (path) return dedupe([docs, head, ...path.slice(0, -1).map((node) => crumbOf(node, family.href)), { title: path[path.length - 1]!.title }]);
  }
  return [docs];
}

/**
 * Sidebar groups after the families, rendered by `DocsNav` as data: the
 * API reference (one item per package, linking its root entry, or its
 * section of the reference index when it has none: subpath entry pages are
 * document-only and never linked through client navigation), then the
 * project pages.
 */
export function getDocsNavGroups(): NavGroup[] {
  return [
    {
      title: 'API reference',
      items: getApiReference().packages.map((pkg) => ({ title: pkg.name, href: packageIndexHref(pkg) })),
    },
    {
      title: 'Project',
      items: [
        { title: 'All demos', href: DEMOS_PATH },
      ],
    },
  ];
}

// --- Families on the landing page and the docs home ---

/**
 * One-line summary of each family for the landing page cards. A family
 * without a line falls back to its component names, so a new family still
 * gets a card without editing this map.
 */
const FAMILY_SUMMARIES: Readonly<Record<string, string>> = {
  grids: 'The Data Grid, virtualized from 10 rows to 1,000,000 with sorting, filtering, grouping, editing, tree rows and export, and the Pivot Table with its engine, field list and pivot chart.',
  buttons: 'Button, ToggleButton, ButtonGroup, split, menu and progress buttons, floating actions, Chips and TagGroup.',
  calendars: 'Calendar, date, time and range pickers and fields, plus the Scheduler, the Gantt chart and a RecurrenceEditor.',
  chat: 'Conversation UI and AI assistants over provider-agnostic adapters: inline assist, smart paste and text suggestions.',
  'data-visualization': 'Charts, stock charts and sparklines, gauges, maps, heat and tree maps, diagrams, Kanban and barcodes.',
  dropdowns: 'Select, Combobox, AutoComplete, Mention, Listbox and TreeSelect, with search, grouping and remote data.',
  editors: 'Rich text, Markdown and block editors, an image editor, a PDF viewer and document editor integrations.',
  inputs: 'Text, number, masked and one-time-code fields, checkboxes, sliders, color picker, file upload, forms and QueryBuilder.',
  layout: 'Dialog, Popover, Tooltip, Card, List, Avatar, Splitter, Timeline and Dashboard Layout.',
  navigation: 'Menus, Tabs, Toolbar, Tree View, Accordion, Breadcrumbs, Stepper, Pager, Sidebar and Carousel.',
  notifications: 'Toast, Message, Badge, Spinner, Skeleton, Progress and Meter.',
};

export type ComponentFamily = {
  family: string;
  title: string;
  summary: string;
  /** The family's index (see `NavFamily.href`). */
  href: string;
  components: { title: string; href: string }[];
  /** Docs index and demo browser of each section of the family (Grids has two). */
  sections: { section: string; title: string; docsHref: string; demosHref: string }[];
  docCount: number;
  demoCount: number;
};

/**
 * Every component family in the sidebar's order (by title) with its
 * components, read from the catalog: the cards of the landing page and the
 * `/docs` home. Counts on the site are of components (`countComponents`).
 */
export function getComponentFamilies(): ComponentFamily[] {
  const demos = getDemos();
  const sectionDocs = new Map([['data-grid', getDocs().length], ...getSections().map((s): [string, number] => [s.section, s.docs.length])]);
  return getDocsNavTree().map((family) => ({
    family: family.family,
    title: family.title,
    summary: FAMILY_SUMMARIES[family.family] ?? `${family.components.map((c) => c.title).join(', ')}.`,
    href: family.href,
    components: family.components.map(({ title, href }) => ({ title, href })),
    sections: family.sections.map((section) => ({
      section,
      title: SECTION_COMPONENTS[section] ?? sectionTitle(section),
      docsHref: `/docs/${section}`,
      demosHref: `${DEMOS_PATH}/${section}`,
    })),
    docCount: family.sections.reduce((sum, section) => sum + (sectionDocs.get(section) ?? 0), 0),
    demoCount: demos.filter((demo) => family.sections.includes(demo.category ?? 'data-grid')).length,
  }));
}

/** Number of components across the families (the sidebar's second level). */
export const countComponents = (families: readonly { components: readonly unknown[] }[]): number => families.reduce((sum, family) => sum + family.components.length, 0);

// --- Docs pages ---------------------------------------------------------------

export type DocSegment = { kind: 'html'; html: string } | { kind: 'demo'; id: string };
export type RenderedDoc = { segments: DocSegment[]; toc: TocEntry[] };

/**
 * Splits a docs body at `<!-- demo: <id> -->` marker lines and renders the
 * Markdown between them with one shared slugger, so heading ids are unique
 * across the page and the TOC lists them in order. Demos listed in the
 * frontmatter but not placed by a marker are appended at the end.
 */
export function renderDoc(doc: DocPage): RenderedDoc {
  const segments: DocSegment[] = [];
  const toc: TocEntry[] = [];
  const slugger = createSlugger();
  const placed = new Set<string>();
  const parts = doc.body.split(/^<!--\s*demo:\s*([a-z0-9-]+)\s*-->\s*$/m);
  parts.forEach((part, index) => {
    if (index % 2 === 1) {
      segments.push({ kind: 'demo', id: part });
      placed.add(part);
    } else if (part.trim() !== '') {
      const rendered = renderMarkdown(part, { slugger });
      segments.push({ kind: 'html', html: rendered.html });
      toc.push(...rendered.toc);
    }
  });
  for (const id of doc.demos) if (!placed.has(id)) segments.push({ kind: 'demo', id });
  return { segments, toc };
}

export type PageLink = { title: string; href: string };

/**
 * Previous and next docs pages in sidebar order (`getDocsNavTree()` depth
 * first, headings skipped): the pages of the current component, or, for a
 * single-page component or a family-wide page, the family's single-page
 * components and family-wide pages. They never cross into another
 * component or family; pages outside the tree get none.
 */
export function getPrevNext(href: string): { prev?: PageLink | undefined; next?: PageLink | undefined } {
  const linksOf = (nodes: readonly NavNode[], into: PageLink[] = []): PageLink[] => {
    for (const node of nodes) {
      if (node.href) into.push({ title: node.title, href: node.href });
      linksOf(node.children, into);
    }
    return into;
  };
  for (const family of getDocsNavTree()) {
    const component = family.components.find((c) => c.children.length > 0 && c.pages.includes(href));
    const links = component
      ? linksOf(component.children)
      : [...family.components.filter((c) => c.children.length === 0).map(({ title, href }) => ({ title, href })), ...linksOf(family.guides?.children ?? [])];
    const index = links.findIndex((link) => link.href === href);
    if (index >= 0) return { prev: links[index - 1], next: links[index + 1] };
  }
  return {};
}

// --- Demos ----------------------------------------------------------------------

export type DemoGroup = { category: string; demos: DemoMeta[] };

/** Demos grouped by the category of the docs page that embeds them, in catalog order. */
export function getDemoGroups(section = 'data-grid'): DemoGroup[] {
  const demos = new Map(getDemos().filter((demo) => demo.category === section).map((demo) => [demo.id, demo]));
  const groups = new Map<string, DemoMeta[]>();
  const seen = new Set<string>();
  for (const doc of section === 'data-grid' ? getDocs() : (getSection(section)?.docs ?? [])) {
    for (const id of doc.demos) {
      const demo = demos.get(id);
      if (!demo || seen.has(id)) continue;
      seen.add(id);
      const list = groups.get(doc.category) ?? [];
      list.push(demo);
      groups.set(doc.category, list);
    }
  }
  const rest = [...demos.values()].filter((demo) => !seen.has(demo.id));
  if (rest.length > 0) groups.set('Other', rest);
  return [...groups].map(([category, list]) => ({ category, demos: list }));
}

export type DemoSourceFile = { name: string; code: string };

/** `Demo.tsx` first, then its `*.ts(x)` siblings, read at build time. */
export function getDemoSource(demo: DemoMeta): DemoSourceFile[] {
  if (!existsSync(demo.folder)) return [];
  const names = readdirSync(demo.folder)
    .filter((name) => /\.tsx?$/.test(name))
    .sort((a, b) => (a === 'Demo.tsx' ? -1 : b === 'Demo.tsx' ? 1 : a.localeCompare(b)));
  return names.map((name) => ({ name, code: readFileSync(join(demo.folder, name), 'utf8') }));
}

export type DemoNotes = { html: string };

/** The rendered body of `demo.md`. */
export function getDemoNotes(demo: DemoMeta): DemoNotes {
  const metaPath = join(demo.folder, 'demo.md');
  const body = existsSync(metaPath) ? parseFrontmatter(readFileSync(metaPath, 'utf8')).body : '';
  return { html: body.trim() === '' ? '' : renderMarkdown(body, { sourceDir: `docs/site/demos/${demo.id}` }).html };
}
