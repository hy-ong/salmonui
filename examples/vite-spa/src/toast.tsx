// Toaster browser page (tests/browser/notifications-toast.spec.ts, NTF3):
//
//   ?scheme=light|dark   theme color scheme (default light)
//   ?dir=rtl             renders everything inside dir="rtl"
//   ?hydrate             renders the page to a string first and hydrates it
//   ?placement=<value>   Toaster placement (default bottomEnd)
//   ?oldest              newestOnTop={false}
//   ?max=<n>             visible toasts (default 5)
//   ?scoped              renders the region inside #box (container)
//
// The page's queue is a module-level client object (the documented pattern),
// exposed as window.__toasts with helpers in window.__demo; toast events are
// logged in window.__events and Toaster commits counted in window.__toastCommits.

import { Profiler, StrictMode, useState } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import '@salmonui/core/styles.css';
import '@salmonui/notifications/toast/styles.css';
import './app.css';
import { createToastQueue, Toaster, useToast, type ToastOptions, type ToastPlacement, type ToastTone } from '@salmonui/notifications/toast';
import { ThemeProvider } from '@salmonui/core/theme';

const params = new URLSearchParams(location.search);
const scheme = params.get('scheme') === 'dark' ? 'dark' : 'light';
const dir = params.get('dir') === 'rtl' ? 'rtl' : 'ltr';
const placement = (params.get('placement') ?? 'bottomEnd') as ToastPlacement;
const max = params.has('max') ? Number(params.get('max')) : undefined;

const toasts = createToastQueue();
const events: string[] = [];
const log = (entry: string) => void events.push(entry);
const TONES: ToastTone[] = ['neutral', 'primary', 'info', 'success', 'warning', 'danger'];

const demo = {
  /** A plain toast; the options are JSON so tests can pass them. */
  add: (options: ToastOptions = {}) => toasts.add({ title: 'Saved', description: 'Your changes are stored.', onClose: (e) => log(`close:${e.id}:${e.reason}`), ...options }),
  /** A toast with an Undo action and a click handler. */
  action: () =>
    toasts.add({
      title: 'Message archived',
      dismissible: true,
      actions: [{ label: 'Undo', altText: 'Press F6 to reach Undo', onAction: () => log('undo') }],
      onClick: () => log('click'),
      onClose: (e) => log(`close:${e.id}:${e.reason}`),
    }),
  /** One toast per tone. */
  tones: () => TONES.map((tone) => toasts.add({ tone, title: `${tone} toast`, description: 'Details.', dismissible: true, duration: Infinity, progress: tone === 'info' })),
};
Object.assign(window, { __toasts: toasts, __demo: demo, __events: events, __toastCommits: 0 });

function Trigger() {
  const queue = useToast();
  return (
    <button type="button" id="add" onClick={() => queue.add({ title: 'From useToast()', tone: 'success', dismissible: true })}>
      Add toast
    </button>
  );
}

function Page() {
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  return (
    <ThemeProvider theme={{ colorScheme: scheme }} className="app">
      <div dir={dir} id="page" data-salmon-a11y-root="" style={{ display: 'grid', gap: 16, padding: 16 }}>
        <Profiler id="toaster" onRender={() => void ((window as unknown as { __toastCommits: number }).__toastCommits += 1)}>
          <Toaster queue={toasts} placement={placement} newestOnTop={!params.has('oldest')} max={max} {...(params.has('scoped') ? { container: box } : {})}>
            <div style={{ display: 'flex', gap: 8 }}>
              <Trigger />
              <button type="button" id="before">
                Before
              </button>
            </div>
          </Toaster>
        </Profiler>
        <div id="box" ref={setBox} style={{ position: 'relative', blockSize: 300, inlineSize: 500, border: '1px dashed gray' }} />
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
