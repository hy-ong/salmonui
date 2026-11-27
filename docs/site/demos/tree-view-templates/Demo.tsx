'use client';
import { Badge } from '@salmonui/notifications/badge';
import { TreeView } from '@salmonui/navigation/tree-view';

// Placeholder links target this demo's own title, which exists on both the
// docs page and the demo page, so no link dangles in the static export.
const DEMO_ANCHOR = '#demo-tree-view-templates-title';

interface Page {
  id: string;
  title: string;
  href?: string;
  unread?: number;
  children?: Page[];
}

const pages: Page[] = [
  {
    id: 'guide',
    title: 'Guide',
    children: [
      { id: 'install', title: 'Installation', href: DEMO_ANCHOR },
      { id: 'theming', title: 'Theming', href: DEMO_ANCHOR, unread: 2 },
    ],
  },
  { id: 'inbox', title: 'Inbox', unread: 12, children: [{ id: 'today', title: 'Today', unread: 3 }] },
  { id: 'changelog', title: 'Changelog', href: DEMO_ANCHOR },
];

const folder = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <path d="M1 3h5l2 2h7v8H1z" />
  </svg>
);
const file = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor">
    <path d="M3 1.5h6l4 4v9H3z" />
  </svg>
);

export default function TreeViewTemplatesDemo() {
  return (
    <TreeView
      aria-label="Pages"
      data={pages}
      getItemId={(p) => p.id}
      getItemLabel={(p) => p.title}
      getChildren={(p) => p.children}
      getItemIcon={(p) => (p.children ? folder : file)}
      getItemHref={(p) => p.href}
      getItemProps={(p) => ({ title: p.href ? `Open ${p.title}` : p.title })}
      renderItem={(ctx) =>
        ctx.item.unread ? (
          <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
            {ctx.label}
            <Badge shape="pill" tone="primary" variant="solid">
              {ctx.item.unread}
            </Badge>
          </span>
        ) : undefined
      }
      expanded={['guide', 'inbox']}
      height={220}
      style={{ maxWidth: 360 }}
    />
  );
}
