import { StrictMode } from 'react';
import { renderToPipeableStream, renderToString } from 'react-dom/server';
import type { Writable } from 'node:stream';
import { paging } from '@salmonui/data-grid/features';
import { App, featuresOf } from './App.tsx';
import { Dropdowns } from './Dropdowns.tsx';
import { LocalePage } from './Locale.tsx';
import { Pickers } from './Pickers.tsx';
import { Pivot } from './Pivot.tsx';
import { KanbanPage } from './Kanban.tsx';
import { AssistantPage } from './Assistant.tsx';
import { pageOf } from './pages.ts';

// server.mjs picks the HTML template of the page (one client entry per page, src/entries/).
export { pageOf, templateOf } from './pages.ts';

/** `url`: the request URL; `?newrow` turns on the always-visible add row (hydration check), `?features=` render features. */
export function render(url = '/'): string {
  return renderToString(app(url));
}

/** `?stream`: the same app through `renderToPipeableStream` (streaming SSR, piped from the shell). */
export function renderStream(url: string, out: Writable): Promise<void> {
  return new Promise((resolve, reject) => {
    const stream = renderToPipeableStream(app(url), {
      onShellReady() {
        stream.pipe(out);
        resolve();
      },
      onShellError: reject,
    });
  });
}

function app(url: string) {
  return <StrictMode>{page(url)}</StrictMode>;
}

/**
 * The page of `url`, as its client entry (src/entries/<page>.tsx) hydrates it. `?suspense`: the grid inside an
 * app-level Suspense boundary (the boundary a gated grid suspends while hydrating).
 */
function page(url: string) {
  switch (pageOf(url)) {
    case 'pickers':
      return <Pickers />;
    case 'pivot':
      return <Pivot />;
    case 'kanban':
      return <KanbanPage />;
    case 'assistant':
      return <AssistantPage />;
    case 'dropdowns':
      return <Dropdowns />;
    case 'locale':
      return <LocalePage />;
    case 'grid': {
      const params = new URL(url, 'http://localhost').searchParams;
      const features = featuresOf(url);
      return <App newRow={params.has('newrow')} features={features} suspense={params.has('suspense')} {...(features.includes('preload') ? { preloaded: [paging] } : {})} />;
    }
  }
}
