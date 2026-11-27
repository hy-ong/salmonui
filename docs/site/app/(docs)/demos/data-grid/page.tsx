import { Breadcrumbs } from '../../../../components/DocChrome';
import { DemoBrowser } from '../../../../components/DemoBrowser';
import { JsonLd } from '../../../../components/JsonLd';
import { pageMetadata } from '../../../../lib/seo';
import { breadcrumbJsonLd } from '../../../../lib/structured-data';
import { DATA_GRID_DEMOS_PATH, DATA_GRID_TITLE, DEMOS_PATH, demoCategoryAnchor, demoHref, getDemoGroups } from '../../../../lib/site';

export const metadata = pageMetadata({
  title: 'Data Grid demos',
  description: 'Every live Salmon UI Data Grid demo, grouped by the docs category that embeds it and filterable by title.',
  path: DATA_GRID_DEMOS_PATH,
  kind: 'demo',
});

/** `/demos/data-grid`: the Data Grid demo browser. */
export default function DataGridDemosPage() {
  const groups = getDemoGroups().map(({ category, demos }) => ({
    category,
    anchor: demoCategoryAnchor(category),
    demos: demos.map((demo) => ({ id: demo.id, href: demoHref(demo), title: demo.title, description: demo.description })),
  }));
  const crumbs = [{ title: 'Demos', href: DEMOS_PATH }, { title: DATA_GRID_TITLE }];
  return (
    <article className="doc">
      <JsonLd data={breadcrumbJsonLd(crumbs, DATA_GRID_DEMOS_PATH)} />
      <Breadcrumbs items={crumbs} />
      <h1>Data Grid demos</h1>
      <p className="doc__lede">Every demo has a standalone page with its preview, source and notes.</p>
      <DemoBrowser groups={groups} />
    </article>
  );
}
