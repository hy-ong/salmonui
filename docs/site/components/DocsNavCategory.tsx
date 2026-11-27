'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

/**
 * One disclosure of the docs sidebar, a family or a component with several
 * pages: a native `<details>`, so it works without JavaScript. It is open
 * while the path is one of `pages` or under one of `prefixes`; the pathname
 * is known during server rendering, so the `open` attribute matches on
 * hydration.
 */
export function DocsNavCategory({
  level,
  id,
  title,
  prefixes = [],
  pages = [],
  children,
}: {
  level: 'family' | 'component';
  id: string;
  title: string;
  prefixes?: readonly string[] | undefined;
  pages?: readonly string[] | undefined;
  children: ReactNode;
}) {
  const raw = usePathname();
  const pathname = raw.length > 1 && raw.endsWith('/') ? raw.slice(0, -1) : raw;
  const open = pages.includes(pathname) || prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  return (
    <details
      className={`docs-nav__category docs-nav__category--${level}`}
      open={open}
      data-family={level === 'family' ? id : undefined}
      data-component={level === 'component' ? id : undefined}
    >
      <summary>{title}</summary>
      {children}
    </details>
  );
}
