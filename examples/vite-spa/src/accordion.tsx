// Accordion browser page (tests/browser/accordion.spec.ts, accordion-a11y.spec.ts):
//
//   ?dir=rtl  ?scheme=dark
//   ?mode=hydrate   server-renders the page with renderToString, then hydrates it (window.__ssrHtml, __hydrated)
//
// Every callback appends to window.__events; window.__setValue(value) drives
// the controlled #controlled accordion (its onValueChange only records).
import { StrictMode, useState } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
// Only the theme and the family's own stylesheet: /accordion is self-contained.
import '@salmonui/core/styles.css';
import '@salmonui/navigation/accordion/styles.css';
import { Accordion, AccordionItem } from '@salmonui/navigation/accordion';
import { ThemeProvider } from '@salmonui/core/theme';

const params = new URLSearchParams(location.search);
const mode = params.get('mode');
const win = window as unknown as { __events: unknown[]; __setValue?: (value: string[]) => void };
win.__events = [];
const log = (...entry: unknown[]): void => void win.__events.push(entry);

function Counted({ id }: { id: string }) {
  // Local state shows whether content stayed mounted across collapse (keepMounted).
  const [clicks, setClicks] = useState(0);
  return (
    <p id={id}>
      Content of {id}{' '}
      <button type="button" className="bump" onClick={() => setClicks(clicks + 1)}>
        Clicked {clicks}
      </button>
    </p>
  );
}

function Controlled() {
  const [value, setValue] = useState<string[]>(['c1']);
  win.__setValue = setValue;
  return (
    <Accordion id="controlled" value={value} onValueChange={(next, event) => log('controlled', next, event.item, event.expanded, event.source)}>
      <AccordionItem value="c1" header="Controlled one">
        One
      </AccordionItem>
      <AccordionItem value="c2" header="Controlled two">
        Two
      </AccordionItem>
    </Accordion>
  );
}

function Page() {
  return (
    <ThemeProvider theme={{ colorScheme: params.get('scheme') === 'dark' ? 'dark' : 'light' }}>
      <main dir={params.get('dir') === 'rtl' ? 'rtl' : 'ltr'} style={{ padding: 24, display: 'grid', gap: 24, maxWidth: 560, background: 'var(--salmon-surface-base)', color: 'var(--salmon-text-primary)' }}>
        <h1>Accordion</h1>
        <h2>Examples</h2>
        <button id="before" type="button">
          Before
        </button>
        <Accordion
          id="main"
          defaultValue={['shipping']}
          onBeforeValueChange={(event) => {
            log('before', event.item, event.expanded, [...event.value], [...event.previousValue], event.source);
            if (event.item === 'locked') event.preventDefault();
          }}
          onValueChange={(value, event) => log('change', [...value], event.item, event.expanded, event.source)}
        >
          <AccordionItem value="shipping" header="Shipping" headerProps={{ onClick: () => log('click', 'shipping') }}>
            <Counted id="shipping-body" />
          </AccordionItem>
          <AccordionItem value="returns" header="Returns">
            <Counted id="returns-body" />
          </AccordionItem>
          <AccordionItem value="disabled" header="Disabled" disabled>
            <Counted id="disabled-body" />
          </AccordionItem>
          <AccordionItem value="locked" header="Locked">
            <Counted id="locked-body" />
          </AccordionItem>
          <AccordionItem value="unmount" header="Unmounts on collapse" keepMounted={false}>
            <Counted id="unmount-body" />
          </AccordionItem>
          <AccordionItem value="find" header="Searchable" forceMount>
            <p id="find-body">The hidden word is periwinkle.</p>
          </AccordionItem>
        </Accordion>
        <Accordion id="single" type="single" collapsible={false} defaultValue={['s1']}>
          <AccordionItem value="s1" header="Single one">
            One
          </AccordionItem>
          <AccordionItem value="s2" header="Single two">
            Two
          </AccordionItem>
        </Accordion>
        <Accordion id="single-collapsible" type="single">
          <AccordionItem value="a" header="Collapsible A">
            A
          </AccordionItem>
          <AccordionItem value="b" header="Collapsible B">
            B
          </AccordionItem>
        </Accordion>
        <Accordion id="outer" defaultValue={['o1']}>
          <AccordionItem value="o1" header="Outer one">
            <Accordion id="inner" defaultValue={[]}>
              <AccordionItem value="i1" header="Inner one">
                Inner one body
              </AccordionItem>
              <AccordionItem value="i2" header="Inner two">
                Inner two body
              </AccordionItem>
            </Accordion>
          </AccordionItem>
          <AccordionItem value="o2" header="Outer two">
            Outer two body
          </AccordionItem>
        </Accordion>
        <Controlled />
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
