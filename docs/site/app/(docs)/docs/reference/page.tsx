import Link from 'next/link';
import { Breadcrumbs, MarkdownLink, SiteLink } from '../../../../components/DocChrome';
import { JsonLd } from '../../../../components/JsonLd';
import { describeKinds, entryHref, entrySpecifier, getApiReference } from '../../../../lib/api-reference';
import { appSource, lastModifiedOf } from '../../../../lib/page-sources';
import { pageMetadata } from '../../../../lib/seo';
import { articlePageJsonLd } from '../../../../lib/structured-data';

const TITLE = 'API reference';
const DESCRIPTION = 'Generated API reference for the Salmon UI packages: every exported symbol of every entry point with its signature.';
const PATH = '/docs/reference';

export const metadata = pageMetadata({ title: TITLE, description: DESCRIPTION, path: PATH, kind: 'reference', markdownPath: `${PATH}.md` });

/** Reference index: every package and its entry points with their symbol counts. */
export default function ReferenceIndexPage() {
  const reference = getApiReference();
  const crumbs = [{ title: 'Docs', href: '/docs' }, { title: TITLE }];
  const jsonLd = articlePageJsonLd(
    { headline: TITLE, description: DESCRIPTION, path: PATH, dateModified: lastModifiedOf(appSource('(docs)/docs/reference/page.tsx')) },
    crumbs,
  );
  return (
    <article className="doc api-index">
      <JsonLd data={jsonLd} />
      <Breadcrumbs items={crumbs} />
      <MarkdownLink path={PATH} />
      <h1>{TITLE}</h1>
      <p className="doc__lede">
        Every exported symbol of every published entry point, generated from the built declaration files. Each package is listed below
        with its entry points: a category package such as <code>@salmonui/buttons</code> has one subpath per component family, each with
        its own stylesheet that carries everything the family renders, and <code>@salmonui/core</code> holds the theme and the theme
        stylesheet every app imports once. For guides and
        live demos, see the <Link href="/docs">component docs</Link>.
      </p>
      {reference.packages.map((pkg) => (
        <section key={pkg.slug} id={pkg.slug} className="api-index__package">
          <h2>
            <code>{pkg.name}</code>
          </h2>
          <table className="api-index__entries">
            <thead>
              <tr>
                <th scope="col">Entry point</th>
                <th scope="col">Symbols</th>
                <th scope="col">Kinds</th>
              </tr>
            </thead>
            <tbody>
              {pkg.entries.map((entry) => (
                <tr key={entry.slug}>
                  <th scope="row">
                    <SiteLink href={entryHref(pkg, entry)}>
                      <code>{entrySpecifier(pkg, entry)}</code>
                    </SiteLink>
                  </th>
                  <td>{entry.symbols.length}</td>
                  <td>{describeKinds(entry.symbols)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
      <p className="api-index__generated">
        Generated from <code>{reference.generatedFrom}</code>.
      </p>
    </article>
  );
}
