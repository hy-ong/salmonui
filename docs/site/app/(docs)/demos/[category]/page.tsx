import { notFound } from 'next/navigation';
import { Breadcrumbs } from '../../../../components/DocChrome';
import { DemoBrowser } from '../../../../components/DemoBrowser';
import { JsonLd } from '../../../../components/JsonLd';
import { pageMetadata } from '../../../../lib/seo';
import { breadcrumbJsonLd } from '../../../../lib/structured-data';
import { DEMOS_PATH, demoCategoryAnchor, demoHref, getDemoGroups, getSection, getSections } from '../../../../lib/site';

// `/demos/<category>`: the demo browser of a non-grid category.
export const dynamicParams = false;

export function generateStaticParams() {
  return getSections().map((s) => ({ category: s.section }));
}

export async function generateMetadata({ params }: { params: Promise<{ category: string }> }) {
  const section = getSection((await params).category);
  if (!section) return {};
  return pageMetadata({
    title: `${section.title} demos`,
    description: `Every live Salmon UI ${section.title} demo, grouped by the docs page category that embeds it and filterable by title.`,
    path: `${DEMOS_PATH}/${section.section}`,
    kind: 'demo',
  });
}

export default async function SectionDemosPage({ params }: { params: Promise<{ category: string }> }) {
  const section = getSection((await params).category);
  if (!section) notFound();
  const path = `${DEMOS_PATH}/${section.section}`;
  const groups = getDemoGroups(section.section).map(({ category, demos }) => ({
    category,
    anchor: demoCategoryAnchor(category),
    demos: demos.map((demo) => ({ id: demo.id, href: demoHref(demo), title: demo.title, description: demo.description })),
  }));
  const crumbs = [{ title: 'Demos', href: DEMOS_PATH }, { title: section.title }];
  return (
    <article className="doc">
      <JsonLd data={breadcrumbJsonLd(crumbs, path)} />
      <Breadcrumbs items={crumbs} />
      <h1>{section.title} demos</h1>
      <p className="doc__lede">Every demo has a standalone page with its preview, source and notes.</p>
      <DemoBrowser groups={groups} />
    </article>
  );
}
