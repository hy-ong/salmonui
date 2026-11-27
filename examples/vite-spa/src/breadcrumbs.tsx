// Breadcrumbs browser page (tests/browser/breadcrumbs.spec.ts, breadcrumbs-a11y.spec.ts):
//
//   ?dir=rtl  ?scheme=dark
//   ?mode=hydrate   server-renders the page with renderToString, then hydrates it (window.__ssrHtml, __hydrated)
//
// Every onItemClick appends to window.__events; window.__setWidth(px) resizes
// the #measured container. Links point at #hashes so a navigation is visible
// in location.hash.
import { StrictMode, useState, type ReactElement } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
// The theme, the family's own stylesheet and the Menu family's (the ellipsis menu).
import '@salmonui/core/styles.css';
import '@salmonui/navigation/breadcrumbs/styles.css';
import '@salmonui/buttons/menu/styles.css';
import { Breadcrumbs, BreadcrumbItem, type BreadcrumbItemRenderProps, type BreadcrumbsItemClickEvent } from '@salmonui/navigation/breadcrumbs';
import { ThemeProvider } from '@salmonui/core/theme';

const params = new URLSearchParams(location.search);
const mode = params.get('mode');
const win = window as unknown as { __events: unknown[]; __setWidth?: (px: number) => void };
win.__events = [];
const log = (name: string) => (event: BreadcrumbsItemClickEvent) => void win.__events.push([name, event.index, event.href, event.source, event.menu]);

const PATH = ['Home', 'Products', 'Electronics', 'Computers', 'Laptops', 'Gaming', 'Model X'];
const trail = (prefix: string, extra: (i: number) => Record<string, unknown> = () => ({})) =>
  PATH.map((label, i) => (
    // The scroll trail's links are never followed; a hash link scrolled out of view reads as a broken skip link to axe.
    <BreadcrumbItem key={label} href={prefix === 's' ? `?s=${i}` : `#${prefix}-${i}`} {...extra(i)}>
      {label}
    </BreadcrumbItem>
  ));

/** A stand-in router link: navigation goes through its own click handler. */
function RouterLink(props: BreadcrumbItemRenderProps & { to: string }): ReactElement {
  const { to, ...rest } = props;
  return (
    <a
      {...rest}
      href={to}
      data-router=""
      onClick={(event) => {
        rest.onClick?.(event);
        if (event.defaultPrevented) return;
        event.preventDefault();
        win.__events.push(['router', to]);
      }}
    />
  );
}

function Measured() {
  const [width, setWidth] = useState(900);
  win.__setWidth = setWidth;
  return (
    <div id="measured-box" style={{ inlineSize: width, border: '1px dashed var(--salmon-border-default)' }}>
      <Breadcrumbs id="measured" aria-label="measured trail" onItemClick={log('measured')}>
        {trail('m')}
      </Breadcrumbs>
    </div>
  );
}

function Page() {
  return (
    <ThemeProvider theme={{ colorScheme: params.get('scheme') === 'dark' ? 'dark' : 'light' }}>
      <main dir={params.get('dir') === 'rtl' ? 'rtl' : 'ltr'} style={{ padding: 24, display: 'grid', gap: 24, maxWidth: 960, background: 'var(--salmon-surface-base)', color: 'var(--salmon-text-primary)' }}>
        <h1>Breadcrumbs</h1>
        <Breadcrumbs id="basic" onItemClick={log('basic')}>
          <BreadcrumbItem href="#home" icon={<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1 1 7h2v7h4v-4h2v4h4V7h2z" /></svg>}>
            Home
          </BreadcrumbItem>
          <BreadcrumbItem href="#docs">Docs</BreadcrumbItem>
          <BreadcrumbItem>Tabs</BreadcrumbItem>
        </Breadcrumbs>
        <Breadcrumbs id="max" aria-label="max trail" maxItems={3} onItemClick={log('max')}>
          {trail('x')}
        </Breadcrumbs>
        <Breadcrumbs id="expand" aria-label="expand trail" maxItems={3} overflow="expand" onItemClick={log('expand')}>
          {trail('e')}
        </Breadcrumbs>
        <Measured />
        <div style={{ inlineSize: 320 }}>
          <Breadcrumbs id="wrap" aria-label="wrap trail" overflow="wrap">
            {trail('w')}
          </Breadcrumbs>
        </div>
        <div style={{ inlineSize: 320 }}>
          <Breadcrumbs id="scroll" aria-label="scroll trail" overflow="scroll">
            {trail('s')}
          </Breadcrumbs>
        </div>
        <div style={{ inlineSize: 320 }}>
          <Breadcrumbs id="none" aria-label="none trail" overflow="none">
            {trail('n')}
          </Breadcrumbs>
        </div>
        <Breadcrumbs id="separator" aria-label="separator trail" separator="/">
          {trail('p').slice(0, 3)}
        </Breadcrumbs>
        <Breadcrumbs id="router" aria-label="router trail" maxItems={2} onItemClick={log('router')}>
          {PATH.slice(0, 4).map((label, i) => (
            <BreadcrumbItem key={label} href={`/r/${i}`} render={(p) => <RouterLink {...p} to={`#r-${i}`} />}>
              {label}
            </BreadcrumbItem>
          ))}
        </Breadcrumbs>
        <Breadcrumbs
          id="cancel"
          aria-label="cancel trail"
          maxItems={2}
          onItemClick={(event) => {
            log('cancel')(event);
            event.preventDefault();
          }}
        >
          {trail('c').slice(0, 4)}
        </Breadcrumbs>
        <Breadcrumbs id="navigable" aria-label="navigable trail" currentNavigable>
          {trail('v').slice(0, 3)}
        </Breadcrumbs>
        <Breadcrumbs id="item-disabled" aria-label="item-disabled trail">{trail('d', (i) => ({ disabled: i === 1 })).slice(0, 3)}</Breadcrumbs>
        <Breadcrumbs id="disabled" aria-label="disabled trail" disabled maxItems={2}>
          {trail('z').slice(0, 4)}
        </Breadcrumbs>
        <button id="after" type="button">
          After
        </button>
      </main>
    </ThemeProvider>
  );
}

const root = document.getElementById('root')!;
if (mode === 'hydrate') {
  const html = renderToString(
    <StrictMode>
      <Page />
    </StrictMode>,
  );
  (window as unknown as { __ssrHtml: string }).__ssrHtml = html;
  root.innerHTML = html;
  hydrateRoot(
    root,
    <StrictMode>
      <Page />
    </StrictMode>,
    { onRecoverableError: (error) => console.error('recoverable', error) },
  );
  requestAnimationFrame(() => ((window as unknown as { __hydrated: boolean }).__hydrated = true));
} else {
  createRoot(root).render(
    <StrictMode>
      <Page />
    </StrictMode>,
  );
}
