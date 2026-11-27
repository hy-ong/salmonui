import Link from 'next/link';
import type { ReactNode } from 'react';
import { isDocumentOnlyPath } from '../lib/document-only.mjs';
import type { TocEntry } from '../lib/markdown';
import type { PageLink } from '../lib/site';

/**
 * A link to a site page: `next/link` (client navigation and prefetch), or a
 * plain anchor when the target is a document-only page whose RSC payload
 * the static export leaves out.
 */
export function SiteLink({ href, rel, className, children }: { href: string; rel?: string; className?: string; children: ReactNode }) {
  if (isDocumentOnlyPath(href)) {
    return (
      <a href={href} rel={rel} className={className}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} rel={rel} className={className}>
      {children}
    </Link>
  );
}

/** Table of contents of a page's h2/h3 headings. Renders nothing without headings. */
export function Toc({ entries }: { entries: readonly TocEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <nav className="docs-toc" aria-label="On this page">
      <p className="docs-toc__title">On this page</p>
      <ul>
        {entries.map((entry) => (
          <li key={entry.id} data-depth={entry.depth}>
            <a href={`#${entry.id}`}>{entry.text}</a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Previous / next links in catalog order. */
export function PrevNext({ prev, next }: { prev?: PageLink | undefined; next?: PageLink | undefined }) {
  if (!prev && !next) return null;
  return (
    <nav className="docs-prevnext" aria-label="Previous and next pages">
      {prev ? (
        <SiteLink href={prev.href} rel="prev" className="docs-prevnext__prev">
          <span>Previous</span> {prev.title}
        </SiteLink>
      ) : (
        <span />
      )}
      {next ? (
        <SiteLink href={next.href} rel="next" className="docs-prevnext__next">
          <span>Next</span> {next.title}
        </SiteLink>
      ) : null}
    </nav>
  );
}

/**
 * "View as Markdown" link to the page's Markdown version. A plain anchor: the target is a file, not a page.
 */
export function MarkdownLink({ path }: { path: string }) {
  return (
    <p className="doc__markdown">
      <a href={`${path}.md`} type="text/markdown">
        View as Markdown
      </a>
    </p>
  );
}

/** `plain` renders a crumb with an `href` as text (a sidebar group heading; the href is for structured data). */
export type Crumb = { title: string; href?: string; plain?: boolean };

/** Breadcrumb trail; the last crumb is the current page and is not a link. */
export function Breadcrumbs({ items }: { items: readonly Crumb[] }) {
  return (
    <nav className="docs-breadcrumbs" aria-label="Breadcrumb">
      <ol>
        {items.map((item, index) => (
          <li key={`${index}-${item.title}`}>
            {item.href && !item.plain && index < items.length - 1 ? (
              <SiteLink href={item.href}>{item.title}</SiteLink>
            ) : (
              <span aria-current={index === items.length - 1 ? 'page' : undefined}>{item.title}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
