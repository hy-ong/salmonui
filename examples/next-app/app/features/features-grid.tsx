'use client';

// A grid with a render feature (`paging`, a feature chunk): the
// server renders the pager synchronously (static registry); on the client the
// grid's own Suspense boundary keeps the server HTML until the paging chunk
// arrives, then hydrates. `onReady` fires after the real grid committed.
import { DataGrid, type DataGridColumn } from '@salmonui/data-grid';
import { ThemeProvider } from '@salmonui/core/theme';
import { theme } from '../theme';

declare global {
  interface Window {
    __gridReady?: boolean;
  }
}

interface Item {
  readonly id: string;
  readonly name: string;
  readonly qty: number;
}

// Deterministic data: identical on the server and the client.
const items: Item[] = Array.from({ length: 200 }, (_, i) => ({ id: `i${i}`, name: `Item ${i}`, qty: (i * 37) % 100 }));

const columns: DataGridColumn<Item>[] = [
  { field: 'id', header: 'Item', primaryKey: true, width: 100 },
  { field: 'name', header: 'Name', width: 180 },
  { field: 'qty', header: 'Quantity', type: 'number', align: 'end', width: 120 },
];

const paging = { pageSize: 20 } as const;

function markReady(): void {
  window.__gridReady = true;
}

export function FeaturesGrid() {
  return (
    <ThemeProvider theme={theme} className="app">
      <h1 id="features-title">Render features (Next.js App Router)</h1>
      <DataGrid<Item> aria-labelledby="features-title" data={items} columns={columns} height={480} timeZone="UTC" locale="en-US" paging={paging} onReady={markReady} />
    </ThemeProvider>
  );
}
