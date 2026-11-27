// Pager browser page (tests/browser/pager.spec.ts, pager-a11y.spec.ts; navigation):
//
//   ?dir=rtl  ?scheme=dark
//   ?mode=hydrate   server-renders the page with renderToString, then hydrates it (window.__hydrated)
//
// Every callback appends to window.__events. Pagers:
//   #basic       uncontrolled, 1000 items, pageSizeOptions true
//   #controlled  page and pageSize in React state; onBeforePageChange vetoes page 5;
//                onBeforePageSizeChange vetoes 100; window.__setPage(n) drives it
//   #unknown     totalCount null, hasNextPage until page 5
//   #template    renderPager with a custom "More" button
//   #narrow      in a 360 px wide box (container-query layout)
//   #switch      page switches from uncontrolled to controlled (#make-controlled)
import { StrictMode, useState } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import '@salmonui/core/styles.css';
import '@salmonui/navigation/pager/styles.css';
import { Pager } from '@salmonui/navigation/pager';
import { ThemeProvider } from '@salmonui/core/theme';

const params = new URLSearchParams(location.search);
const win = window as unknown as { __events: unknown[]; __setPage?: (page: number) => void; __hydrated?: boolean };
win.__events = [];
const log = (...entry: unknown[]): void => void win.__events.push(entry);

function Controlled() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  win.__setPage = setPage;
  return (
    <Pager
      id="controlled"
      aria-label="Controlled pages"
      page={page}
      pageSize={pageSize}
      totalCount={200}
      pageSizeOptions={[10, 20, 50, 100, 'all']}
      onBeforePageChange={(e) => {
        log('before', e.page, e.previousPage, e.source, e.reason, Object.isFrozen(e));
        if (e.page === 5) e.preventDefault();
      }}
      onPageChange={(e) => {
        log('page', e.page, e.previousPage, e.source, e.reason, Object.isFrozen(e));
        setPage(e.page);
      }}
      onBeforePageSizeChange={(e) => {
        log('beforeSize', e.pageSize, e.previousPageSize, e.page);
        if (e.pageSize === 100) e.preventDefault();
      }}
      onPageSizeChange={(e) => {
        log('size', e.pageSize, e.previousPageSize, e.page, e.previousPage, e.source, Object.isFrozen(e));
        setPageSize(e.pageSize);
      }}
    />
  );
}

function Unknown() {
  const [page, setPage] = useState(1);
  return <Pager id="unknown" aria-label="Unknown total" page={page} totalCount={null} hasNextPage={page < 5} onPageChange={(e) => setPage(e.page)} />;
}

function Switch() {
  const [page, setPage] = useState<number | undefined>(undefined);
  return (
    <>
      <Pager id="switch" aria-label="Switching" {...(page !== undefined ? { page } : {})} totalCount={50} />
      <button id="make-controlled" type="button" onClick={() => setPage(2)}>
        Make controlled
      </button>
    </>
  );
}

function Page() {
  return (
    <ThemeProvider theme={{ colorScheme: params.get('scheme') === 'dark' ? 'dark' : 'light' }}>
      <main dir={params.get('dir') === 'rtl' ? 'rtl' : 'ltr'} style={{ padding: 24, color: 'var(--salmon-text-primary)', background: 'var(--salmon-surface-base)' }} data-salmon-a11y-root="">
        <h1>Pager</h1>
        <Pager id="basic" aria-label="Basic pages" totalCount={1000} pageSizeOptions onPageChange={(e) => log('basic', e.page, e.source)} onPageSizeChange={(e) => log('basicSize', e.pageSize, e.page)} />
        <Controlled />
        <Unknown />
        <Pager
          id="template"
          aria-label="Template pages"
          totalCount={30}
          pageSize={10}
          renderPager={(ctx) => (
            <button type="button" id="more" disabled={!ctx.hasNextPage} onClick={() => ctx.goToPage(ctx.page + 1)}>
              Load page {ctx.page + 1} of {ctx.pageCount}
            </button>
          )}
          onPageChange={(e) => log('template', e.page, e.source)}
        />
        <div style={{ width: 360 }}>
          <Pager id="narrow" aria-label="Narrow pages" totalCount={500} defaultPage={10} />
        </div>
        <Switch />
      </main>
    </ThemeProvider>
  );
}

const root = document.getElementById('root')!;
if (params.get('mode') === 'hydrate') {
  root.innerHTML = renderToString(
    <StrictMode>
      <Page />
    </StrictMode>,
  );
  hydrateRoot(
    root,
    <StrictMode>
      <Page />
    </StrictMode>,
    { onRecoverableError: (error) => console.error('recoverable', error) },
  );
  requestAnimationFrame(() => (win.__hydrated = true));
} else {
  createRoot(root).render(
    <StrictMode>
      <Page />
    </StrictMode>,
  );
}
