// The offline index the server answers from: `dist/index.json`, written at
// pack time by `scripts/build-index.mjs` from the package manifest, the
// generated API reference, the docs pages and the demo sources of the same
// repository version.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const INDEX_FORMAT = 1;

export type SymbolKind = 'component' | 'function' | 'class' | 'interface' | 'type' | 'const' | 'enum' | 'namespace';

export interface IndexFamily {
  /** Family slug (`button`, `date-picker`). */
  readonly name: string;
  /** Public import specifier (`@salmonui/buttons/button`). */
  readonly specifier: string;
  /** Further public entries of the family (`@salmonui/charts/chart/features`). */
  readonly subpaths: readonly string[];
  /** The family stylesheet specifier, or null when the family has no own CSS. */
  readonly stylesheet: string | null;
  /** One sentence. */
  readonly summary: string;
  /** Component names exported by the family entry. */
  readonly components: readonly string[];
  /** Hook names (`use*`) exported by the family entry. */
  readonly hooks: readonly string[];
  /** Docs page paths that import the family. */
  readonly docs: readonly string[];
  /**
   * Stylesheets of other families to import with this one because its
   * stylesheet does not carry them; `when` is null when always needed.
   * Every other family it renders is carried by its own stylesheet.
   */
  readonly alsoImport?: readonly { readonly stylesheet: string; readonly when: string | null }[];
}

export interface IndexPackage {
  readonly name: string;
  readonly description: string;
  readonly react: 'required' | 'optional' | 'none';
  readonly deps: readonly string[];
  readonly optionalPeers: readonly string[];
  /** Package-wide stylesheet aggregate (`@salmonui/buttons/styles.css`), when there is one. */
  readonly stylesheet: string | null;
  readonly families: readonly IndexFamily[];
  /** Public JS entries that are not a family (`@salmonui/core/theme`, `@salmonui/data-grid/engine/sort`). */
  readonly entries: readonly string[];
}

export interface IndexEntry {
  readonly specifier: string;
  readonly package: string;
  readonly kind: 'js' | 'css';
  /** Family slug the entry belongs to. */
  readonly family?: string;
  /** Exported names (JS entries). */
  readonly names?: readonly string[];
}

export interface IndexMember {
  readonly name: string;
  readonly type: string;
  readonly optional: boolean;
  readonly summary: string;
  readonly default?: string;
  readonly deprecated?: string;
  readonly inherited?: boolean;
}

export interface IndexParam {
  readonly name: string;
  readonly text: string;
}

export interface IndexSymbol {
  readonly name: string;
  readonly kind: SymbolKind;
  /** Entries exporting the symbol; the first is its home. */
  readonly specifiers: readonly string[];
  readonly summary: string;
  readonly docs?: string;
  readonly signature: string;
  readonly deprecated?: string;
  readonly params?: readonly IndexParam[];
  readonly returns?: string;
  readonly members?: readonly IndexMember[];
}

export interface IndexSection {
  readonly heading: string;
  /** Heading anchor on the page (empty for the intro). */
  readonly anchor: string;
  readonly text: string;
}

export interface IndexDoc {
  readonly title: string;
  readonly description: string;
  /** Site path (`/docs/buttons/button`). */
  readonly path: string;
  readonly section: string;
  readonly sections: readonly IndexSection[];
}

export interface IndexDemo {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly category: string;
  /** Site path (`/demos/buttons/button-basics`). */
  readonly path: string;
  readonly notes: string;
  /** `@salmonui/*` specifiers the demo imports. */
  readonly imports: readonly string[];
  readonly source: string;
}

export interface McpIndex {
  readonly format: typeof INDEX_FORMAT;
  /** Version of the Salmon UI packages the index was built from. */
  readonly version: string;
  /** Git SHA of the build, or `unknown`. */
  readonly generatedFrom: string;
  /** Public docs site, no trailing slash. */
  readonly siteUrl: string;
  readonly packages: readonly IndexPackage[];
  readonly entries: readonly IndexEntry[];
  readonly symbols: readonly IndexSymbol[];
  readonly docs: readonly IndexDoc[];
  readonly demos: readonly IndexDemo[];
}

/** The bundled index file, or the file named by `SALMONUI_MCP_INDEX`. */
export function defaultIndexPath(env: Readonly<Record<string, string | undefined>> = process.env): string {
  const override = env['SALMONUI_MCP_INDEX'];
  return override && override.trim() !== '' ? override : fileURLToPath(new URL('./index.json', import.meta.url));
}

/** Reads and checks an index file. Throws with an actionable message when it is missing or of another format. */
export function loadIndex(path: string = defaultIndexPath()): McpIndex {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    throw new Error(`@salmonui/mcp: index not found at ${path}. In the Salmon UI repository run \`npm run build && npm run mcp:index\`.`);
  }
  const index = JSON.parse(text) as McpIndex;
  if (index === null || typeof index !== 'object' || index.format !== INDEX_FORMAT) {
    throw new Error(`@salmonui/mcp: ${path} is not a format ${INDEX_FORMAT} index.`);
  }
  return index;
}
