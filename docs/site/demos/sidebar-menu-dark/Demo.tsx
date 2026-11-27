'use client';
import { useState, type CSSProperties, type ReactNode } from 'react';
import { SidebarLayout, SidebarMain, SidebarPanel, SidebarTrigger } from '@salmonui/navigation/sidebar-layout';
import { SidebarMenu, type SidebarMenuEntry } from '@salmonui/navigation/sidebar-menu';

// Placeholder links target this demo's own title (no dangling links in the static export).
const DEMO_ANCHOR = '#demo-sidebar-menu-dark-title';

const glyph = (d: string): ReactNode => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

// A dark sider: normally set once in the theme, not per component.
const DARK_SIDER = {
  '--salmon-surface-sidebar-bg': '#192225',
  '--salmon-surface-sidebar-fg': 'rgba(255, 255, 255, 0.85)',
  '--salmon-surface-sidebar-hover': 'rgba(255, 255, 255, 0.08)',
  '--salmon-surface-sidebar-selected-bg': '#3a484c',
  '--salmon-surface-sidebar-selected-fg': '#ffffff',
  '--salmon-surface-sidebar-border': 'rgba(255, 255, 255, 0.12)',
  background: 'var(--salmon-surface-sidebar-bg)',
  borderInlineEnd: 0,
} as CSSProperties;

const ITEMS: SidebarMenuEntry[] = [
  {
    type: 'group',
    id: 'workspace',
    label: '工作區',
    children: [
      { id: 'overview', label: '總覽', href: DEMO_ANCHOR, icon: glyph('M2 9h5V2H2zM9 14h5V7H9zM2 14h5v-3H2zM9 5h5V2H9z') },
      { id: 'analytics', label: '數據分析', href: DEMO_ANCHOR, icon: glyph('M2 14h12M4 11V7M8 11V3M12 11V6') },
      { id: 'orders', label: '訂單管理', href: DEMO_ANCHOR, icon: glyph('M2 2h2l2 8h7l1-5H5M6.5 13.5h.01M12 13.5h.01') },
    ],
  },
  {
    type: 'group',
    id: 'operations',
    label: '營運',
    children: [
      {
        id: 'commerce',
        label: '商務中心',
        icon: glyph('M2 6l1-4h10l1 4M3 6v8h10V6M6 14v-4h4v4'),
        children: [
          { id: 'products', label: '商品目錄', href: DEMO_ANCHOR },
          { id: 'promotions', label: '促銷活動', href: DEMO_ANCHOR },
          { id: 'subscriptions', label: '訂閱方案', href: DEMO_ANCHOR },
        ],
      },
      {
        id: 'customers',
        label: '客戶關係',
        icon: glyph('M6 7a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM1.5 14c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4M11 2.5a2.5 2.5 0 010 4.5M14.5 14c0-2-1-3.3-2.5-3.8'),
        children: [
          { id: 'segments', label: '客群管理', href: DEMO_ANCHOR },
          { id: 'support', label: '服務案件', href: DEMO_ANCHOR },
          { id: 'feedback', label: '回饋中心', href: DEMO_ANCHOR },
        ],
      },
      { id: 'payments', label: '金流管理', href: DEMO_ANCHOR, icon: glyph('M2 4h12v8H2zM2 7h12') },
    ],
  },
  {
    type: 'group',
    id: 'system',
    label: '系統',
    children: [
      { id: 'integrations', label: '整合服務', href: DEMO_ANCHOR, icon: glyph('M8 15A7 7 0 108 1a7 7 0 000 14zM1 8h14M8 1c2 2 2.8 4.5 2.8 7S10 13 8 15M8 1C6 3 5.2 5.5 5.2 8S6 13 8 15') },
      { id: 'settings', label: '系統設定', href: DEMO_ANCHOR, icon: glyph('M8 10a2 2 0 100-4 2 2 0 000 4zM8 1v2M8 13v2M1 8h2M13 8h2') },
    ],
  },
];

export default function SidebarMenuDarkDemo() {
  const [collapsed, setCollapsed] = useState(false);
  const [selected, setSelected] = useState<string | null>('promotions');
  return (
    <SidebarLayout
      collapsed={collapsed}
      onCollapsedChange={setCollapsed}
      size="216px"
      railSize="64px"
      style={{ blockSize: 560, border: '1px solid var(--salmon-border-default)', borderRadius: 'var(--salmon-radius-lg)' }}
    >
      <SidebarPanel navigation style={DARK_SIDER} aria-label="主選單">
        <SidebarMenu landmark={false} items={ITEMS} collapsed={collapsed} selected={selected} onSelectedChange={setSelected} defaultExpanded="all" dividers />
      </SidebarPanel>
      <SidebarMain>
        <div style={{ padding: 12 }}>
          <SidebarTrigger action="collapse" />
          <p className="demo-status" aria-live="polite">
            Selected: {selected ?? 'none'}
          </p>
        </div>
      </SidebarMain>
    </SidebarLayout>
  );
}
