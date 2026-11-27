'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

/**
 * A link that marks the current page with `aria-current="page"`. With
 * `section`, it also carries `data-active` while the path is under `href`
 * (top bar sections). The pathname is known during server rendering, so
 * the markup matches on hydration.
 */
export function NavLink({
  href,
  section = false,
  exclude,
  className,
  children,
}: {
  href: string;
  section?: boolean;
  /** Path prefixes that belong to another section (for example `/docs/reference` under `/docs`). */
  exclude?: readonly string[];
  className?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const current = pathname === href;
  const under = (prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);
  const active = current || (section && under(href) && !(exclude ?? []).some(under));
  return (
    <Link href={href} className={className} aria-current={current ? 'page' : undefined} data-active={active ? '' : undefined}>
      {children}
    </Link>
  );
}
