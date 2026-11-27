// Popover browser page (tests/browser/popover.spec.ts; the overlay primitives).
//
//   ?dir=rtl  ?scheme=dark
//   ?placement=<OverlayPlacement>   placement of the basic popover
//   ?hydrate                        server-renders the page, then hydrates it
//
// window.__popover records onOpenChange calls: { open, reason, source }.
import { StrictMode, useRef, useState } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import '@salmonui/core/styles.css';
import '@salmonui/buttons/button/styles.css';
import '@salmonui/overlays/popover/styles.css';
import { Button } from '@salmonui/buttons/button';
import { Popover, type PopoverOpenChangeEvent, type PopoverPlacement } from '@salmonui/overlays/popover';
import { ThemeProvider } from '@salmonui/core/theme';

declare global {
  interface Window {
    __popover?: { open: boolean; reason: string; source: string; id: string }[];
  }
}

const params = new URLSearchParams(location.search);
const dir = params.get('dir') === 'rtl' ? 'rtl' : 'ltr';
const placement = (params.get('placement') ?? 'bottom') as PopoverPlacement;

const record = (id: string) => (open: boolean, event: PopoverOpenChangeEvent) => {
  (window.__popover ??= []).push({ open, reason: event.reason, source: event.source, id });
};

function Controlled() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <Popover
        open={open}
        onOpenChange={(next, event) => {
          record('controlled')(next, event);
          setOpen(next);
        }}
        placement="end"
      >
        <Popover.Trigger id="controlled-trigger">Controlled</Popover.Trigger>
        <Popover.Content data-test="controlled-content" aria-label="Controlled popover">
          <p>Open: {String(open)}</p>
        </Popover.Content>
      </Popover>
      <button id="external-toggle" type="button" onClick={() => setOpen((o) => !o)}>
        Toggle from outside
      </button>
    </div>
  );
}

function Page() {
  const anchor = useRef<HTMLInputElement>(null);
  const boundary = useRef<HTMLDivElement>(null);
  const [boundaryEl, setBoundaryEl] = useState<HTMLDivElement | null>(null);
  return (
    <div id="page" data-salmon-a11y-root="" dir={dir} style={{ padding: 120, display: 'grid', gap: 24, justifyItems: 'start' }}>
      <Popover onOpenChange={record('basic')} placement={placement} arrow>
        <Popover.Trigger id="basic-trigger" render={(props) => <Button {...props} />}>
          Filters
        </Popover.Trigger>
        <Popover.Content data-test="basic-content">
          <Popover.Title>Filters</Popover.Title>
          <Popover.Description>Narrow the order list.</Popover.Description>
          <label>
            Customer <input id="basic-input" />
          </label>
          <Popover.Close id="basic-close">Done</Popover.Close>
        </Popover.Content>
      </Popover>

      <Popover defaultOpen onOpenChange={record('initial')}>
        <Popover.Trigger id="initial-trigger">Initially open</Popover.Trigger>
        <Popover.Content data-test="initial-content" aria-label="Initially open popover" className="custom-content" style={{ minWidth: 200 }}>
          Opened after hydration.
        </Popover.Content>
      </Popover>

      <Controlled />

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input ref={anchor} id="anchor-field" aria-label="Anchored field" />
        <Popover anchor={anchor} placement="bottomStart" offset={{ mainAxis: 4, crossAxis: 10 }} initialFocus="container" closeOnFocusOutside={false}>
          <Popover.Trigger id="anchored-trigger">Pick</Popover.Trigger>
          <Popover.Content data-test="anchored-content" aria-label="Anchored popover">
            Anchored to the field.
          </Popover.Content>
        </Popover>
      </div>

      <div
        ref={(el) => {
          boundary.current = el;
          if (el !== boundaryEl) setBoundaryEl(el);
        }}
        id="boundary"
        style={{ width: 300, height: 160, overflow: 'auto', border: '1px dashed gray', position: 'relative' }}
      >
        <div style={{ height: 400, paddingTop: 120, paddingInlineStart: 200 }}>
          <Popover placement="end" collisionBoundary={boundaryEl}>
            <Popover.Trigger id="bounded-trigger">Bounded</Popover.Trigger>
            <Popover.Content data-test="bounded-content" aria-label="Bounded popover" style={{ width: 150 }}>
              Kept inside the box.
            </Popover.Content>
          </Popover>
        </div>
      </div>

      <Popover>
        <Popover.Trigger id="outer-trigger">Outer</Popover.Trigger>
        <Popover.Content data-test="outer-content" aria-label="Outer popover">
          <Popover placement="end">
            <Popover.Trigger id="inner-trigger">Inner</Popover.Trigger>
            <Popover.Content data-test="inner-content" aria-label="Inner popover">
              <button type="button" id="inner-button">
                Inner action
              </button>
            </Popover.Content>
          </Popover>
        </Popover.Content>
      </Popover>
      <button type="button" id="outside">
        Outside
      </button>
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
