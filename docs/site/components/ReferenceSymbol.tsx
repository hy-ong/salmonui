// One API reference symbol page, rendered at
// `/docs/reference/<pkg>/<symbol>` for the root entry and
// `/docs/reference/<pkg>/<entry>/<symbol>` otherwise. Server component.
import {
  componentProps,
  entrySpecifier,
  getSymbolPages,
  groupByKind,
  importLine,
  kindLabel,
  summaryText,
  type SymbolPage,
} from '../lib/api-reference';
import { lastModifiedOf, packageSources } from '../lib/page-sources';
import { pageMetadata } from '../lib/seo';
import { articlePageJsonLd } from '../lib/structured-data';
import { ApiSymbol, KindBadge } from './ApiSymbol';
import { Breadcrumbs, MarkdownLink } from './DocChrome';
import { JsonLd } from './JsonLd';
import { entryCrumbs } from './ReferenceEntry';

/** `<name> <kind>: <specifier> API reference` and a description from the summary. */
export function symbolText({ pkg, entry, symbol }: Pick<SymbolPage, 'pkg' | 'entry' | 'symbol'>) {
  const specifier = entrySpecifier(pkg, entry);
  const kind = kindLabel(symbol.kind);
  const summary = summaryText(symbol, 1000);
  const lead = `The ${symbol.name} ${kind} of ${specifier}`;
  const rest = summary === '' ? `its signature${symbol.members?.length ? ', members' : ''} and docs.` : summary;
  const description = `${lead}: ${rest}`;
  return {
    title: `${symbol.name} ${kind}: ${specifier} API reference`,
    description: description.length <= 200 ? description : `${description.slice(0, 199).trimEnd()}…`,
  };
}

export function referenceSymbolMetadata(page: SymbolPage) {
  return pageMetadata({ ...symbolText(page), path: page.href, kind: 'reference', markdownPath: `${page.href}.md` });
}

/** Previous and next symbol pages in the home entry's index order. */
function neighbors(page: SymbolPage): { prev?: SymbolPage | undefined; next?: SymbolPage | undefined } {
  const pages = getSymbolPages();
  const order = groupByKind(page.entry.symbols)
    .flatMap((group) => group.symbols)
    .map((symbol) => pages.pageOf(page.pkg, page.entry, symbol.name)!)
    .filter((candidate) => candidate.entry === page.entry);
  const index = order.indexOf(page);
  return { prev: order[index - 1], next: order[index + 1] };
}

export function ReferenceSymbol({ page }: { page: SymbolPage }) {
  const { pkg, entry, symbol, href } = page;
  const crumbs = [...entryCrumbs(pkg, entry, false), { title: symbol.name }];
  const { title, description } = symbolText(page);
  const jsonLd = articlePageJsonLd({ headline: title, description, path: href, dateModified: lastModifiedOf(packageSources(pkg.slug)) }, crumbs);
  const propsSymbol = componentProps(symbol, entry);
  const props = propsSymbol ? { symbol: propsSymbol, href: getSymbolPages().pageOf(pkg, entry, propsSymbol.name)!.href } : undefined;
  const { prev, next } = neighbors(page);
  return (
    <article className="doc api-entry api-symbol-page">
      <JsonLd data={jsonLd} />
      <Breadcrumbs items={crumbs} />
      <MarkdownLink path={href} />
      <p className="doc__category">
        API reference: <code>{entrySpecifier(pkg, entry)}</code>
      </p>
      <h1 className="api-symbol__title">
        <code>{symbol.name}</code>
        <KindBadge kind={symbol.kind} />
      </h1>
      <pre className="code-block api-entry__import">
        <code>{importLine(page)}</code>
      </pre>
      {page.alsoFrom.length > 0 ? (
        <p className="api-symbol__also">
          Also exported from{' '}
          {page.alsoFrom.map((other, index) => (
            <span key={other.slug}>
              {index > 0 ? ', ' : null}
              <code>{entrySpecifier(pkg, other)}</code>
            </span>
          ))}
          .
        </p>
      ) : null}
      <ApiSymbol symbol={symbol} props={props} sourceDir={`packages/${pkg.slug}/src`} />
      {prev || next ? (
        <nav className="docs-prevnext" aria-label="Previous and next symbols">
          {prev ? (
            <a href={prev.href} rel="prev" className="docs-prevnext__prev">
              <span>Previous</span> {prev.symbol.name}
            </a>
          ) : (
            <span />
          )}
          {next ? (
            <a href={next.href} rel="next" className="docs-prevnext__next">
              <span>Next</span> {next.symbol.name}
            </a>
          ) : null}
        </nav>
      ) : null}
    </article>
  );
}
