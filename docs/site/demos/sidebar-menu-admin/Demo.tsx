'use client';
import { useState, type MouseEvent, type ReactNode } from 'react';
import { SidebarMenu, type SidebarMenuEntry, type SidebarMenuLinkProps } from '@salmonui/navigation/sidebar-menu';

// Links render through a stand-in router: the real path lives in state, the
// href points at this demo's own title so no link dangles in the static export.
const DEMO_ANCHOR = '#demo-sidebar-menu-admin-title';

const glyph = (d: string): ReactNode => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

const ITEMS: SidebarMenuEntry[] = [
  {
    type: 'group',
    id: 'workspace',
    label: 'Workspace',
    children: [
      { id: '/workspace/overview', label: 'Overview', href: '/workspace/overview', icon: glyph('M2 9h5V2H2zM9 14h5V7H9zM2 14h5v-3H2zM9 5h5V2H9z') },
      { id: '/workspace/analytics', label: 'Analytics', href: '/workspace/analytics', icon: glyph('M2 14h12M4 11V7M8 11V3M12 11V6') },
      { id: '/workspace/orders', label: 'Orders', href: '/workspace/orders', icon: glyph('M2 2h2l2 8h7l1-5H5M6.5 13.5h.01M12 13.5h.01') },
    ],
  },
  {
    type: 'group',
    id: 'operations',
    label: 'Operations',
    children: [
      {
        id: 'commerce',
        label: 'Commerce',
        icon: glyph('M2 6l1-4h10l1 4M3 6v8h10V6M6 14v-4h4v4'),
        children: [
          { id: '/operations/commerce/products', label: 'Products', href: '/operations/commerce/products' },
          { id: '/operations/commerce/promotions', label: 'Promotions', href: '/operations/commerce/promotions' },
        ],
      },
      { id: '/operations/payments', label: 'Payments', href: '/operations/payments', icon: glyph('M2 4h12v8H2zM2 7h12') },
    ],
  },
  {
    type: 'group',
    id: 'system',
    label: 'System',
    children: [{ id: '/system/settings', label: 'Settings', href: '/system/settings', icon: glyph('M8 10a2 2 0 100-4 2 2 0 000 4zM8 1v2M8 13v2M1 8h2M13 8h2') }],
  },
];

export default function SidebarMenuAdminDemo() {
  const [path, setPath] = useState('/workspace/orders');
  const [last, setLast] = useState('nothing yet');
  // With a real router, return its link: `<Link to={props.href} {...props} />`.
  const renderLink = (props: SidebarMenuLinkProps) => (
    <a
      {...props}
      href={DEMO_ANCHOR}
      data-path={props.href}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        setPath(props.href);
      }}
    />
  );
  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <div style={{ inlineSize: 232, border: '1px solid var(--salmon-border-subtle)', borderRadius: 'var(--salmon-radius-lg)', background: 'var(--salmon-surface-raised)' }}>
        <SidebarMenu
          aria-label="Admin"
          items={ITEMS}
          selected={path}
          defaultExpanded="all"
          renderLink={renderLink}
          onItemClick={(item, event) => setLast(`${String(item.label)}${event.metaKey || event.ctrlKey || event.shiftKey ? ' (modified click: not selected)' : ''}`)}
        />
      </div>
      <div className="demo-stack">
        <p className="demo-status" aria-live="polite">
          Current path: <code>{path}</code>
        </p>
        <p className="demo-status">Last item click: {last}</p>
      </div>
    </div>
  );
}
