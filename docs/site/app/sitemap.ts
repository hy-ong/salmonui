import type { MetadataRoute } from 'next';
import { appSource, demoSources, docSources, getReferenceRoutes, lastModifiedOf, packageSources } from '../lib/page-sources';
import { DATA_GRID_DEMOS_PATH, DATA_GRID_PATH, DEMOS_PATH, docHref, demoHref, getDemos, getDocs, getSections } from '../lib/site';
import { absoluteUrl } from '../lib/site-url';

// Every indexable route in the canonical form, dated by the git commit of its source files. The 404 page is
// not listed.
export const dynamic = 'force-static';

export default function sitemap(): MetadataRoute.Sitemap {
  const entry = (path: string, sources: readonly string[]): MetadataRoute.Sitemap[number] => ({
    url: absoluteUrl(path),
    lastModified: lastModifiedOf(sources),
  });
  return [
    entry('/', appSource('(marketing)/page.tsx')),
    entry('/docs', appSource('(docs)/docs/page.tsx')),
    entry(DATA_GRID_PATH, appSource('(docs)/docs/data-grid/page.tsx')),
    ...getDocs().map((doc) => entry(`/docs/data-grid/${doc.slug}`, docSources(doc))),
    ...getSections().flatMap(({ section, docs }) => [
      entry(`/docs/${section}`, appSource('(docs)/docs/[category]/page.tsx')),
      ...docs.map((doc) => entry(docHref(doc), docSources(doc))),
      entry(`${DEMOS_PATH}/${section}`, appSource('(docs)/demos/[category]/page.tsx')),
    ]),
    entry('/docs/reference', appSource('(docs)/docs/reference/page.tsx')),
    ...getReferenceRoutes().map((ref) => entry(ref.path, packageSources(ref.pkg))),
    entry(DEMOS_PATH, appSource('(docs)/demos/page.tsx')),
    entry(DATA_GRID_DEMOS_PATH, appSource('(docs)/demos/data-grid/page.tsx')),
    ...getDemos().map((demo) => entry(demoHref(demo), demoSources(demo))),
  ];
}
