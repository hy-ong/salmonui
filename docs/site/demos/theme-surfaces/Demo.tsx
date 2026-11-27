'use client';

import type { ReactNode } from 'react';
import { Avatar } from '@salmonui/layout/avatar';
import { BreadcrumbItem, Breadcrumbs } from '@salmonui/navigation/breadcrumbs';
import { Button } from '@salmonui/buttons/button';
import { DataGrid, type DataGridColumn } from '@salmonui/data-grid';
import { SidebarLayout, SidebarMain, SidebarPanel } from '@salmonui/navigation/sidebar-layout';
import { SidebarMenu, type SidebarMenuEntry, type SidebarMenuItem } from '@salmonui/navigation/sidebar-menu';
import { ThemeStyle } from '@salmonui/core/server';
import { ThemeProvider, type SalmonThemeInput } from '@salmonui/core/theme';
import { createOrders, type Order } from '../../lib/fixtures';

const theme: SalmonThemeInput = {
  colors: { primary: '#0e4d5c', success: '#0c8f54', warning: '#d4690b', danger: '#d62f23', info: '#0e4d5c' },
  colorScheme: 'light',
  neutral: { chroma: 0.032 },
  surfaces: { sidebar: '#192225', appBar: '#ffffff', tableHeader: 'primary' },
};

const orders = createOrders(40, 11);

const columns: DataGridColumn<Order>[] = [
  { type: 'selection' },
  { field: 'id', header: 'Order', primaryKey: true, width: 110 },
  { field: 'customer', header: 'Customer', width: 140 },
  { field: 'product', header: 'Product', width: 140 },
  { field: 'amount', header: 'Amount', type: 'number', format: 'C2', align: 'end', width: 110 },
];

// Placeholder links target this demo's own title, which exists on both the
// docs page and the demo page, so no link dangles in the static export.
const HREF = '#demo-theme-surfaces-title';

const glyph = (d: string) => (
  <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

const leaf = (id: string, label: string, icon: ReactNode): SidebarMenuItem => ({ id, label, href: HREF, icon });

const MENU: SidebarMenuEntry[] = [
  {
    type: 'group',
    id: 'workspace',
    label: 'Workspace',
    children: [
      leaf('overview', 'Overview', glyph('M2 2h5v5H2zM9 2h5v5H9zM2 9h5v5H2zM9 9h5v5H9z')),
      leaf('orders', 'Orders', glyph('M2 3h1.5l1.5 7h8l1.5-5H4.5M6 13.5h.01M12 13.5h.01')),
      leaf('customers', 'Customers', glyph('M6 7a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM1.5 14c0-2.5 2-4.5 4.5-4.5s4.5 2 4.5 4.5M11 2.5a2.5 2.5 0 0 1 0 4.5M12.5 9.8c1.2.6 2 2 2 4.2')),
    ],
  },
  {
    type: 'group',
    id: 'system',
    label: 'System',
    children: [
      leaf('settings', 'Settings', glyph('M8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4')),
      leaf('help', 'Help', glyph('M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM6 6a2 2 0 1 1 2.5 2c-.3.1-.5.4-.5.7V10M8 12h.01')),
    ],
  },
];

export default function ThemeSurfacesDemo() {
  return (
    <>
      <ThemeStyle theme={theme} />
      <ThemeProvider theme={theme}>
        <SidebarLayout size="13rem" style={{ blockSize: 420, border: '1px solid var(--salmon-border-default)', borderRadius: 'var(--salmon-radius-lg)', overflow: 'hidden' }}>
          {/* SidebarPanel carries data-salmon-surface="sidebar"; SidebarMenu reads the --salmon-surface-sidebar-* variables. */}
          <SidebarPanel navigation aria-label="Admin navigation">
            <SidebarMenu landmark={false} items={MENU} defaultSelected="orders" />
          </SidebarPanel>
          <SidebarMain style={{ display: 'flex', flexDirection: 'column', minBlockSize: 0, background: 'var(--salmon-surface-base)' }}>
            {/* The application's own top bar opts in to the app bar surface. */}
            <header className="salmon-app-bar" data-salmon-surface="app-bar" style={{ justifyContent: 'space-between' }}>
              <Breadcrumbs>
                <BreadcrumbItem href={HREF}>Workspace</BreadcrumbItem>
                <BreadcrumbItem>Orders</BreadcrumbItem>
              </Breadcrumbs>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <Avatar name="Olivia Lin" size={22} shape="circle" />
                Olivia
              </span>
            </header>
            <div style={{ display: 'grid', gap: 8, padding: 12, minBlockSize: 0, flex: '1 1 auto', gridTemplateRows: 'auto minmax(0, 1fr)' }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button tone="primary">New order</Button>
                <Button variant="outline">Export</Button>
              </div>
              {/* The grid header carries data-salmon-surface="table-header": the primary seed with a derived foreground. */}
              <DataGrid<Order>
                aria-label="Orders"
                data={orders}
                columns={columns}
                height="100%"
                sorting
                selection={{ multiple: true, rowIds: ['ORD-10002'] }}
                locale="en-US"
                currency="USD"
                timeZone="UTC"
              />
            </div>
          </SidebarMain>
        </SidebarLayout>
      </ThemeProvider>
    </>
  );
}
