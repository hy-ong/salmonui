// Import statement parsing and validation against the index's exports map
// (the `check_imports` tool). A small scanner blanks comments, then regular
// expressions read the ES module forms; no parser dependency.
import type { IndexEntry, IndexFamily, IndexPackage, McpIndex } from './data.js';

export interface ImportedName {
  /** Exported name (`default` for a default import). */
  readonly imported: string;
  readonly local: string;
  readonly typeOnly: boolean;
}

export interface ParsedImport {
  readonly specifier: string;
  readonly line: number;
  readonly form: 'import' | 'side-effect' | 'export-from' | 'dynamic';
  /** The whole statement is `import type` / `export type`. */
  readonly typeOnly: boolean;
  readonly names: readonly ImportedName[];
  /** `import * as ns` / `export * from`. */
  readonly namespace: boolean;
}

/** Replaces comments with spaces (newlines kept) so line numbers and string contents survive. */
export function blankComments(code: string): string {
  let out = '';
  let i = 0;
  const n = code.length;
  while (i < n) {
    const ch = code[i]!;
    const next = code[i + 1];
    if (ch === '/' && next === '/') {
      while (i < n && code[i] !== '\n') {
        out += ' ';
        i += 1;
      }
    } else if (ch === '/' && next === '*') {
      const end = code.indexOf('*/', i + 2);
      const stop = end === -1 ? n : end + 2;
      out += code.slice(i, stop).replace(/[^\n]/g, ' ');
      i = stop;
    } else if (ch === '"' || ch === "'" || ch === '`') {
      let j = i + 1;
      while (j < n && code[j] !== ch) {
        if (code[j] === '\\') j += 1;
        else if (ch !== '`' && code[j] === '\n') break;
        j += 1;
      }
      out += code.slice(i, j + 1);
      i = j + 1;
    } else {
      out += ch;
      i += 1;
    }
  }
  return out;
}

const lineAt = (code: string, offset: number): number => {
  let line = 1;
  for (let i = 0; i < offset; i++) if (code.charCodeAt(i) === 10) line += 1;
  return line;
};

function parseClause(clause: string, typeOnly: boolean): { names: ImportedName[]; namespace: boolean } {
  const names: ImportedName[] = [];
  let namespace = false;
  const braceOpen = clause.indexOf('{');
  const head = (braceOpen === -1 ? clause : clause.slice(0, braceOpen)).trim().replace(/,$/, '').trim();
  for (const part of head.split(',').map((s) => s.trim()).filter(Boolean)) {
    const ns = /^\*\s*as\s+([\w$]+)$/.exec(part);
    if (ns) namespace = true;
    else if (part === '*') namespace = true;
    else if (/^[\w$]+$/.test(part)) names.push({ imported: 'default', local: part, typeOnly });
  }
  if (braceOpen !== -1) {
    const inner = clause.slice(braceOpen + 1, clause.lastIndexOf('}') === -1 ? undefined : clause.lastIndexOf('}'));
    for (const raw of inner.split(',').map((s) => s.trim()).filter(Boolean)) {
      const m = /^(type\s+)?([\w$]+)(?:\s+as\s+([\w$]+))?$/.exec(raw);
      if (!m) continue;
      names.push({ imported: m[2]!, local: m[3] ?? m[2]!, typeOnly: typeOnly || m[1] !== undefined });
    }
  }
  return { names, namespace };
}

/** Every static, side-effect, re-export and dynamic import of a module source, in source order. */
export function parseImports(source: string): ParsedImport[] {
  const code = blankComments(source);
  const found: (ParsedImport & { offset: number })[] = [];
  const add = (offset: number, item: Omit<ParsedImport, 'line'>) => found.push({ ...item, offset, line: lineAt(code, offset) });
  for (const m of code.matchAll(/\bimport\s+(type\s+)?([\w$\s{},*]+?)\s*from\s*(['"])([^'"\n]+)\3/g)) {
    const typeOnly = m[1] !== undefined;
    add(m.index, { specifier: m[4]!, form: 'import', typeOnly, ...parseClause(m[2]!, typeOnly) });
  }
  for (const m of code.matchAll(/\bimport\s*(['"])([^'"\n]+)\1/g)) {
    add(m.index, { specifier: m[2]!, form: 'side-effect', typeOnly: false, names: [], namespace: false });
  }
  for (const m of code.matchAll(/\bexport\s+(type\s+)?([\w$\s{},*]+?)\s*from\s*(['"])([^'"\n]+)\3/g)) {
    const typeOnly = m[1] !== undefined;
    const clause = m[2]!.trim();
    // `export { a as b }`: the exported side is local here, the imported name is `a`.
    add(m.index, { specifier: m[4]!, form: 'export-from', typeOnly, ...parseClause(clause.startsWith('*') ? clause.replace(/^\*\s*as\s+[\w$]+/, '*') : clause, typeOnly) });
  }
  for (const m of code.matchAll(/\bimport\s*\(\s*(['"])([^'"\n]+)\1\s*\)/g)) {
    add(m.index, { specifier: m[2]!, form: 'dynamic', typeOnly: false, names: [], namespace: true });
  }
  return found.sort((a, b) => a.offset - b.offset).map(({ offset: _offset, ...rest }) => rest);
}

export interface ImportProblem {
  readonly severity: 'error' | 'warning';
  readonly line: number | null;
  readonly specifier: string | null;
  readonly message: string;
  /** Suggested replacement code or specifier. */
  readonly fix?: string;
}

export interface ImportReport {
  readonly imports: readonly ParsedImport[];
  /** `@salmonui/*` imports checked. */
  readonly checked: number;
  readonly problems: readonly ImportProblem[];
}

/** Lookups over the index used by the checker and the tools. */
export class ExportsMap {
  readonly entries = new Map<string, IndexEntry>();
  readonly packages = new Map<string, IndexPackage>();
  readonly families = new Map<string, { pkg: IndexPackage; family: IndexFamily }>();
  /** Family of every family entry and subpath. */
  readonly familyOf = new Map<string, { pkg: IndexPackage; family: IndexFamily }>();
  readonly whereExported = new Map<string, string[]>();

  constructor(index: McpIndex) {
    for (const entry of index.entries) {
      this.entries.set(entry.specifier, entry);
      for (const name of entry.names ?? []) {
        const list = this.whereExported.get(name) ?? [];
        list.push(entry.specifier);
        this.whereExported.set(name, list);
      }
    }
    for (const pkg of index.packages) {
      this.packages.set(pkg.name, pkg);
      for (const family of pkg.families) {
        this.families.set(family.name, { pkg, family });
        for (const spec of [family.specifier, ...family.subpaths]) this.familyOf.set(spec, { pkg, family });
      }
    }
  }

  /** The package name of a specifier (`@salmonui/buttons/button` -> `@salmonui/buttons`). */
  static packageName(specifier: string): string {
    const parts = specifier.split('/');
    return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : (parts[0] ?? specifier);
  }

  /** Entries exporting `name`, home entries (shortest specifier) first. */
  exportersOf(name: string): string[] {
    return [...(this.whereExported.get(name) ?? [])];
  }

  /** Closest existing specifiers by edit distance (at most `max`). */
  closest(specifier: string, max = 3): string[] {
    const scored = [...this.entries.keys()].map((s) => ({ s, d: editDistance(s, specifier) }));
    return scored.filter((x) => x.d <= Math.max(4, Math.floor(specifier.length / 3))).sort((a, b) => a.d - b.d || a.s.localeCompare(b.s)).slice(0, max).map((x) => x.s);
  }
}

/** Levenshtein distance. */
export function editDistance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]!;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]!;
      prev[j] = Math.min(prev[j]! + 1, prev[j - 1]! + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length]!;
}

/** Packages that existed before the per-category split, with what replaced them. */
export const REMOVED_PACKAGES: Readonly<Record<string, string>> = Object.freeze({
  '@salmonui/react': 'per-category packages: each component family is its own entry (`@salmonui/buttons/button`, `@salmonui/data-grid`), the theme is `@salmonui/core/theme`',
  '@salmonui/data-grid-core': '`@salmonui/data-grid/engine` (and `@salmonui/pivot-table/engine` for the pivot engine)',
  '@salmonui/data-grid-export': '`@salmonui/export/xlsx`, `@salmonui/export/pdf`, ... and `@salmonui/data-grid/engine/export-server`',
});

/**
 * The replacement of a specifier of a removed package, or null when there is
 * no single one (`@salmonui/react` root: each name has its own entry).
 */
export function migrateSpecifier(specifier: string, map: ExportsMap): string | null {
  const exists = (s: string) => (map.entries.has(s) ? s : null);
  const sub = (prefix: string) => specifier.slice(prefix.length);
  if (specifier === '@salmonui/react' || specifier.startsWith('@salmonui/react/')) {
    const rest = sub('@salmonui/react');
    if (rest === '' ) return null;
    if (rest === '/styles.css' || rest === '/theme/styles.css') return '@salmonui/core/styles.css';
    if (rest === '/theme') return '@salmonui/core/theme';
    if (rest === '/server') return '@salmonui/core/server';
    if (rest === '/server/visualization') return exists('@salmonui/charts/server');
    const [, famName = '', ...more] = rest.split('/');
    const fam = map.families.get(famName);
    if (!fam) return null;
    const tail = more.join('/');
    if (tail === 'styles.css') return fam.family.stylesheet;
    return tail === '' ? fam.family.specifier : exists(`${fam.family.specifier}/${tail}`);
  }
  if (specifier === '@salmonui/data-grid-core' || specifier.startsWith('@salmonui/data-grid-core/')) {
    const rest = sub('@salmonui/data-grid-core');
    if (rest === '/pivot') return exists('@salmonui/pivot-table/engine');
    if (rest.startsWith('/pivot/')) return exists(`@salmonui/pivot-table/engine/${rest.slice('/pivot/'.length)}`);
    return exists(`@salmonui/data-grid/engine${rest}`);
  }
  if (specifier === '@salmonui/data-grid-export' || specifier.startsWith('@salmonui/data-grid-export/')) {
    const rest = sub('@salmonui/data-grid-export');
    if (rest === '') return null;
    if (rest === '/server') return exists('@salmonui/data-grid/engine/export-server');
    return exists(`@salmonui/export${rest}`);
  }
  return null;
}

const CORE_STYLES = '@salmonui/core/styles.css';

/**
 * Checks every `@salmonui/*` import of a module: the specifier is a public
 * entry, each named import is exported by it, no private `/internal/*` or
 * removed package is used, and the stylesheets of the used families (and
 * `@salmonui/core/styles.css`) are imported.
 */
export function checkImports(source: string, map: ExportsMap, options: { stylesheets?: boolean } = {}): ImportReport {
  const imports = parseImports(source);
  const problems: ImportProblem[] = [];
  const salmon = imports.filter((imp) => imp.specifier.startsWith('@salmonui/'));
  const imported = new Set(salmon.map((imp) => imp.specifier));
  const usedFamilies = new Map<string, { family: IndexFamily; pkg: IndexPackage; line: number }>();
  let needsCore: number | null = null;

  for (const imp of salmon) {
    const { specifier, line } = imp;
    const pkgName = ExportsMap.packageName(specifier);
    if (pkgName in REMOVED_PACKAGES) {
      const replacement = migrateSpecifier(specifier, map);
      const names = imp.names.filter((n) => n.imported !== 'default');
      const perName = names.map((n) => ({ n, to: replacement && map.entries.get(replacement)?.names?.includes(n.imported) ? replacement : (map.exportersOf(n.imported)[0] ?? null) }));
      const targets = [...new Set(perName.map((x) => x.to).filter((x): x is string => x !== null))];
      let fix: string | undefined;
      if (imp.form === 'side-effect' && replacement) fix = `import '${replacement}';`;
      else if (targets.length > 0) {
        fix = targets
          .map((to) => `import ${imp.typeOnly ? 'type ' : ''}{ ${perName.filter((x) => x.to === to).map((x) => (x.n.typeOnly && !imp.typeOnly ? 'type ' : '') + (x.n.local === x.n.imported ? x.n.imported : `${x.n.imported} as ${x.n.local}`)).join(', ')} } from '${to}';`)
          .join('\n');
      } else if (replacement) fix = `'${replacement}'`;
      const missing = perName.filter((x) => x.to === null).map((x) => x.n.imported);
      problems.push({
        severity: 'error',
        line,
        specifier,
        message: `\`${pkgName}\` no longer exists; it was replaced by ${REMOVED_PACKAGES[pkgName]}.${specifier.endsWith('.css') ? ' Styles: `@salmonui/core/styles.css` once, plus the `styles.css` of each family used.' : ''}${missing.length ? ` Not exported by any entry: ${missing.map((m) => `\`${m}\``).join(', ')} (renamed or removed; search with get_component).` : ''}`,
        ...(fix ? { fix } : {}),
      });
      continue;
    }
    if (/\/internal(\/|$)/.test(specifier)) {
      problems.push({ severity: 'error', line, specifier, message: `\`${specifier}\` is a private module shared between @salmonui packages (not semver, may change in any release). Use the public entries instead.` });
      continue;
    }
    if (/\/(dist|src)(\/|$)/.test(specifier)) {
      const close = map.closest(specifier.replace(/\/(dist|src)(\/.*)?$/, ''), 1);
      problems.push({ severity: 'error', line, specifier, message: `Deep imports into a package's files are blocked by its \`exports\` map; import the public entry.`, ...(close[0] ? { fix: `'${close[0]}'` } : {}) });
      continue;
    }
    if (!map.packages.has(pkgName)) {
      const close = map.closest(specifier);
      problems.push({ severity: 'error', line, specifier, message: `\`${pkgName}\` is not a Salmon UI package.${close.length ? ` Did you mean ${close.map((c) => `\`${c}\``).join(', ')}?` : ''}`, ...(close[0] ? { fix: `'${close[0]}'` } : {}) });
      continue;
    }
    const entry = map.entries.get(specifier);
    if (!entry) {
      const close = map.closest(specifier);
      const names = imp.names.filter((n) => n.imported !== 'default').map((n) => n.imported);
      const homes = [...new Set(names.map((n) => map.exportersOf(n)[0]).filter((x): x is string => x !== undefined))];
      const hint = homes.length ? ` The imported names live in ${homes.map((h) => `\`${h}\``).join(', ')}.` : close.length ? ` Did you mean ${close.map((c) => `\`${c}\``).join(', ')}?` : '';
      problems.push({ severity: 'error', line, specifier, message: `\`${specifier}\` is not in the \`exports\` map of ${pkgName}.${hint}`, ...(homes[0] ?? close[0] ? { fix: `'${homes[0] ?? close[0]}'` } : {}) });
      continue;
    }
    if (entry.kind === 'css') {
      if (imp.form !== 'side-effect' && imp.form !== 'dynamic') problems.push({ severity: 'warning', line, specifier, message: 'Stylesheets are side-effect imports: `import \'' + specifier + '\';`.' });
      continue;
    }
    if (imp.form === 'side-effect') {
      problems.push({ severity: 'warning', line, specifier, message: `\`import '${specifier}'\` loads JavaScript only; it does not load styles. Import the stylesheet instead.` });
    }
    const exported = new Set(entry.names ?? []);
    for (const name of imp.names) {
      if (exported.has(name.imported)) continue;
      if (name.imported === 'default') {
        problems.push({ severity: 'error', line, specifier, message: `\`${specifier}\` has no default export; Salmon UI exports are named (\`import { ... } from '${specifier}'\`).` });
        continue;
      }
      const elsewhere = map.exportersOf(name.imported);
      const ci =
        elsewhere.length === 0
          ? ([...exported].find((e) => e.toLowerCase() === name.imported.toLowerCase()) ??
            [...exported].map((e) => ({ e, d: editDistance(e, name.imported) })).filter((x) => x.d <= 2).sort((a, b) => a.d - b.d)[0]?.e)
          : undefined;
      problems.push({
        severity: 'error',
        line,
        specifier,
        message: `\`${name.imported}\` is not exported by \`${specifier}\`.${elsewhere.length ? ` It is exported by ${elsewhere.slice(0, 3).map((e) => `\`${e}\``).join(', ')}.` : ci ? ` Did you mean \`${ci}\`?` : ' No entry exports it.'}`,
        ...(elsewhere[0] ? { fix: `import ${name.typeOnly ? 'type ' : ''}{ ${name.imported} } from '${elsewhere[0]}';` } : ci ? { fix: ci } : {}),
      });
    }
    const valueImport = !imp.typeOnly && (imp.namespace || imp.form === 'dynamic' || imp.names.some((n) => !n.typeOnly));
    if (!valueImport) continue;
    const pkg = map.packages.get(pkgName);
    const fam = map.familyOf.get(specifier);
    if (pkg?.react === 'required') needsCore ??= line;
    if (fam && fam.family.stylesheet && !usedFamilies.has(fam.family.name)) usedFamilies.set(fam.family.name, { ...fam, line });
  }

  if (options.stylesheets !== false) {
    if (needsCore !== null && !imported.has(CORE_STYLES)) {
      problems.push({ severity: 'warning', line: needsCore, specifier: CORE_STYLES, message: `Components need the theme: import \`${CORE_STYLES}\` once (usually in the app root; ignore this if it is imported there).`, fix: `import '${CORE_STYLES}';` });
    }
    for (const { family, pkg, line } of usedFamilies.values()) {
      if (imported.has(family.stylesheet!) || (pkg.stylesheet && imported.has(pkg.stylesheet))) continue;
      problems.push({ severity: 'warning', line, specifier: family.stylesheet, message: `\`${family.specifier}\` renders unstyled without its stylesheet: import \`${family.stylesheet}\` (ignore this if the app root imports it).`, fix: `import '${family.stylesheet}';` });
    }
    // A family stylesheet carries every family it renders, so only the
    // manifest exceptions it does not carry are reported (always-needed ones;
    // the opt-in ones depend on props this check cannot see).
    for (const { family, line } of usedFamilies.values()) {
      for (const { stylesheet, when } of family.alsoImport ?? []) {
        if (when !== null || imported.has(stylesheet)) continue;
        const aggregate = map.packages.get(ExportsMap.packageName(stylesheet))?.stylesheet;
        if (aggregate && imported.has(aggregate)) continue;
        problems.push({ severity: 'warning', line, specifier: stylesheet, message: `\`${family.stylesheet}\` does not carry the rules of \`${stylesheet.replace(/\/styles\.css$/, '')}\` that \`${family.specifier}\` renders: import \`${stylesheet}\` too (ignore this if the app root imports it).`, fix: `import '${stylesheet}';` });
      }
    }
  }
  return { imports, checked: salmon.length, problems };
}
