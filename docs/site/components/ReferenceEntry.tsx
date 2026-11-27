// The index of an API reference entry, shared
// by the package root route (`/docs/reference/<pkg>`, the `.` entry) and the
// subpath route (`/docs/reference/<pkg>/<entry>`): one compact row per
// exported name linking its symbol page. Server component.
import {
  type ApiEntry,
  type ApiPackage,
  describeKinds,
  entryHref,
  entryListing,
  entrySpecifier,
  getSymbolPages,
  groupByKind,
  kindAnchor,
  kindLabel,
  packageIndexHref,
  REEXPORTS_ANCHOR,
  summaryText,
} from '../lib/api-reference';
import { lastModifiedOf, packageSources } from '../lib/page-sources';
import { pageMetadata } from '../lib/seo';
import { articlePageJsonLd } from '../lib/structured-data';
import { Breadcrumbs, MarkdownLink } from './DocChrome';
import { JsonLd } from './JsonLd';

/** The page title and description, shared by the metadata and the TechArticle block. */
function entryText(pkg: ApiPackage, entry: ApiEntry) {
  const specifier = entrySpecifier(pkg, entry);
  const count = entry.symbols.length;
  return {
    title: `${specifier} API reference`,
    description: `${count} exported ${count === 1 ? 'symbol' : 'symbols'} of ${specifier}: ${describeKinds(entry.symbols)}, with signatures, docs and members.`,
  };
}

/** The lede sentence about re-exported names, which are listed on their home entry. */
function reexportSentence(own: number, entries: number): string {
  const from = entries === 1 ? 'another entry point' : `${entries} other entry points`;
  return own > 0
    ? `Names re-exported from ${from} are listed there, linked below.`
    : `Every name is re-exported from ${from}, linked below, each listing its names with their pages.`;
}

/** Metadata of an entry page. */
export function referenceEntryMetadata(pkg: ApiPackage, entry: ApiEntry) {
  return pageMetadata({ ...entryText(pkg, entry), path: entryHref(pkg, entry), kind: 'reference', markdownPath: `${entryHref(pkg, entry)}.md` });
}

/** Breadcrumbs of an entry; `current` false links the entry crumb (symbol pages). */
export function entryCrumbs(pkg: ApiPackage, entry: ApiEntry, current = true) {
  const root = entry.subpath === '.';
  return [
    { title: 'Docs', href: '/docs' },
    { title: 'API reference', href: '/docs/reference' },
    root && current ? { title: pkg.name } : { title: pkg.name, href: packageIndexHref(pkg) },
    ...(root ? [] : [current ? { title: entry.subpath.replace(/^\.\//, '') } : { title: entry.subpath.replace(/^\.\//, ''), href: entryHref(pkg, entry) }]),
  ];
}

/**
 * One `exports` subpath of one package: its names grouped by kind, each row
 * keeping the `#<name>` anchor and linking the symbol page. Rendered at
 * `/docs/reference/<pkg>` for `.` and `/docs/reference/<pkg>/<entry>`
 * otherwise.
 */
export function ReferenceEntry({ pkg, entry }: { pkg: ApiPackage; entry: ApiEntry }) {
  const path = entryHref(pkg, entry);
  const specifier = entrySpecifier(pkg, entry);
  const pages = getSymbolPages();
  const { own, reexports } = entryListing(pkg, entry, pages);
  const groups = groupByKind(own);
  const reexported = new Set(reexports.map((group) => group.entry));
  const others = pkg.entries.filter((candidate) => candidate.slug !== entry.slug && !reexported.has(candidate));
  const crumbs = entryCrumbs(pkg, entry);
  const { title, description } = entryText(pkg, entry);
  const jsonLd = articlePageJsonLd(
    { headline: title, description, path, dateModified: lastModifiedOf(packageSources(pkg.slug)) },
    crumbs,
  );
  return (
    <article className="doc api-entry">
      <JsonLd data={jsonLd} />
      <Breadcrumbs items={crumbs} />
      <MarkdownLink path={path} />
      <p className="doc__category">API reference</p>
      <h1>
        <code>{specifier}</code>
      </h1>
      <p className="doc__lede">
        {entry.symbols.length} exported {entry.symbols.length === 1 ? 'symbol' : 'symbols'}: {describeKinds(entry.symbols)}.{' '}
        {own.length > 0 ? 'Each name links its page with the signature, docs and members.' : null}
        {reexports.length > 0 ? `${own.length > 0 ? ' ' : ''}${reexportSentence(own.length, reexports.length)}` : null}
      </p>
      <pre className="code-block api-entry__import">
        <code>{`import { … } from '${specifier}';`}</code>
      </pre>
      <nav className="api-entry__kinds" aria-label="Kinds">
        <ul>
          {groups.map((group) => (
            <li key={group.kind}>
              <a href={`#${kindAnchor(group.kind)}`}>
                {kindLabel(group.kind, 2)} ({group.symbols.length})
              </a>
            </li>
          ))}
          {reexports.length > 0 ? (
            <li>
              <a href={`#${REEXPORTS_ANCHOR}`}>Re-exported entry points ({reexports.length})</a>
            </li>
          ) : null}
        </ul>
      </nav>
      {groups.map((group) => (
        <section key={group.kind} className="api-entry__group">
          <h2 id={kindAnchor(group.kind)} className="api-entry__group-title">
            {kindLabel(group.kind, 2).replace(/^./, (first) => first.toUpperCase())}
          </h2>
          <ul className="api-entry__list">
            {group.symbols.map((symbol) => {
              const summary = summaryText(symbol);
              return (
                <li key={symbol.name} id={symbol.name}>
                  <a href={pages.pageOf(pkg, entry, symbol.name)!.href}>
                    <code>{symbol.name}</code>
                  </a>
                  {summary === '' ? null : <span>{summary}</span>}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {reexports.length > 0 ? (
        <section className="api-entry__group">
          <h2 id={REEXPORTS_ANCHOR} className="api-entry__group-title">
            Re-exported entry points
          </h2>
          <ul className="api-entry__reexports">
            {reexports.map((group) => (
              <li key={group.entry.slug}>
                <a href={entryHref(pkg, group.entry)}>
                  <code>{entrySpecifier(pkg, group.entry)}</code>
                </a>
                <span>
                  {group.symbols.length} {group.symbols.length === 1 ? 'symbol' : 'symbols'}: {describeKinds(group.symbols)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {others.length > 0 ? (
        <nav className="api-entry__others" aria-label={`Other ${pkg.name} entry points`}>
          <h2>Other entry points of {pkg.name}</h2>
          <ul>
            {others.map((other) => (
              <li key={other.slug}>
                <a href={entryHref(pkg, other)}>
                  <code>{entrySpecifier(pkg, other)}</code>
                </a>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </article>
  );
}
