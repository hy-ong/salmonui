import Link from 'next/link';
import { pageMetadata } from '../../../lib/seo';
import { DATA_GRID_DEMOS_PATH, DATA_GRID_TITLE, DEMOS_PATH, getDemoGroups, getSections } from '../../../lib/site';

export const metadata = pageMetadata({
  title: 'Demos',
  description: 'Live Salmon UI demos, one section per component, each with a standalone page showing its preview, source and notes.',
  path: DEMOS_PATH,
  kind: 'demo',
});

/**
 * Demos home: one card per component; each component owns
 * `/demos/<component>/`.
 */
export default function DemosHomePage() {
  const groups = getDemoGroups();
  const demoCount = groups.reduce((sum, { demos }) => sum + demos.length, 0);
  return (
    <article className="doc">
      <h1>Demos</h1>
      <p className="doc__lede">Every component has its own demo browser; every demo has a standalone page with its preview, source and notes.</p>
      <section className="home-section" aria-labelledby="demos-data-grid">
        <h2 id="demos-data-grid">{DATA_GRID_TITLE}</h2>
        <ul className="home-cards">
          <li>
            <Link href={DATA_GRID_DEMOS_PATH}>All {DATA_GRID_TITLE} demos</Link>
            <p>Sorting, filtering, grouping, editing, virtualization, export and the rest of the Data Grid feature set, live.</p>
            <p className="home-meta">
              {groups.length} feature areas · {demoCount} demos
            </p>
          </li>
        </ul>
      </section>
      {getSections().map((section) => {
        const sectionDemos = getDemoGroups(section.section).reduce((sum, { demos }) => sum + demos.length, 0);
        return (
          <section key={section.section} className="home-section" aria-labelledby={`demos-${section.section}`}>
            <h2 id={`demos-${section.section}`}>{section.title}</h2>
            <ul className="home-cards">
              <li>
                <Link href={`${DEMOS_PATH}/${section.section}`}>All {section.title} demos</Link>
                <p className="home-meta">{sectionDemos} demos</p>
              </li>
            </ul>
          </section>
        );
      })}
    </article>
  );
}
