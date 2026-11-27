import { notFound } from 'next/navigation';
import { Breadcrumbs, MarkdownLink, PrevNext, Toc } from '../../../../../components/DocChrome';
import { DemoFrame } from '../../../../../components/DemoFrame';
import { JsonLd } from '../../../../../components/JsonLd';
import { docSources, lastModifiedOf } from '../../../../../lib/page-sources';
import { pageMetadata } from '../../../../../lib/seo';
import { articlePageJsonLd } from '../../../../../lib/structured-data';
import { getDemo, getDoc, getDocs, getDocsTrail, getPrevNext, renderDoc } from '../../../../../lib/site';

export const dynamicParams = false;

export function generateStaticParams() {
  return getDocs().map((doc) => ({ slug: doc.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const doc = getDoc((await params).slug);
  if (!doc) return {};
  return pageMetadata({ title: doc.title, description: doc.description, path: `/docs/data-grid/${doc.slug}`, kind: 'docs', markdownPath: `/docs/data-grid/${doc.slug}.md` });
}

export default async function DocPage({ params }: { params: Promise<{ slug: string }> }) {
  const doc = getDoc((await params).slug);
  if (!doc) notFound();
  const { segments, toc } = renderDoc(doc);
  const { prev, next } = getPrevNext(`/docs/data-grid/${doc.slug}`);
  const path = `/docs/data-grid/${doc.slug}`;
  // The sidebar ancestry of the page.
  const crumbs = getDocsTrail(path);
  const jsonLd = articlePageJsonLd(
    { headline: doc.title, description: doc.description, path, dateModified: lastModifiedOf(docSources(doc)) },
    crumbs,
  );
  return (
    <div className="docs-page">
      <article className="doc">
        <JsonLd data={jsonLd} />
        <Breadcrumbs items={crumbs} />
        <MarkdownLink path={path} />
        <p className="doc__category">{doc.category}</p>
        <h1>{doc.title}</h1>
        {doc.description ? <p className="doc__lede">{doc.description}</p> : null}
        {segments.map((segment, index) => {
          if (segment.kind === 'html') return <div key={index} className="doc__prose" dangerouslySetInnerHTML={{ __html: segment.html }} />;
          const demo = getDemo(segment.id);
          return demo ? <DemoFrame key={index} demo={demo} /> : <p key={index} role="alert">Unknown demo `{segment.id}`.</p>;
        })}
        <PrevNext prev={prev} next={next} />
      </article>
      <aside className="docs-page__aside">
        <Toc entries={toc} />
      </aside>
    </div>
  );
}
