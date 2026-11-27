import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Breadcrumbs } from '../../../../../components/DocChrome';
import { DemoFrame } from '../../../../../components/DemoFrame';
import { DemoTabs } from '../../../../../components/DemoTabs';
import { JsonLd } from '../../../../../components/JsonLd';
import { renderCodeBlock } from '../../../../../lib/markdown';
import { pageMetadata } from '../../../../../lib/seo';
import { breadcrumbJsonLd } from '../../../../../lib/structured-data';
import {
  DATA_GRID_DEMOS_PATH,
  DATA_GRID_TITLE,
  DEMOS_PATH,
  demoCategoryAnchor,
  demoHref,
  demoPageTitle,
  getDemo,
  getDemoNotes,
  getDataGridDemos,
  getDemoSource,
  getDocForDemo,
} from '../../../../../lib/site';

// Standalone demo route: the state fixture for the Playwright smoke, hydration
// and axe suites. The Preview panel holds
// the unchanged demo DOM and is always mounted.
export const dynamicParams = false;

export function generateStaticParams() {
  return getDataGridDemos().map((demo) => ({ id: demo.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const demo = getDemo((await params).id);
  if (!demo) return {};
  return pageMetadata({ title: demoPageTitle(demo), description: demo.description, path: demoHref(demo), kind: 'demo' });
}

export default async function DemoPage({ params }: { params: Promise<{ id: string }> }) {
  const demo = getDemo((await params).id);
  if (!demo) notFound();
  const doc = getDocForDemo(demo.id);
  const notes = getDemoNotes(demo);
  const source = getDemoSource(demo);
  const crumbs = [
    { title: 'Demos', href: DEMOS_PATH },
    { title: DATA_GRID_TITLE, href: DATA_GRID_DEMOS_PATH },
    ...(doc ? [{ title: doc.category, href: `${DATA_GRID_DEMOS_PATH}#${demoCategoryAnchor(doc.category)}` }] : []),
    { title: demo.title },
  ];
  return (
    <article className="doc">
      <JsonLd data={breadcrumbJsonLd(crumbs, demoHref(demo))} />
      <Breadcrumbs items={crumbs} />
      <p className="doc__category">Demo</p>
      <h1>{demo.title}</h1>
      {doc ? (
        <p className="doc__lede">
          Documented in <Link href={`/docs/data-grid/${doc.slug}`}>{doc.title}</Link>.
        </p>
      ) : null}
      <DemoTabs
        preview={<DemoFrame demo={demo} standalone />}
        source={source.map((file) => (
          <section key={file.name} className="demo-source" aria-label={file.name}>
            <p className="demo-source__name">
              <code>{file.name}</code>
            </p>
            <div dangerouslySetInnerHTML={{ __html: renderCodeBlock(file.code, 'tsx') }} />
          </section>
        ))}
        notes={
          <div className="demo-notes">
            {notes.html ? <div className="doc__prose" dangerouslySetInnerHTML={{ __html: notes.html }} /> : <p>This demo has no notes.</p>}
            {doc ? (
              <p>
                Embedded in the <Link href={`/docs/data-grid/${doc.slug}`}>{doc.title}</Link> docs page.
              </p>
            ) : null}
          </div>
        }
      />
    </article>
  );
}
