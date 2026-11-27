import Link from 'next/link';
import { Fragment } from 'react';
import { MarkdownLink } from '../../../components/DocChrome';
import { pageMetadata } from '../../../lib/seo';
import { countComponents, familyAnchor, getComponentFamilies } from '../../../lib/site';

export const metadata = pageMetadata({
  title: 'Documentation',
  description: 'Salmon UI documentation: the components with their guides and live demos, the generated API reference and the demo browser.',
  path: '/docs',
  kind: 'docs',
  markdownPath: '/docs.md',
});

/**
 * Docs home: one card per component family in the sidebar's order, listing its components and linking each
 * section's docs index and demo browser (each component owns
 * `/docs/<component>/`), then the
 * cross-component pages.
 */
export default function DocsHomePage() {
  const families = getComponentFamilies();
  return (
    <article className="doc">
      <MarkdownLink path="/docs" />
      <h1>Salmon UI documentation</h1>
      <p className="doc__lede">
        Salmon UI is a React 19 component library: {countComponents(families)} components in {families.length} categories. Each component has
        its own guide with live demos; the API reference covers every published package.
      </p>
      <section className="home-section" aria-labelledby="docs-components">
        <h2 id="docs-components">Components</h2>
        <ul className="home-cards">
          {families.map((family) => (
            <li key={family.family} id={familyAnchor(family.family)} data-family={family.family}>
              <Link href={family.href}>{family.title}</Link>
              <p>
                {family.components.map((component, index) => (
                  <Fragment key={component.href}>
                    {index > 0 ? ', ' : null}
                    <Link href={component.href}>{component.title}</Link>
                  </Fragment>
                ))}
              </p>
              <p className="home-meta">
                {family.components.length} {family.components.length === 1 ? 'component' : 'components'} · {family.docCount} docs pages
              </p>
              <p className="home-links">
                {family.sections.map((section) =>
                  family.sections.length === 1 ? (
                    <Fragment key={section.section}>
                      <Link href={section.docsHref}>Docs</Link>
                      <Link href={section.demosHref}>Demos</Link>
                    </Fragment>
                  ) : (
                    <Fragment key={section.section}>
                      <Link href={section.docsHref}>{section.title} docs</Link>
                      <Link href={section.demosHref}>{section.title} demos</Link>
                    </Fragment>
                  ),
                )}
              </p>
            </li>
          ))}
        </ul>
      </section>
      <section className="home-section" aria-labelledby="docs-more">
        <h2 id="docs-more">More</h2>
        <ul className="home-cards">
          <li>
            <Link href="/docs/reference">API reference</Link>
            <p>Every exported symbol of every published entry point, generated from the declaration files.</p>
          </li>
          <li>
            <Link href="/demos">Demos</Link>
            <p>Every live demo, grouped by feature area.</p>
          </li>
        </ul>
      </section>
    </article>
  );
}
