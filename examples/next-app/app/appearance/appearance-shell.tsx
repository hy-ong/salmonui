'use client';

import { useEffect } from 'react';
import { Button } from '@salmonui/buttons/button';
import { ThemeProvider } from '@salmonui/core/theme';
import { DataGrid, type DataGridColumn } from '@salmonui/data-grid';
import { SidebarLayout, SidebarMain, SidebarPanel } from '@salmonui/navigation/sidebar-layout';
import '@salmonui/buttons/button/styles.css';
import '@salmonui/navigation/sidebar-layout/styles.css';
import { appearanceTheme } from './theme';

interface Row {
  readonly id: string;
  readonly order: string;
  readonly owner: string;
  readonly total: number;
}

// Deterministic rows: identical on the server and the client.
const rows: Row[] = Array.from({ length: 40 }, (_, i) => ({ id: `r${i}`, order: `SO-${1000 + i}`, owner: ['Aiko', 'Bao', 'Chen', 'Dewi'][i % 4] as string, total: (i * 7919) % 10_000 }));

const columns: DataGridColumn<Row>[] = [
  { type: 'selection' },
  { field: 'id', header: 'Id', primaryKey: true, width: 80 },
  { field: 'order', header: 'Order', width: 140 },
  { field: 'owner', header: 'Owner', width: 160 },
  { field: 'total', header: 'Total', type: 'number', align: 'end', width: 120 },
];

export function AppearanceShell() {
  useEffect(() => {
    window.__hydrated = true;
  }, []);
  return (
    <ThemeProvider theme={appearanceTheme}>
      <SidebarLayout style={{ height: 480 }}>
        <SidebarPanel navigation aria-label="Main">
          <p style={{ margin: 0, padding: '8px 16px', color: 'var(--salmon-text-secondary)', fontSize: 11 }}>Workspace</p>
          <a href="#orders" aria-current="page" style={{ display: 'block', margin: '0 8px', padding: '6px 8px', borderRadius: 6, color: 'var(--salmon-surface-sidebar-selected-fg)', background: 'var(--salmon-surface-sidebar-selected-bg)' }}>
            Orders
          </a>
        </SidebarPanel>
        <SidebarMain>
          <header data-salmon-surface="app-bar" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', blockSize: 48, borderBlockEnd: '1px solid var(--salmon-border-subtle)' }}>
            <strong>Orders</strong>
            <span style={{ flex: 1 }} />
            <Button>Export</Button>
            <Button tone="primary" variant="solid">
              New order
            </Button>
          </header>
          <div style={{ padding: 12 }}>
            <DataGrid<Row> aria-label="Orders" data={rows} columns={columns} height={320} locale="en-US" />
          </div>
        </SidebarMain>
      </SidebarLayout>
    </ThemeProvider>
  );
}
