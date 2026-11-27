// Splitter browser page (tests/browser/splitter.spec.ts).
//
//   ?dir=rtl  ?scheme=dark  ?hydrate (server-render, then hydrate)
//
// window.__splitter records callbacks; window.__splitterRenders counts renders of the main splitter.
import { StrictMode, useState } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import '@salmonui/core/styles.css';
import '@salmonui/layout/splitter/styles.css';
import { Splitter, type SplitterSize } from '@salmonui/layout/splitter';
import { ThemeProvider } from '@salmonui/core/theme';

declare global {
  interface Window {
    __splitter?: Record<string, unknown>[];
    __splitterRenders?: number;
  }
}

const params = new URLSearchParams(location.search);
const dir = params.get('dir') === 'rtl' ? 'rtl' : 'ltr';
const push = (entry: Record<string, unknown>) => (window.__splitter ??= []).push(entry);

function Main() {
  window.__splitterRenders = (window.__splitterRenders ?? 0) + 1;
  const [sizes, setSizes] = useState<Record<string, SplitterSize>>({ nav: 200 });
  return (
    <Splitter
      id="main"
      sizes={sizes}
      onSizesChange={(s) => (push({ kind: 'sizes', ...s }), setSizes(s))}
      onResizeStart={(ids) => push({ kind: 'start', ids })}
      onResize={(s) => push({ kind: 'resize', ...s })}
      style={{ height: 240, border: '1px solid var(--salmon-border-default)' }}
      localeText={{ resizePane: 'Resize navigation' }}
    >
      <Splitter.Pane id="nav" minSize={120} maxSize={400} collapsible collapsedSize={24} onCollapsedChange={(c) => push({ kind: 'collapse', pane: 'nav', collapsed: c })} className="nav-pane">
        Navigation
      </Splitter.Pane>
      <Splitter.Pane id="content">
        <Splitter id="nested" orientation="vertical" defaultSizes={{ top: '40%' }}>
          <Splitter.Pane id="top" minSize="20%">
            Top
          </Splitter.Pane>
          <Splitter.Pane id="bottom">Bottom</Splitter.Pane>
        </Splitter>
      </Splitter.Pane>
      <Splitter.Pane id="side" defaultSize="25%" resizable={false}>
        Side
      </Splitter.Pane>
    </Splitter>
  );
}

function Page() {
  return (
    <div id="page" data-salmon-a11y-root="" dir={dir} style={{ padding: 24, display: 'grid', gap: 24, width: 900, background: 'var(--salmon-surface-base)', color: 'var(--salmon-text-primary)' }}>
      <Main />
      <Splitter
        id="array"
        panes={[
          { id: 'a', content: 'A', defaultSize: '30%' },
          { id: 'b', content: 'B' },
        ]}
        disabled
        style={{ height: 80 }}
      />
      <Splitter id="vetoed" style={{ height: 80 }}>
        <Splitter.Pane id="left" collapsible defaultSize={300} onCollapsedChange={(c, e) => (push({ kind: 'veto', collapsed: c }), e.preventDefault())}>
          Left
        </Splitter.Pane>
        <Splitter.Pane id="right">Right</Splitter.Pane>
      </Splitter>
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
