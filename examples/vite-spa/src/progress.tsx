// Progress and Meter browser page (tests/browser/notifications-progress.spec.ts, NTF2):
//
//   ?scheme=light|dark   theme color scheme (default light)
//   ?dir=rtl             renders everything inside dir="rtl"
//   ?hydrate             renders the page to a string first and hydrates it

import { StrictMode, useState } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import '@salmonui/core/styles.css';
import '@salmonui/notifications/progress/styles.css';
import './app.css';
import { Meter, Progress } from '@salmonui/notifications/progress';
import { ThemeProvider } from '@salmonui/core/theme';

const params = new URLSearchParams(location.search);
const scheme = params.get('scheme') === 'dark' ? 'dark' : 'light';
const dir = params.get('dir') === 'rtl' ? 'rtl' : 'ltr';

function Page() {
  const [value, setValue] = useState(40);
  return (
    <ThemeProvider theme={{ colorScheme: scheme }} className="app">
      <div dir={dir} id="page" data-salmon-a11y-root="" style={{ display: 'grid', gap: 16, padding: 16, inlineSize: 400 }}>
        <button type="button" id="advance" onClick={() => setValue((v) => Math.min(100, v + 20))}>
          Advance
        </button>
        <Progress id="linear" aria-label="Upload" value={value} label />
        <Progress id="buffer" aria-label="Video" value={30} buffer={60} />
        <Progress id="indeterminate" aria-label="Connecting" value={null} />
        <Progress id="segments" aria-label="Steps" value={60} segments={5} />
        <Progress id="striped" aria-label="Striped" value={50} striped tone="success" />
        <div style={{ display: 'flex', gap: 16, alignItems: 'end' }}>
          <Progress id="circular" aria-label="Sync" shape="circular" value={value} label />
          <Progress id="circular-big" aria-label="Disk sync" shape="circular" size={96} thickness={8} value={75} buffer={90} label={<b>3/4</b>} />
          <Progress id="circular-spin" aria-label="Loading" shape="circular" value={null} />
          <Progress id="semicircle" aria-label="Score" shape="semicircle" size="lg" value={50} label />
          <Progress id="circular-seg" aria-label="Segments" shape="circular" value={50} segments={4} />
        </div>
        <Meter id="meter" aria-label="Disk usage" value={85} tone={(v) => (v !== null && v > 80 ? 'danger' : 'success')} valueLabel="85 of 100 GB" />
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
