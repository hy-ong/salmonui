import Link from 'next/link';
import { notFound } from 'next/navigation';
import { InlineCode } from '../../../../components/InlineCode';
import { Breadcrumbs, MarkdownLink } from '../../../../components/DocChrome';
import { pageMetadata } from '../../../../lib/seo';
import { categoryAnchor, DEMOS_PATH, docHref, getDocsTrail, getSection, getSections, groupDocs } from '../../../../lib/site';

// `/docs/<category>` for the non-grid component categories;
// `/docs/data-grid` keeps its own static route.
export const dynamicParams = false;

export function generateStaticParams() {
  return getSections().map((s) => ({ category: s.section }));
}

export async function generateMetadata({ params }: { params: Promise<{ category: string }> }) {
  const section = getSection((await params).category);
  if (!section) return {};
  const path = `/docs/${section.section}`;
  return pageMetadata({
    title: `${section.title} documentation`,
    description: `Every Salmon UI ${section.title} docs page by component, with its live demos.`,
    path,
    kind: 'docs',
    markdownPath: `${path}.md`,
  });
}

export default async function SectionIndexPage({ params }: { params: Promise<{ category: string }> }) {
  const section = getSection((await params).category);
  if (!section) notFound();
  const path = `/docs/${section.section}`;
  return (
    <article className="doc">
      <Breadcrumbs items={getDocsTrail(path)} />
      <MarkdownLink path={path} />
      <h1>Salmon UI {section.title} documentation</h1>
      <p className="doc__lede">
        Every page below embeds live demos; each demo also has a standalone
        route.
      </p>
      <p className="home-links">
        <Link href={`${DEMOS_PATH}/${section.section}`}>Browse all {section.title} demos</Link>
      </p>
      {groupDocs(section.docs).map(({ category, docs }) => (
        <section key={category} className="home-section" id={categoryAnchor(category)}>
          <h2>{category}</h2>
          <ul className="home-cards">
            {docs.map((doc) => (
              <li key={doc.slug}>
                <Link href={docHref(doc)}>{doc.title}</Link>
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
    </article>
  );
}
