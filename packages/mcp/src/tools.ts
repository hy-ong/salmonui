// The MCP tools: definitions (name, description, JSON Schema) and their
// implementations over the index. Every tool is read-only and offline.
import type { IndexDemo, IndexDoc, IndexFamily, IndexMember, IndexPackage, IndexSymbol, McpIndex } from './data.js';
import { checkImports, editDistance, ExportsMap } from './imports.js';
import { Bm25, tokenize, type SearchField } from './search.js';

export interface ToolDefinition {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly inputSchema: Readonly<Record<string, unknown>>;
  readonly annotations: Readonly<Record<string, unknown>>;
}

export interface ToolResult {
  readonly content: readonly { readonly type: 'text'; readonly text: string }[];
  readonly isError?: boolean;
}

/** Thrown for arguments that fail the tool's input schema; reported as a tool execution error. */
export class ToolInputError extends Error {}

const READ_ONLY = Object.freeze({ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });

export const TOOLS: readonly ToolDefinition[] = Object.freeze([
  {
    name: 'list_components',
    title: 'List Salmon UI components',
    description:
      'List every Salmon UI package and component family with its import specifier, stylesheet and a one-line description. Call this first to find which package and entry a component lives in. Optionally filter by a package name or a word.',
    inputSchema: {
      type: 'object',
      properties: {
        filter: { type: 'string', description: 'Optional package name (`@salmonui/inputs`) or word (`date`, `chart`) to narrow the list.' },
      },
      additionalProperties: false,
    },
    annotations: READ_ONLY,
  },
  {
    name: 'search_docs',
    title: 'Search the Salmon UI docs',
    description:
      'Keyword search over the Salmon UI documentation pages (guides and component pages, with code samples). Returns the best pages with their URL and the best matching sections in Markdown. Use it for how-to questions (theming, SSR, data sources, editing, accessibility).',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', minLength: 1, description: 'Keywords, e.g. "data grid inline editing validation" or "dark mode theme seeds".' },
        limit: { type: 'integer', minimum: 1, maximum: 10, default: 3, description: 'Number of pages to return (default 3).' },
      },
      required: ['query'],
      additionalProperties: false,
    },
    annotations: READ_ONLY,
  },
  {
    name: 'get_component',
    title: 'Get a component API',
    description:
      'Get the API of a Salmon UI component, hook, function, type or whole family: the import line, the stylesheet, props or parameters with types, defaults and one-line docs, events (on* callbacks), and links to the docs. Accepts a symbol name (`DataGrid`, `useToast`, `ColumnDef`), a family (`date-picker`) or an import specifier (`@salmonui/buttons/menu`).',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', minLength: 1, description: 'Component, hook, type or family name, or an import specifier.' },
      },
      required: ['name'],
      additionalProperties: false,
    },
    annotations: READ_ONLY,
  },
  {
    name: 'get_example',
    title: 'Get a demo source',
    description:
      'Get the full, working source (a React `Demo.tsx`) of a Salmon UI docs demo with its description. Pass a demo `id` when you know it, or a `query` (e.g. "grid grouping aggregates", "toast with action") to get the best match plus other candidates.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', minLength: 1, description: 'Demo id, e.g. `accordion-basics`.' },
        query: { type: 'string', minLength: 1, description: 'Keywords to find a demo when the id is unknown.' },
      },
      additionalProperties: false,
    },
    annotations: READ_ONLY,
  },
  {
    name: 'check_imports',
    title: 'Check Salmon UI imports',
    description:
      'Validate the `@salmonui/*` imports of a JS/TS module: every specifier must be a public entry, every named import must be exported by it, `/internal/*` modules and removed packages (`@salmonui/react`, `@salmonui/data-grid-core`, `@salmonui/data-grid-export`) are flagged with their replacement, and missing stylesheets (`@salmonui/core/styles.css`, the family `styles.css`) are reported. Run it on code you wrote before finishing.',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Module source (imports are enough).' },
        stylesheets: { type: 'boolean', default: true, description: 'Report missing stylesheets (set false for a file that is not the place styles are imported).' },
      },
      required: ['code'],
      additionalProperties: false,
    },
    annotations: READ_ONLY,
  },
] satisfies ToolDefinition[]);

/** Validates arguments against a tool's (flat) input schema. Throws ToolInputError. */
export function validateArguments(tool: ToolDefinition, args: Readonly<Record<string, unknown>>): void {
  const schema = tool.inputSchema as { properties?: Record<string, { type?: string; minLength?: number; minimum?: number; maximum?: number }>; required?: string[]; additionalProperties?: boolean };
  const props = schema.properties ?? {};
  for (const key of schema.required ?? []) {
    if (args[key] === undefined) throw new ToolInputError(`Missing required argument \`${key}\`.`);
  }
  for (const [key, value] of Object.entries(args)) {
    const prop = props[key];
    if (!prop) {
      if (schema.additionalProperties === false) throw new ToolInputError(`Unknown argument \`${key}\`. Allowed: ${Object.keys(props).map((k) => `\`${k}\``).join(', ') || 'none'}.`);
      continue;
    }
    if (value === undefined) continue;
    const type = prop.type;
    const ok =
      type === 'string' ? typeof value === 'string' : type === 'integer' ? Number.isInteger(value) : type === 'boolean' ? typeof value === 'boolean' : type === 'number' ? typeof value === 'number' : true;
    if (!ok) throw new ToolInputError(`Argument \`${key}\` must be a${type === 'integer' ? 'n' : ''} ${type}.`);
    if (typeof value === 'string' && prop.minLength !== undefined && value.trim().length < prop.minLength) throw new ToolInputError(`Argument \`${key}\` must not be empty.`);
    if (typeof value === 'number' && ((prop.minimum !== undefined && value < prop.minimum) || (prop.maximum !== undefined && value > prop.maximum))) {
      throw new ToolInputError(`Argument \`${key}\` must be between ${prop.minimum} and ${prop.maximum}.`);
    }
  }
}

/** Maximum characters of one tool result; longer output is cut with a note. */
export const MAX_OUTPUT = 60_000;

const text = (value: string): ToolResult => ({
  content: [{ type: 'text', text: value.length > MAX_OUTPUT ? `${value.slice(0, MAX_OUTPUT)}\n\n[Output truncated at ${MAX_OUTPUT} characters. Ask for a narrower name, e.g. one component or the props type.]` : value }],
});

const code = (value: string) => `\`${value}\``;

/** The tools bound to one index; lookup structures are built lazily, once. */
export class SalmonTools {
  readonly index: McpIndex;
  readonly map: ExportsMap;
  #symbolsByName?: Map<string, IndexSymbol[]>;
  #docsSearch?: { bm25: Bm25; refs: { doc: IndexDoc; section: number }[] };
  #demoSearch?: Bm25;

  constructor(index: McpIndex) {
    this.index = index;
    this.map = new ExportsMap(index);
  }

  call(name: string, args: Readonly<Record<string, unknown>>): ToolResult {
    switch (name) {
      case 'list_components':
        return this.listComponents(args['filter'] as string | undefined);
      case 'search_docs':
        return this.searchDocs(args['query'] as string, (args['limit'] as number | undefined) ?? 3);
      case 'get_component':
        return this.getComponent(args['name'] as string);
      case 'get_example':
        return this.getExample(args['id'] as string | undefined, args['query'] as string | undefined);
      case 'check_imports':
        return this.checkImports(args['code'] as string, args['stylesheets'] as boolean | undefined);
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  url(path: string): string {
    return `${this.index.siteUrl}${path}`;
  }

  get symbolsByName(): Map<string, IndexSymbol[]> {
    if (!this.#symbolsByName) {
      const map = new Map<string, IndexSymbol[]>();
      for (const symbol of this.index.symbols) map.set(symbol.name, [...(map.get(symbol.name) ?? []), symbol]);
      this.#symbolsByName = map;
    }
    return this.#symbolsByName;
  }

  // --- list_components -----------------------------------------------------

  listComponents(filter?: string): ToolResult {
    const needle = filter?.trim().toLowerCase() ?? '';
    const lines: string[] = [
      `# Salmon UI ${this.index.version} packages`,
      '',
      'Import `@salmonui/core/styles.css` once (the theme), then the stylesheet of each family you use; it carries the rules of every family it renders, except the `plus` stylesheets listed below. All `@salmonui/*` packages of an app must have the same version.',
      '',
    ];
    let shown = 0;
    for (const pkg of this.index.packages) {
      const pkgHit = needle === '' || pkg.name.toLowerCase().includes(needle) || pkg.description.toLowerCase().includes(needle);
      const families = pkg.families.filter((f) => pkgHit || matchesFamily(f, needle));
      if (!pkgHit && families.length === 0) continue;
      shown += 1;
      lines.push(`## ${pkg.name}`, pkg.description, '');
      for (const family of families) {
        const extras = family.subpaths.length ? ` (also ${family.subpaths.map(code).join(', ')})` : '';
        lines.push(`- ${code(family.specifier)}${extras}: ${family.summary || family.components.join(', ')}`);
        const parts = [family.components.length ? `components ${family.components.join(', ')}` : '', family.hooks.length ? `hooks ${family.hooks.join(', ')}` : '', family.stylesheet ? `css ${code(family.stylesheet)}` : 'no stylesheet', ...(family.alsoImport ?? []).map((x) => `plus ${code(x.stylesheet)}${x.when ? ` ${x.when}` : ''}`)].filter(Boolean);
        lines.push(`  ${parts.join('; ')}`);
      }
      if (pkg.entries.length) lines.push(`- Entries: ${pkg.entries.map(code).join(', ')}`);
      if (pkg.stylesheet && pkg.families.length > 1) lines.push(`- All families' styles: ${code(pkg.stylesheet)}`);
      lines.push('');
    }
    if (shown === 0) return text(`No package or family matches "${filter}". Call list_components without a filter to see all.`);
    return text(lines.join('\n').trimEnd());
  }

  // --- search_docs -----------------------------------------------------------

  get docsSearch(): { bm25: Bm25; refs: { doc: IndexDoc; section: number }[] } {
    if (!this.#docsSearch) {
      const refs: { doc: IndexDoc; section: number }[] = [];
      const documents: SearchField[][] = [];
      for (const doc of this.index.docs) {
        doc.sections.forEach((section, i) => {
          refs.push({ doc, section: i });
          documents.push([
            { text: `${doc.title} ${doc.section} ${i === 0 ? doc.description : ''}`, weight: 2 },
            { text: section.heading, weight: 3 },
            { text: section.text, weight: 1 },
          ]);
        });
      }
      this.#docsSearch = { bm25: new Bm25(documents), refs };
    }
    return this.#docsSearch;
  }

  /** Pages for a query: per page, the best section scores, best first. */
  rankDocs(query: string): { doc: IndexDoc; score: number; sections: { index: number; score: number }[] }[] {
    const { bm25, refs } = this.docsSearch;
    const pages = new Map<IndexDoc, { index: number; score: number }[]>();
    for (const hit of bm25.search(query)) {
      const ref = refs[hit.ref]!;
      pages.set(ref.doc, [...(pages.get(ref.doc) ?? []), { index: ref.section, score: hit.score }]);
    }
    const terms = new Set(tokenize(query));
    return [...pages]
      .map(([doc, sections]) => {
        const titleTerms = tokenize(doc.title);
        const titleBonus = titleTerms.length && titleTerms.every((t) => terms.has(t)) ? 2 : 0;
        const score = sections[0]!.score + 0.25 * sections.slice(1, 4).reduce((sum, s) => sum + s.score, 0) + titleBonus;
        return { doc, score, sections };
      })
      .sort((a, b) => b.score - a.score || a.doc.path.localeCompare(b.doc.path));
  }

  searchDocs(query: string, limit: number): ToolResult {
    const ranked = this.rankDocs(query).slice(0, limit);
    if (ranked.length === 0) return text(`No docs page matches "${query}". Try other keywords, or list_components / get_component for API questions.`);
    const out: string[] = [];
    for (const { doc, sections } of ranked) {
      out.push(`# ${doc.title}`, `${this.url(doc.path)}`, doc.description, '');
      for (const { index } of sections.slice(0, 2)) {
        const section = doc.sections[index]!;
        const anchor = section.anchor ? `#${section.anchor}` : '';
        if (index > 0) out.push(`## ${section.heading} (${this.url(doc.path + anchor)})`);
        out.push(clip(section.text, 2500), '');
      }
      out.push('---', '');
    }
    return text(out.join('\n').replace(/\n---\n\n$/, '\n').trimEnd());
  }

  // --- get_component -------------------------------------------------------

  /** Docs pages that name a symbol in code, most mentions first. */
  docsMentioning(name: string, max = 3): IndexDoc[] {
    const pattern = new RegExp(`[\`<{\\s(,]${name.replace(/[$]/g, '\\$')}\\b`, 'g');
    return this.index.docs
      .map((doc) => ({ doc, count: doc.sections.reduce((n, s) => n + (s.text.match(pattern)?.length ?? 0), 0) + (doc.title === name ? 50 : 0) }))
      .filter((x) => x.count > 0)
      .sort((a, b) => b.count - a.count || a.doc.path.localeCompare(b.doc.path))
      .slice(0, max)
      .map((x) => x.doc);
  }

  referenceUrl(specifier: string): string {
    const pkg = ExportsMap.packageName(specifier);
    const slug = pkg.replace(/^@[^/]+\//, '');
    const sub = specifier.slice(pkg.length).replace(/^\//, '').replaceAll('/', '-');
    return this.url(`/docs/reference/${slug}${sub ? `/${sub}` : ''}`);
  }

  stylesheetLines(specifier: string): string[] {
    const pkgName = ExportsMap.packageName(specifier);
    const pkg = this.map.packages.get(pkgName);
    const fam = this.map.familyOf.get(specifier);
    const lines: string[] = [];
    if (pkg?.react === 'required') lines.push("import '@salmonui/core/styles.css'; // once, in the app root");
    const also = fam?.family.alsoImport ?? [];
    for (const x of also) if (x.when === null) lines.push(`import '${x.stylesheet}'; // not carried by the family stylesheet`);
    if (fam?.family.stylesheet) lines.push(`import '${fam.family.stylesheet}';`);
    for (const x of also) if (x.when !== null) lines.push(`import '${x.stylesheet}'; // ${x.when.replace(/`/g, '')}`);
    return lines;
  }

  getComponent(rawName: string): ToolResult {
    const name = rawName.trim();
    const symbolText = (symbols: readonly IndexSymbol[]) => text(symbols.map((s) => this.describeSymbol(s)).join('\n\n---\n\n'));
    const familyText = (fam: { pkg: IndexPackage; family: IndexFamily }) => text(this.describeFamily(fam.pkg, fam.family));
    // Order: an import specifier, an exact symbol name, a family slug, a symbol in another case.
    const bySpecifier = this.map.familyOf.get(name);
    if (bySpecifier) return familyText(bySpecifier);
    const exact = this.symbolsByName.get(name);
    if (exact) return symbolText(exact);
    const bySlug = this.map.families.get(name.toLowerCase());
    if (bySlug) return familyText(bySlug);
    const lower = name.toLowerCase();
    const ci = [...this.symbolsByName.keys()].filter((k) => k.toLowerCase() === lower);
    if (ci.length > 0) return symbolText(ci.flatMap((k) => this.symbolsByName.get(k) ?? []));
    const byKebab = this.map.families.get(kebab(name));
    if (byKebab) return familyText(byKebab);
    const entry = this.map.entries.get(name);
    if (entry?.kind === 'js') {
      return text([`# ${name}`, '', `Exports: ${(entry.names ?? []).map(code).join(', ')}`, '', `Reference: ${this.referenceUrl(name)}`].join('\n'));
    }
    const suggestions = this.suggestNames(name);
    return {
      content: [{ type: 'text', text: `No component, hook, type or family named "${name}".${suggestions.length ? ` Closest: ${suggestions.map(code).join(', ')}.` : ''} Use list_components to browse, or search_docs.` }],
      isError: true,
    };
  }

  suggestNames(name: string, max = 8): string[] {
    const lower = name.toLowerCase();
    const names = [...this.symbolsByName.keys(), ...this.map.families.keys()];
    const contains = names.filter((n) => n.toLowerCase().includes(lower) || (lower.length > 3 && lower.includes(n.toLowerCase()) && n.length > 3));
    const ranked = contains.length ? contains.sort((a, b) => a.length - b.length || a.localeCompare(b)) : names.map((n) => ({ n, d: Math.abs(n.length - lower.length) > 2 ? 3 : editDistance(n.toLowerCase(), lower) })).filter((x) => x.d <= 2).sort((a, b) => a.d - b.d).map((x) => x.n);
    return [...new Set(ranked)].slice(0, max);
  }

  describeFamily(pkg: IndexPackage, family: IndexFamily): string {
    const lines = [`# ${family.specifier} (family \`${family.name}\` of ${pkg.name})`, '', family.summary, ''];
    const values = [...family.components, ...family.hooks];
    lines.push('```tsx', ...this.stylesheetLines(family.specifier), `import { ${values.slice(0, 6).join(', ')}${values.length > 6 ? ', ...' : ''} } from '${family.specifier}';`, '```', '');
    if (family.subpaths.length) lines.push(`More entries: ${family.subpaths.map(code).join(', ')}`, '');
    const entry = this.map.entries.get(family.specifier);
    const own = (entry?.names ?? []).map((n) => this.symbolsByName.get(n)?.find((s) => s.specifiers.includes(family.specifier))).filter((s): s is IndexSymbol => s !== undefined);
    const group = (kinds: string[], title: string) => {
      const list = own.filter((s) => kinds.includes(s.kind) || (title === 'Hooks' && s.kind === 'function' && /^use[A-Z]/.test(s.name)));
      const filtered = title === 'Functions' ? list.filter((s) => !/^use[A-Z]/.test(s.name)) : list;
      if (filtered.length === 0) return;
      lines.push(`## ${title}`);
      for (const s of filtered) lines.push(`- ${code(s.name)}: ${s.summary || s.kind}`);
      lines.push('');
    };
    group(['component'], 'Components');
    group([], 'Hooks');
    group(['function', 'class', 'const', 'enum'], 'Functions');
    const types = own.filter((s) => s.kind === 'interface' || s.kind === 'type');
    if (types.length) lines.push('## Types', types.map((s) => code(s.name)).join(', '), '');
    // The family's main component (its name in PascalCase) in full.
    const main = own.find((s) => s.kind === 'component' && kebab(s.name) === family.name) ?? own.find((s) => s.kind === 'component');
    if (main) lines.push(this.describeSymbol(main, { header: '##' }), '');
    lines.push('## Docs', ...family.docs.map((p) => `- ${this.url(p)}`), `- API reference: ${this.referenceUrl(family.specifier)}`);
    return lines.join('\n').trimEnd();
  }

  describeSymbol(symbol: IndexSymbol, { header = '#' }: { header?: string } = {}): string {
    const home = symbol.specifiers[0] ?? '';
    const isType = symbol.kind === 'interface' || symbol.kind === 'type';
    const lines = [`${header} ${symbol.name} (${symbol.kind})`, ''];
    if (symbol.deprecated !== undefined) lines.push(`**Deprecated**${symbol.deprecated ? `: ${symbol.deprecated}` : ''}`, '');
    lines.push(symbol.docs || symbol.summary || '', '');
    lines.push('```tsx');
    if (symbol.kind === 'component') lines.push(...this.stylesheetLines(home));
    lines.push(`import ${isType ? 'type ' : ''}{ ${symbol.name} } from '${home}';`, '```');
    if (symbol.specifiers.length > 1) lines.push(`Also exported by ${symbol.specifiers.slice(1).map(code).join(', ')}.`);
    lines.push('');
    if (symbol.signature) lines.push('```ts', symbol.signature, '```', '');
    if (symbol.params?.length) {
      lines.push('Parameters:', ...symbol.params.map((p) => `- ${code(p.name)}: ${p.text}`), '');
    }
    if (symbol.returns) lines.push(`Returns: ${symbol.returns}`, '');
    let members = symbol.members;
    let membersOf = symbol.name;
    if (!members && (symbol.kind === 'component' || symbol.kind === 'type')) {
      const resolved = this.propsOf(symbol);
      if (resolved) {
        members = resolved.members;
        membersOf = resolved.from;
        if (resolved.alias) lines.push('```ts', resolved.alias, '```', '');
      }
    }
    if (members?.length) {
      const events = members.filter((m) => /^on[A-Z]/.test(m.name));
      const rest = members.filter((m) => !/^on[A-Z]/.test(m.name));
      const fmt = (m: NonNullable<IndexSymbol['members']>[number]) =>
        `- ${code(`${m.name}${m.optional ? '?' : ''}: ${m.type}`)}${m.default !== undefined ? ` (default ${code(m.default)})` : ''}${m.deprecated !== undefined ? ' **deprecated**' : ''}${m.summary ? `: ${m.summary}` : ''}`;
      const noun = symbol.kind === 'component' || membersOf.endsWith('Props') ? 'Props' : 'Members';
      if (rest.length) lines.push(`${header}# ${noun} (${membersOf})`, ...rest.map(fmt), '');
      if (events.length) lines.push(`${header}# Events`, ...events.map(fmt), '');
    }
    if (symbol.kind === 'function' && /^use[A-Z]/.test(symbol.name)) {
      // A hook's result object, e.g. `useToast(): ToastQueue`.
      const ret = /\):\s*([A-Z][\w$]*)(?:<[^;]*>)?;?\s*$/.exec(symbol.signature)?.[1];
      const target = ret ? this.symbolsByName.get(ret)?.find((s) => s.members?.length) : undefined;
      if (target?.members) {
        lines.push(`${header}# Returns (${target.name})`, ...target.members.map((m) => `- ${code(`${m.name}${m.optional ? '?' : ''}: ${m.type}`)}${m.summary ? `: ${m.summary}` : ''}`), '');
      }
    }
    if (header === '#') {
      const docs = this.docsMentioning(symbol.name);
      lines.push(`${header}# Docs`, ...docs.map((d) => `- ${d.title}: ${this.url(d.path)}`), `- API reference: ${this.referenceUrl(home)}`);
    }
    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd();
  }

  /**
   * The props of a component (its `props` parameter type, else `<Name>Props`),
   * or the members of a type alias. An alias without members of its own
   * (`type ButtonProps = ButtonBaseProps & (...)`, a union of variants) gets
   * the members of the object types it names, merged by name.
   */
  propsOf(symbol: IndexSymbol): { members: IndexMember[]; from: string; alias?: string } | undefined {
    let start: IndexSymbol | undefined = symbol;
    if (symbol.kind === 'component') {
      const param = /\(\s*\w+\??:\s*([A-Z][\w$]*)/.exec(symbol.signature)?.[1];
      start = (param && this.symbolsByName.get(param)?.[0]) || this.symbolsByName.get(`${symbol.name}Props`)?.[0];
    }
    if (!start) return undefined;
    if (start.members?.length) return { members: [...start.members], from: start.name };
    const merged = new Map<string, IndexMember>();
    const from: string[] = [];
    const seen = new Set<string>([start.name]);
    const visit = (alias: IndexSymbol, depth: number) => {
      for (const [, ref] of alias.signature.matchAll(/\b([A-Z][\w$]*)\b/g)) {
        if (seen.has(ref!)) continue;
        seen.add(ref!);
        const target = this.symbolsByName.get(ref!)?.find((s) => s.kind === 'interface' || s.kind === 'type');
        if (!target) continue;
        if (target.members?.length) {
          from.push(target.name);
          for (const m of target.members) if (!merged.has(m.name)) merged.set(m.name, m);
        } else if (target.kind === 'type' && depth < 2) visit(target, depth + 1);
      }
    };
    visit(start, 0);
    if (merged.size === 0) return undefined;
    return { members: [...merged.values()], from: `${start.name}: ${from.join(', ')}`, ...(start !== symbol ? { alias: start.signature } : {}) };
  }

  // --- get_example -----------------------------------------------------------

  get demoSearch(): Bm25 {
    this.#demoSearch ??= new Bm25(
      this.index.demos.map((demo) => [
        { text: `${demo.id} ${demo.title}`, weight: 3 },
        { text: demo.description, weight: 2 },
        { text: `${demo.notes} ${demo.imports.join(' ')} ${demo.category}`, weight: 1 },
        { text: [...new Set(demo.source.match(/<([A-Z][\w.]*)/g) ?? [])].join(' '), weight: 1 },
      ]),
    );
    return this.#demoSearch;
  }

  getExample(id?: string, query?: string): ToolResult {
    if (id === undefined && query === undefined) throw new ToolInputError('Pass `id` (a demo id) or `query` (keywords).');
    const demos = this.index.demos;
    let demo: IndexDemo | undefined = id !== undefined ? demos.find((d) => d.id === id.trim()) : undefined;
    let others: IndexDemo[] = [];
    if (!demo) {
      const hits = this.demoSearch.search(query ?? id ?? '');
      demo = hits[0] ? demos[hits[0].ref] : undefined;
      others = hits.slice(1, 6).map((h) => demos[h.ref]!);
      if (!demo) return { content: [{ type: 'text', text: `No demo matches "${query ?? id}". Try search_docs, or other keywords.` }], isError: true };
    }
    const lines = [
      `# ${demo.title} (demo \`${demo.id}\`)`,
      '',
      demo.description,
      ...(demo.notes ? ['', demo.notes] : []),
      '',
      `Live: ${this.url(demo.path)}`,
      '',
      '```tsx',
      demo.source.trimEnd(),
      '```',
    ];
    if (demo.source.includes("from './") || demo.source.includes("from '../")) {
      lines.push('', 'Relative imports are docs-site fixtures (sample data); replace them with your own data.');
    }
    if (others.length) lines.push('', 'Other matches:', ...others.map((d) => `- \`${d.id}\`: ${d.title}`));
    return text(lines.join('\n'));
  }

  // --- check_imports ---------------------------------------------------------

  checkImports(source: string, stylesheets?: boolean): ToolResult {
    const report = checkImports(source, this.map, { stylesheets: stylesheets !== false });
    if (report.checked === 0) return text('No `@salmonui/*` import found.');
    const errors = report.problems.filter((p) => p.severity === 'error');
    const warnings = report.problems.filter((p) => p.severity === 'warning');
    const lines = [errors.length === 0 && warnings.length === 0 ? `OK: all ${report.checked} \`@salmonui/*\` imports resolve.` : `${errors.length} error(s), ${warnings.length} warning(s) in ${report.checked} \`@salmonui/*\` import(s).`];
    for (const p of report.problems) {
      lines.push('', `- ${p.severity.toUpperCase()}${p.line !== null ? ` line ${p.line}` : ''}${p.specifier ? ` ${code(p.specifier)}` : ''}: ${p.message}`);
      if (p.fix) lines.push(p.fix.includes('\n') || p.fix.startsWith('import') ? `  Fix:\n  \`\`\`ts\n${p.fix.split('\n').map((l) => `  ${l}`).join('\n')}\n  \`\`\`` : `  Fix: ${p.fix}`);
    }
    return text(lines.join('\n'));
  }
}

function matchesFamily(family: IndexFamily, needle: string): boolean {
  return family.name.includes(needle) || family.specifier.includes(needle) || family.summary.toLowerCase().includes(needle) || family.components.some((c) => c.toLowerCase().includes(needle));
}

/** `DatePicker` -> `date-picker`. */
export function kebab(name: string): string {
  return name.replace(/(?<=[a-z0-9])(?=[A-Z])/g, '-').toLowerCase();
}

function clip(value: string, max: number): string {
  if (value.length <= max) return value;
  const cut = value.lastIndexOf('\n\n', max);
  const end = cut > max / 2 ? cut : max;
  // Never leave a code fence open.
  let out = value.slice(0, end);
  if ((out.match(/^```/gm)?.length ?? 0) % 2 === 1) out += '\n```';
  return `${out}\n\n[...]`;
}
