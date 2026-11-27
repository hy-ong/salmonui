// Spinner and Skeleton browser page (tests/browser/notifications-spinner-skeleton.spec.ts, NTF1):
//
//   ?scheme=light|dark   theme color scheme (default light)
//   ?dir=rtl             renders everything inside dir="rtl"
//   ?hydrate             renders the page to a string first and hydrates it
import { StrictMode, useState } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import '@salmonui/core/styles.css';
import '@salmonui/notifications/skeleton/styles.css';
import '@salmonui/notifications/spinner/styles.css';
import './app.css';
import { Spinner } from '@salmonui/notifications/spinner';
import { Skeleton } from '@salmonui/notifications/skeleton';
import { ThemeProvider } from '@salmonui/core/theme';

const params = new URLSearchParams(location.search);
const scheme = params.get('scheme') === 'dark' ? 'dark' : 'light';
const dir = params.get('dir') === 'rtl' ? 'rtl' : 'ltr';

function Page() {
  const [loading, setLoading] = useState(true);
  return (
    <ThemeProvider theme={{ colorScheme: scheme }} className="app">
      <div dir={dir} id="page" data-salmon-a11y-root="" style={{ display: 'grid', gap: 16, padding: 16, maxWidth: 480 }}>
        <section aria-label="Spinners" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Spinner id="spin-named" label="Loading orders" />
          <Spinner id="spin-sm" size="sm" />
          <Spinner id="spin-lg" size="lg" />
          <Spinner id="spin-custom" size={40} />
        </section>
        <button type="button" id="toggle" onClick={() => setLoading((v) => !v)}>
          Toggle loading
        </button>
        <Spinner id="spin-wrap" loading={loading} label="Saving form">
          <form id="form" style={{ display: 'grid', gap: 8, padding: 8 }}>
            <label>
              Name <input id="name" />
            </label>
            <button type="button" id="inner">
              Save
            </button>
          </form>
        </Spinner>
        <div id="card" style={{ position: 'relative', blockSize: 80, border: '1px solid' }} aria-busy="true">
          <Spinner id="spin-overlay" overlay />
        </div>
        <section aria-label="Skeletons" style={{ display: 'grid', gap: 8 }}>
          <Skeleton id="sk-text" />
          <Skeleton id="sk-lines" lines={3} />
          <Skeleton id="sk-circle" shape="circle" />
          <Skeleton id="sk-rect" shape="rect" width={160} height={60} />
          <Skeleton id="sk-pulse" animation="pulse" />
          <Skeleton id="sk-static" animation={false} />
          <Skeleton id="sk-content" loading={loading}>
            <button type="button" id="sk-inner" style={{ inlineSize: 200, blockSize: 48 }}>
              Loaded content
            </button>
          </Skeleton>
        </section>
      </div>
    </ThemeProvider>
  );
}

const root = document.getElementById('root') as HTMLElement;
const app = (
  <StrictMode>
    <Page />
  </StrictMode>
);
if (params.has('hydrate')) {
  root.innerHTML = renderToString(app);
  hydrateRoot(root, app, { onRecoverableError: (error) => console.error('recoverable', error) });
} else {
  createRoot(root).render(app);
}
