// DashboardLayout browser page (tests/browser/dashboard-layout.spec.ts).
//
//   ?dir=rtl  ?scheme=dark  ?hydrate (server-render, then hydrate)
//
// window.__dash records onLayoutChange calls; window.__dashRenders counts renders of the main board.
// #main: 6 columns of 150 px with a 10 px gap (160 px pitch), 60 px rows (70 px pitch).
import { StrictMode, useState } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import '@salmonui/core/styles.css';
import '@salmonui/layout/dashboard-layout/styles.css';
import { DashboardLayout, type DashboardLayoutItem } from '@salmonui/layout/dashboard-layout';
import { ThemeProvider } from '@salmonui/core/theme';

declare global {
  interface Window {
    __dash?: DashboardLayoutItem[][];
    __dashRenders?: number;
  }
}

const params = new URLSearchParams(location.search);
const dir = params.get('dir') === 'rtl' ? 'rtl' : 'ltr';

const INITIAL: DashboardLayoutItem[] = [
  { id: 'sales', x: 0, y: 0, w: 2, h: 2, maxW: 4 },
  { id: 'traffic', x: 2, y: 0, w: 2, h: 2 },
  { id: 'pinned', x: 4, y: 0, w: 2, h: 1, static: true },
  { id: 'notes', x: 0, y: 2, w: 2, h: 1 },
];

function Main() {
  window.__dashRenders = (window.__dashRenders ?? 0) + 1;
  const [layout, setLayout] = useState<DashboardLayoutItem[]>(INITIAL);
  return (
    <DashboardLayout
      id="main"
      columns={6}
      gap={10}
      rowHeight={60}
      showGridLines
      resizable={['bottom-end', 'start']}
      layout={layout}
      onLayoutChange={(next) => ((window.__dash ??= []).push(next), setLayout(next))}
      className="board"
      style={{ inlineSize: 950 }}
    >
      <DashboardLayout.Panel id="sales" header="Sales">
        Sales chart
      </DashboardLayout.Panel>
      <DashboardLayout.Panel id="traffic" header="Traffic">
        <button type="button">Refresh</button>
      </DashboardLayout.Panel>
      <DashboardLayout.Panel id="pinned" header="Pinned">
        Static
      </DashboardLayout.Panel>
      <DashboardLayout.Panel id="notes" aria-label="Notes">
        Notes
      </DashboardLayout.Panel>
    </DashboardLayout>
  );
}

function Page() {
  return (
    <div id="page" data-salmon-a11y-root="" dir={dir} style={{ padding: 24, display: 'grid', gap: 24, background: 'var(--salmon-surface-base)', color: 'var(--salmon-text-primary)' }}>
      <Main />
      <div id="stack-wrap" style={{ inlineSize: 700 }}>
        <DashboardLayout
          id="stack"
          columns={4}
          cellAspectRatio={2}
          dragHandle=".salmon-dashboard-panel-header"
          responsive={{ stackBelow: 600 }}
          defaultLayout={[
            { id: 'one', x: 2, y: 0, w: 2, h: 1 },
            { id: 'two', x: 0, y: 0, w: 2, h: 2 },
          ]}
        >
          <DashboardLayout.Panel id="one" header="One">
            First
          </DashboardLayout.Panel>
          <DashboardLayout.Panel id="two" header="Two">
            Second
          </DashboardLayout.Panel>
        </DashboardLayout>
      </div>
    </div>
  );
}

const app = (
  <StrictMode>
    <ThemeProvider theme={{ colorScheme: params.get('scheme') === 'dark' ? 'dark' : 'light' }}>
      <Page />
    </ThemeProvider>
  </StrictMode>
);
const root = document.getElementById('root') as HTMLElement;
if (params.has('hydrate')) {
  root.innerHTML = renderToString(app);
  hydrateRoot(root, app);
} else createRoot(root).render(app);
