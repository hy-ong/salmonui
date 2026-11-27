'use client';
import { useState, type ReactNode } from 'react';
import { SidebarLayout, SidebarMain, SidebarPanel, SidebarTrigger } from '@salmonui/navigation/sidebar-layout';
import { SidebarMenu, type SidebarMenuEntry } from '@salmonui/navigation/sidebar-menu';

// Placeholder links target this demo's own title (no dangling links in the static export).
const DEMO_ANCHOR = '#demo-sidebar-menu-rail-title';

const glyph = (d: string): ReactNode => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

const ITEMS: SidebarMenuEntry[] = [
  { id: 'overview', label: 'Overview', href: DEMO_ANCHOR, icon: glyph('M2 9h5V2H2zM9 14h5V7H9zM2 14h5v-3H2zM9 5h5V2H9z') },
  { id: 'analytics', label: 'Analytics', href: DEMO_ANCHOR, icon: glyph('M2 14h12M4 11V7M8 11V3M12 11V6') },
  {
    id: 'commerce',
    label: 'Commerce',
    icon: glyph('M2 6l1-4h10l1 4M3 6v8h10V6M6 14v-4h4v4'),
    children: [
      { id: 'products', label: 'Products', href: DEMO_ANCHOR },
      { id: 'promotions', label: 'Promotions', href: DEMO_ANCHOR },
      { id: 'subscriptions', label: 'Subscriptions', href: DEMO_ANCHOR },
    ],
  },
  {
    id: 'customers',
    label: 'Customers',
    icon: glyph('M6 7a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM1.5 14c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4M11 2.5a2.5 2.5 0 010 4.5M14.5 14c0-2-1-3.3-2.5-3.8'),
    children: [
      { id: 'segments', label: 'Segments', href: DEMO_ANCHOR },
      { id: 'support', label: 'Support cases', href: DEMO_ANCHOR },
    ],
  },
  { id: 'settings', label: 'Settings', href: DEMO_ANCHOR, icon: glyph('M8 10a2 2 0 100-4 2 2 0 000 4zM8 1v2M8 13v2M1 8h2M13 8h2') },
];

export default function SidebarMenuRailDemo() {
  const [collapsed, setCollapsed] = useState(true);
  const [selected, setSelected] = useState<string | null>('products');
  return (
    <SidebarLayout
      collapsed={collapsed}
      onCollapsedChange={setCollapsed}
      size="14rem"
      railSize="64px"
      style={{ blockSize: 320, border: '1px solid var(--salmon-border-default)', borderRadius: 'var(--salmon-radius-lg)' }}
    >
      <SidebarPanel aria-label="Rail panel">
        <SidebarMenu aria-label="Rail navigation" items={ITEMS} collapsed={collapsed} selected={selected} onSelectedChange={setSelected} />
      </SidebarPanel>
      <SidebarMain>
        <div style={{ padding: 12 }}>
          <SidebarTrigger action="collapse" />
          <p className="demo-status" aria-live="polite">
            Selected: {selected ?? 'none'} · {collapsed ? 'rail' : 'expanded'}
          </p>
        </div>
      </SidebarMain>
    </SidebarLayout>
  );
}
