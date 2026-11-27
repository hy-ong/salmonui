export interface SitePaths {
  readonly site: string;
  readonly content: string;
  readonly demos: string;
  readonly registry: string;
}

export interface DocPage {
  readonly slug: string;
  /** Docs section (component category): `'data-grid'` for `content/*.md`, else the `content/<section>/` folder. */
  readonly section: string;
  readonly path: string;
  readonly title: string;
  readonly description: string;
  /** Frontmatter has a non-empty `title` / `description` (a missing one is a catalog error). */
  readonly hasTitle?: boolean;
  readonly hasDescription?: boolean;
  readonly category: string;
  readonly order: number;
  /** Demo ids embedded in this page. */
  readonly demos: readonly string[];
  readonly body: string;
}

export interface DemoMeta {
  readonly id: string;
  readonly folder: string;
  readonly hasMeta: boolean;
  readonly hasComponent: boolean;
  readonly title: string;
  readonly description: string;
  /** `demo.md` frontmatter has a non-empty `title` / `description` (a missing one is a catalog error). */
  readonly hasTitle?: boolean;
  readonly hasDescription?: boolean;
  /** Docs section that owns the demo (`demo.md` `category`, default `'data-grid'`). */
  readonly category: string;
}

export function sitePaths(siteDir: string): SitePaths;
export function parseFrontmatter(source: string): { data: Record<string, unknown>; body: string };
export function loadDocs(dir: string, section?: string): DocPage[];
export function loadSectionDocs(contentDir: string): { section: string; docs: DocPage[] }[];
export function loadAllDocs(contentDir: string): DocPage[];
export function loadDemos(dir: string): DemoMeta[];
export function isValidSlug(slug: string): boolean;
/** Slugs reserved for static `/docs/*` routes; a content file with one is a catalog error. */
export const RESERVED_SLUGS: readonly ['reference'];
export function isReservedSlug(slug: string): boolean;

export interface CatalogCheck {
  readonly errors: readonly string[];
}

/** Integrity problems of the docs pages and demos (front matter, slugs, demo embedding, titles). */
export function checkCatalog(docs: readonly DocPage[], demos: readonly DemoMeta[]): CatalogCheck;
