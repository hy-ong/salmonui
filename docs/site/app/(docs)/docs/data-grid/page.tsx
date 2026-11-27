import Link from 'next/link';
import { InlineCode } from '../../../../components/InlineCode';
import { Breadcrumbs, MarkdownLink } from '../../../../components/DocChrome';
import { pageMetadata } from '../../../../lib/seo';
import { categoryAnchor, DATA_GRID_DEMOS_PATH, DATA_GRID_PATH, getDocsTrail, getNavigation } from '../../../../lib/site';

export const metadata = pageMetadata({
  title: 'Data Grid documentation',
  description: 'Every Salmon UI Data Grid docs page by category, with its live demos.',
  path: DATA_GRID_PATH,
  kind: 'docs',
  markdownPath: `${DATA_GRID_PATH}.md`,
});

/** The Data Grid docs index: every docs page by category (`/docs` lists the components). */
export default function DataGridDocsIndexPage() {
  const navigation = getNavigation();
  return (
    <article className="doc">
      <Breadcrumbs items={getDocsTrail(DATA_GRID_PATH)} />
      <MarkdownLink path={DATA_GRID_PATH} />
      <h1>Salmon UI Data Grid documentation</h1>
      <p className="doc__lede">
        A virtualized React 19 data grid, from 10 rows to 1,000,000, with sorting, filtering, grouping, editing, tree rows and export. Every page below embeds live
        demos; each demo also has a standalone route used by the browser test suites.
      </p>
      <p className="home-links">
        <Link href={DATA_GRID_DEMOS_PATH}>Browse all Data Grid demos</Link>
      </p>
      {navigation.map(({ category, docs }) => (
        <section key={category} className="home-section" id={categoryAnchor(category)}>
          <h2>{category}</h2>
          <ul className="home-cards">
            {docs.map((doc) => (
              <li key={doc.slug}>
                <Link href={`/docs/data-grid/${doc.slug}`}>{doc.title}</Link>
                <p>
                  <InlineCode text={doc.description} />
                </p>
                <p className="home-meta">
                  {doc.demos.length} {doc.demos.length === 1 ? 'demo' : 'demos'}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p>
        Browse every Data Grid demo on the <Link href={DATA_GRID_DEMOS_PATH}>demos page</Link>, or every exported symbol in the{' '}
        <Link href="/docs/reference/data-grid">API reference</Link>.
      </p>
    </article>
  );
}
