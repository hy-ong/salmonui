// JSON-LD builders. Every block carries
// `@context` and `@type`; `components/JsonLd.tsx` serializes them into the
// server markup. Absolute URLs come from `SITE_URL`.
import { SITE_NAME } from './seo';
import { siteRepoUrl } from './site-config';
import { absoluteUrl, SITE_URL } from './site-url';

export type JsonLdObject = { '@context': 'https://schema.org'; '@type': string; [key: string]: unknown };

/** A breadcrumb as `Breadcrumbs` (components/DocChrome.tsx) renders it; the last one is the current page. */
export type BreadcrumbInput = { title: string; href?: string };

const SITE_DESCRIPTION = 'A React 19 component library: a virtualized data grid, charts, scheduler and Gantt, pivot table, editors, inputs, navigation and more, server-rendered and measured against performance budgets.';

/** `WebSite` with a `SearchAction` that opens the docs search dialog prefilled (`/docs?q=`). */
export function websiteJsonLd(): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: absoluteUrl('/'),
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${SITE_URL}/docs?q={search_term_string}` },
      'query-input': 'required name=search_term_string',
    },
  };
}

/** `SoftwareSourceCode` for the landing page; `codeRepository` only when `SITE_REPO_URL` is set. */
export function softwareSourceCodeJsonLd(): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareSourceCode',
    name: SITE_NAME,
    description: SITE_DESCRIPTION,
    url: absoluteUrl('/'),
    programmingLanguage: 'TypeScript',
    runtimePlatform: 'React 19',
    license: 'https://opensource.org/licenses/MIT',
    ...(siteRepoUrl ? { codeRepository: siteRepoUrl } : {}),
  };
}

/** `BreadcrumbList` matching the visible breadcrumbs; the last crumb is the page at `path`. */
export function breadcrumbJsonLd(crumbs: readonly BreadcrumbInput[], path: string): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.title,
      item: absoluteUrl(index === crumbs.length - 1 ? path : (crumb.href ?? path)),
    })),
  };
}

export type ArticleInput = {
  /** The page's h1 / frontmatter title (without the site suffix). */
  headline: string;
  description: string;
  path: string;
  /** ISO 8601; the sitemap `lastmod` of the page (`lastModifiedOf()` in lib/page-sources.ts). */
  dateModified: string;
};

/** `TechArticle` for docs and reference pages. */
export function techArticleJsonLd({ headline, description, path, dateModified }: ArticleInput): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline,
    description,
    url: absoluteUrl(path),
    mainEntityOfPage: absoluteUrl(path),
    dateModified,
    inLanguage: 'en',
    isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: absoluteUrl('/') },
  };
}

/** `TechArticle` + `BreadcrumbList`: the JSON-LD of every docs and reference page. */
export function articlePageJsonLd(article: ArticleInput, crumbs: readonly BreadcrumbInput[]): JsonLdObject[] {
  return [techArticleJsonLd(article), breadcrumbJsonLd(crumbs, article.path)];
}
