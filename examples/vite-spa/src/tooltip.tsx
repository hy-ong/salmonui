// Tooltip browser page (tests/browser/tooltip.spec.ts).
//
//   ?dir=rtl  ?scheme=dark  ?hydrate (server-render, then hydrate)
//
// window.__tooltip records onOpenChange / after callbacks: { id, kind, open?, reason?, source? }.
import { StrictMode, useState } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import '@salmonui/core/styles.css';
import '@salmonui/buttons/button/styles.css';
import '@salmonui/overlays/tooltip/styles.css';
import { Button } from '@salmonui/buttons/button';
import { Tooltip, type TooltipOpenChangeEvent } from '@salmonui/overlays/tooltip';
import { ThemeProvider } from '@salmonui/core/theme';

declare global {
  interface Window {
    __tooltip?: Record<string, unknown>[];
  }
}

const params = new URLSearchParams(location.search);
const dir = params.get('dir') === 'rtl' ? 'rtl' : 'ltr';
const push = (entry: Record<string, unknown>) => (window.__tooltip ??= []).push(entry);
const record = (id: string) => (open: boolean, event: TooltipOpenChangeEvent) => push({ id, kind: 'change', open, reason: event.reason, source: event.source });

function Controlled() {
  const [open, setOpen] = useState(false);
  return (
    <span>
      <Tooltip content="Controlled tip" open={open} onOpenChange={(o, e) => (record('controlled')(o, e), setOpen(o))} placement="end">
        <button type="button" id="controlled-trigger">
          Controlled
        </button>
      </Tooltip>
      <button type="button" id="controlled-toggle" onClick={() => setOpen((o) => !o)}>
        Toggle tip
      </button>
    </span>
  );
}

function Page() {
  const [boundary, setBoundary] = useState<HTMLDivElement | null>(null);
  return (
    <div id="page" data-salmon-a11y-root="" dir={dir} style={{ padding: 120, display: 'grid', gap: 32, justifyItems: 'start' }}>
      <Tooltip content="Save the order" delay={0} onOpenChange={record('save')} onAfterOpen={() => push({ id: 'save', kind: 'afterOpen' })} onAfterClose={() => push({ id: 'save', kind: 'afterClose' })} contentProps={{ 'data-test': 'save-tip', title: 'extra' } as never} className="mine">
        <button type="button" id="save" aria-describedby="save-hint">
          Save
        </button>
      </Tooltip>
      <span id="save-hint" hidden>
        Saves locally.
      </span>

      <Tooltip content="Delete forever" delay={200} closeDelay={200} placement="bottomStart" render={(props) => (
          <Button {...props} id="delete" tone="danger">
            Delete
          </Button>
        )}
      />

      <div style={{ display: 'flex', gap: 8 }}>
        <Tooltip.Provider delay={400} skipDelay={500}>
          <Tooltip content="Bold">
            <button type="button" id="bold">
              B
            </button>
          </Tooltip>
          <Tooltip content="Italic">
            <button type="button" id="italic">
              I
            </button>
          </Tooltip>
        </Tooltip.Provider>
      </div>

      <Controlled />

      <Tooltip content="Follows the pointer" followCursor delay={0} placement="bottomStart" offset={12}>
        <div id="follow" style={{ width: 240, height: 80, background: 'var(--salmon-surface-sunken)', color: 'var(--salmon-text-primary)' }}>
          Hover area
        </div>
      </Tooltip>

      <Tooltip content="Offset tip" delay={0} placement="bottomStart" offset={{ mainAxis: 4, crossAxis: 10 }} arrow={false} styles={{ content: { width: 120 } }}>
        <button type="button" id="offset">
          Offset
        </button>
      </Tooltip>

      <Tooltip content="Disabled tip" disabled delay={0}>
        <button type="button" id="disabled">
          No tip
        </button>
      </Tooltip>

      <div ref={setBoundary} id="boundary" style={{ width: 260, height: 120, overflow: 'auto', border: '1px dashed gray' }}>
        <div style={{ paddingTop: 50, paddingInlineStart: 170 }}>
          <Tooltip content="Inside the box" delay={0} placement="end" collisionBoundary={boundary} styles={{ content: { width: 100 } }}>
            <button type="button" id="bounded">
              Edge
            </button>
          </Tooltip>
        </div>
      </div>

      {(['top', 'topStart', 'topEnd', 'bottom', 'bottomStart', 'bottomEnd', 'start', 'startTop', 'startBottom', 'end', 'endTop', 'endBottom'] as const).map((p) => (
        <Tooltip key={p} content={p} delay={0} placement={p}>
          <button type="button" id={`place-${p}`} style={{ marginInlineStart: 200 }}>
            {p}
          </button>
        </Tooltip>
      ))}
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
