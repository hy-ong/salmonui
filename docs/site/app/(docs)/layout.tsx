import type { ReactNode } from 'react';
import { DocsNav } from '../../components/DocsNav';
import { getDocsNavGroups, getDocsNavTree } from '../../lib/site';

/** Docs chrome: sidebar navigation and the content column. */
export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="site-body">
      <DocsNav families={getDocsNavTree()} groups={getDocsNavGroups()} />
      <main className="site-main">{children}</main>
    </div>
  );
}
