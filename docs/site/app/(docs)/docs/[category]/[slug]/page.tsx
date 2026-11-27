import { notFound } from 'next/navigation';
import { Breadcrumbs, MarkdownLink, PrevNext, Toc } from '../../../../../components/DocChrome';
import { DemoFrame } from '../../../../../components/DemoFrame';
import { JsonLd } from '../../../../../components/JsonLd';
import { docSources, lastModifiedOf } from '../../../../../lib/page-sources';
import { pageMetadata } from '../../../../../lib/seo';
import { articlePageJsonLd } from '../../../../../lib/structured-data';
import { docHref, getDocsTrail, getDemo, getPrevNext, getSection, getSections, renderDoc } from '../../../../../lib/site';

// One `content/<category>/<slug>.md` page.
export const dynamicParams = false;

type Params = { category: string; slug: string };

export function generateStaticParams(): Params[] {
  return getSections().flatMap((s) => s.docs.map((doc) => ({ category: s.section, slug: doc.slug })));
}

function find(params: Params) {
  const section = getSection(params.category);
  const doc = section?.docs.find((d) => d.slug === params.slug);
  return section && doc ? { section, doc } : undefined;
}

export async function generateMetadata({ params }: { params: Promise<Params> }) {
  const found = find(await params);
  if (!found) return {};
  const path = docHref(found.doc);
  return pageMetadata({ title: `${found.doc.title} · ${found.section.title}`, description: found.doc.description, path, kind: 'docs', markdownPath: `${path}.md` });
}

export default async function SectionDocPage({ params }: { params: Promise<Params> }) {
  const found = find(await params);
  if (!found) notFound();
  const { section, doc } = found;
  const { segments, toc } = renderDoc(doc);
  const { prev, next } = getPrevNext(docHref(doc));
  const path = docHref(doc);
  // The sidebar ancestry of the page.
  const crumbs = getDocsTrail(path);
  const jsonLd = articlePageJsonLd({ headline: doc.title, description: doc.description, path, dateModified: lastModifiedOf(docSources(doc)) }, crumbs);
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
