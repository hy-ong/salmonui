import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Breadcrumbs } from '../../../../../components/DocChrome';
import { DemoFrame } from '../../../../../components/DemoFrame';
import { DemoTabs } from '../../../../../components/DemoTabs';
import { JsonLd } from '../../../../../components/JsonLd';
import { renderCodeBlock } from '../../../../../lib/markdown';
import { pageMetadata } from '../../../../../lib/seo';
import { breadcrumbJsonLd } from '../../../../../lib/structured-data';
import { DEMOS_PATH, demoCategoryAnchor, demoHref, demoPageTitle, docHref, getDemo, getDemoNotes, getDemos, getDemoSource, getDocForDemo, getSection, getSections } from '../../../../../lib/site';

// `/demos/<category>/<id>`: one demo of a non-grid category with Preview /
// Source / Notes, the standalone fixture of the site specs.
export const dynamicParams = false;

type Params = { category: string; id: string };

export function generateStaticParams(): Params[] {
  const sections = new Set(getSections().map((s) => s.section));
  return getDemos()
    .filter((demo) => sections.has(demo.category))
    .map((demo) => ({ category: demo.category, id: demo.id }));
}

function find(params: Params) {
  const demo = getDemo(params.id);
  const section = getSection(params.category);
  return demo && section && demo.category === section.section ? { demo, section } : undefined;
}

export async function generateMetadata({ params }: { params: Promise<Params> }) {
  const found = find(await params);
  if (!found) return {};
  return pageMetadata({ title: demoPageTitle(found.demo), description: found.demo.description, path: demoHref(found.demo), kind: 'demo' });
}

export default async function SectionDemoPage({ params }: { params: Promise<Params> }) {
  const found = find(await params);
  if (!found) notFound();
  const { demo, section } = found;
  // Prefer the page in this section: the category crumb links to its group on the
  // section demo index, which only lists this section's docs.
  const doc = section.docs.find((page) => page.demos.includes(demo.id)) ?? getDocForDemo(demo.id);
  const notes = getDemoNotes(demo);
  const source = getDemoSource(demo);
  const browser = `${DEMOS_PATH}/${section.section}`;
  const crumbs = [
    { title: 'Demos', href: DEMOS_PATH },
    { title: section.title, href: browser },
    ...(doc && section.docs.includes(doc) ? [{ title: doc.category, href: `${browser}#${demoCategoryAnchor(doc.category)}` }] : []),
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
          Documented in <Link href={docHref(doc)}>{doc.title}</Link>.
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
          </div>
        }
      />
    </article>
  );
}
