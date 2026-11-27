// Browser page of tests/browser/data-grid-theme.spec.ts: the Data Grid under
// a theme's density and `tableHeader` surface.
//
//   ?density=compact   ThemeProvider density 'compact' (32 px rows, 36 px header, 13 px text, 10 px padding)
//   ?surface           surfaces.tableHeader: 'primary' with primary #0e4d5c
//   ?dir=rtl           right-to-left grid
//
// The grid sorts by Name, has a pinned ID column, a selection column (select
// all), resizable columns, column menus and filter menus.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@salmonui/core/styles.css';
import '@salmonui/data-grid/styles.css';
import './app.css';
import { DataGrid, type DataGridApi, type DataGridColumn } from '@salmonui/data-grid';
import { ThemeProvider, type SalmonThemeInput } from '@salmonui/core/theme';
import { ThemeStyle } from '@salmonui/core/server';

interface Person {
  readonly id: string;
  readonly name: string;
  readonly city: string;
  readonly age: number;
}

const w = window as unknown as { __gridApi?: DataGridApi<Person> | null; __mountMs?: number };
const params = new URLSearchParams(location.search);
const CITIES = ['Lisbon', 'Oslo', 'Kyoto', 'Lima', 'Accra'];
const rows: Person[] = Array.from({ length: 200 }, (_, i) => ({ id: `p${i}`, name: `Person ${i}`, city: CITIES[i % CITIES.length] as string, age: 20 + (i % 50) }));
const columns: DataGridColumn<Person>[] = [
  { type: 'selection' },
  { field: 'id', header: 'ID', primaryKey: true, width: 90, pinned: 'start' },
  { field: 'name', header: 'Name', width: 180 },
  { field: 'city', header: 'City', width: 160 },
  { field: 'age', header: 'Age', type: 'number', width: 120 },
];

const theme: SalmonThemeInput | null =
  params.has('density') || params.has('surface')
    ? {
        ...(params.get('density') === 'compact' ? { density: 'compact' as const } : {}),
        ...(params.has('surface') ? { colors: { primary: '#0e4d5c' as const }, surfaces: { tableHeader: 'primary' as const } } : {}),
      }
    : null;

function Page() {
  const grid = (
    <DataGrid<Person>
      aria-label="People"
      data={rows}
      columns={columns}
      height={400}
      dir={params.get('dir') === 'rtl' ? 'rtl' : 'ltr'}
      selection={{ multiple: true }}
      sorting={{ sortBy: [{ field: 'name', direction: 'asc' }] }}
      filtering={{ ui: 'menu' }}
      columnMenu
      resizable
      ref={(api) => {
        w.__gridApi = api;
      }}
    />
  );
  return (
    <main className="app">
      {theme ? (
        <ThemeProvider theme={theme}>
          <ThemeStyle theme={theme} />
          {grid}
        </ThemeProvider>
      ) : (
        grid
      )}
    </main>
  );
}

const start = performance.now();
createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <Page />
  </StrictMode>,
);
requestAnimationFrame(() => {
  setTimeout(() => {
    w.__mountMs = performance.now() - start;
  }, 0);
});
