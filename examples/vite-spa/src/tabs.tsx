// Tabs browser page (tests/browser/tabs.spec.ts, tabs-a11y.spec.ts):
//
//   ?dir=rtl  ?scheme=dark
//   ?activation=manual     #basic uses manual activation
//   ?placement=<p>         placement of #basic (top, bottom, start, end)
//   ?mode=hydrate          server-renders the page with renderToString, then hydrates it (window.__ssrHtml, __hydrated)
//   ?mode=plain            no StrictMode (timing runs)
//   ?warnings              #switch changes from uncontrolled to controlled on a button press
//
// Every callback appends to window.__events; window.__mounts counts panel
// content mounts per id; window.__setValue(v) drives the controlled #controlled.
import { StrictMode, useEffect, useState, type ReactNode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import '@salmonui/core/styles.css';
import '@salmonui/buttons/menu/styles.css';
import '@salmonui/navigation/tabs/styles.css';
import { Tab, TabList, TabPanel, Tabs, type TabsActivation, type TabsPanelMount, type TabsPlacement } from '@salmonui/navigation/tabs';
import { ThemeProvider } from '@salmonui/core/theme';

const params = new URLSearchParams(location.search);
const dir = params.get('dir') === 'rtl' ? 'rtl' : 'ltr';
const activation = (params.get('activation') ?? 'automatic') as TabsActivation;
const placement = (params.get('placement') ?? 'top') as TabsPlacement;

const win = window as unknown as { __events: unknown[]; __mounts: Record<string, number>; __setValue?: (v: string) => void };
win.__events = [];
win.__mounts = {};
const log = (...entry: unknown[]): void => void win.__events.push(entry);

function Counted(props: { readonly id: string; readonly children: ReactNode }) {
  useEffect(() => {
    win.__mounts[props.id] = (win.__mounts[props.id] ?? 0) + 1;
  }, [props.id]);
  return <p data-content={props.id}>{props.children}</p>;
}

const STAR = (
  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
    <path d="M8 1l2 5h5l-4 3 2 5-5-3-5 3 2-5-4-3h5z" fill="currentColor" />
  </svg>
);

function Basic() {
  return (
    <Tabs
      id="basic"
      defaultValue="general"
      activation={activation}
      placement={placement}
      onBeforeValueChange={(event) => {
        log('before', event.value, event.previousValue, event.source);
        if (event.value === 'locked') event.preventDefault();
      }}
      onValueChange={(value, event) => log('change', value, event.previousValue, event.source)}
    >
      <TabList aria-label="Settings">
        <Tab value="general">General</Tab>
        <Tab value="billing" icon={STAR} iconPlacement="end">
          Billing
        </Tab>
        <Tab value="off" disabled>
          Disabled
        </Tab>
        <Tab value="secret" hidden>
          Secret
        </Tab>
        <Tab value="locked">Locked</Tab>
        <Tab value="notifications">Notifications</Tab>
      </TabList>
      {['general', 'billing', 'off', 'secret', 'locked', 'notifications'].map((v) => (
        <TabPanel key={v} value={v}>
          <Counted id={`basic-${v}`}>Panel {v}</Counted>
        </TabPanel>
      ))}
    </Tabs>
  );
}

function Closable() {
  const [tabs, setTabs] = useState(['one', 'two', 'three', 'four']);
  const [value, setValue] = useState('two');
  return (
    <Tabs id="closable" value={value} onValueChange={(v, e) => (log('closable-change', v, e.source), setValue(v))}>
      <TabList aria-label="Documents">
        {tabs.map((t) => (
          <Tab
            key={t}
            value={t}
            onClose={(event) => {
              log('close', event.value, event.source);
              setTabs((list) => list.filter((x) => x !== event.value));
            }}
          >
            Doc {t}
          </Tab>
        ))}
      </TabList>
      {tabs.map((t) => (
        <TabPanel key={t} value={t}>
          Document {t}
        </TabPanel>
      ))}
    </Tabs>
  );
}

const many = Array.from({ length: 12 }, (_, i) => `t${i}`);

function Strip(props: { readonly id: string; readonly overflow: 'scroll' | 'menu'; readonly vertical?: boolean }) {
  const [value, setValue] = useState('t0');
  if (props.overflow === 'menu' && !props.vertical) win.__setValue = setValue;
  return (
    <div style={props.vertical ? { height: 200 } : { width: 360 }}>
      <Tabs
        id={props.id}
        value={value}
        onValueChange={(v, e) => (log(`${props.id}-change`, v, e.source), setValue(v))}
        overflow={props.overflow}
        scrollStep={50}
        placement={props.vertical ? 'start' : 'top'}
        {...(props.vertical ? { style: { height: '100%' } } : {})}
      >
        <TabList aria-label={`Many ${props.id}`}>
          {many.map((t, i) => (
            <Tab key={t} value={t} disabled={i === 9}>
              {`Tab number ${i}`}
            </Tab>
          ))}
        </TabList>
        {many.map((t) => (
          <TabPanel key={t} value={t}>
            Content {t}
          </TabPanel>
        ))}
      </Tabs>
    </div>
  );
}

function Reorder() {
  const [tabs, setTabs] = useState(['red', 'green', 'blue', 'pinned']);
  return (
    <Tabs
      id="reorder"
      defaultValue="red"
      reorderable
      onBeforeReorder={(event) => {
        log('before-reorder', event.value, event.fromIndex, event.toIndex, event.source);
        if (event.value === 'pinned') event.preventDefault();
      }}
      onReorder={(event) => {
        log('reorder', event.value, event.fromIndex, event.toIndex, event.source);
        setTabs((list) => {
          const next = [...list];
          const [moved] = next.splice(event.fromIndex, 1);
          next.splice(event.toIndex, 0, moved!);
          return next;
        });
      }}
    >
      <TabList aria-label="Colors">
        {tabs.map((t) => (
          <Tab key={t} value={t}>
            {t}
          </Tab>
        ))}
      </TabList>
      {tabs.map((t) => (
        <TabPanel key={t} value={t}>
          Color {t}
        </TabPanel>
      ))}
    </Tabs>
  );
}

function Mount(props: { readonly mode: TabsPanelMount }) {
  return (
    <Tabs id={`mount-${props.mode}`} defaultValue="a" panelMount={props.mode}>
      <TabList aria-label={`Mount ${props.mode}`}>
        <Tab value="a">A</Tab>
        <Tab value="b">B</Tab>
      </TabList>
      <TabPanel value="a">
        <Counted id={`${props.mode}-a`}>A</Counted>
      </TabPanel>
      <TabPanel value="b">
        <Counted id={`${props.mode}-b`}>B</Counted>
      </TabPanel>
    </Tabs>
  );
}

function Switch() {
  const [value, setValue] = useState<string | undefined>(undefined);
  return (
    <>
      <Tabs id="switch" value={value} defaultValue="x">
        <TabList aria-label="Switch">
          <Tab value="x">X</Tab>
          <Tab value="y">Y</Tab>
        </TabList>
        <TabPanel value="x">X</TabPanel>
        <TabPanel value="y">Y</TabPanel>
      </Tabs>
      <button id="make-controlled" type="button" onClick={() => setValue('y')}>
        Make controlled
      </button>
    </>
  );
}

function Page() {
  return (
    <ThemeProvider theme={{ colorScheme: params.get('scheme') === 'dark' ? 'dark' : 'light' }}>
      <main dir={dir} style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 24, minHeight: '100vh', boxSizing: 'border-box', background: 'var(--salmon-surface-base)', color: 'var(--salmon-text-primary)' }}>
        <button id="before" type="button">
          Before
        </button>
        <Basic />
        <Closable />
        <Strip id="scroll" overflow="scroll" />
        <Strip id="menu" overflow="menu" />
        <Strip id="vscroll" overflow="scroll" vertical />
        <Reorder />
        <Mount mode="lazy" />
        <Mount mode="active" />
        <Mount mode="eager" />
        <Tabs id="disabled" defaultValue="p" disabled>
          <TabList aria-label="Disabled tabs">
            <Tab value="p">P</Tab>
            <Tab value="q">Q</Tab>
          </TabList>
          <TabPanel value="p">P</TabPanel>
          <TabPanel value="q">Q</TabPanel>
        </Tabs>
        <Tabs id="implicit">
          <TabList aria-label="Implicit">
            <Tab value="first">First</Tab>
            <Tab value="second">Second</Tab>
          </TabList>
          <TabPanel value="first">First panel</TabPanel>
          <TabPanel value="second">Second panel</TabPanel>
        </Tabs>
        {params.has('warnings') ? <Switch /> : null}
        <button id="after" type="button">
          After
        </button>
      </main>
    </ThemeProvider>
  );
}

const root = document.getElementById('root');
const mode = params.get('mode');
if (root && mode === 'hydrate') {
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
} else if (root) {
  createRoot(root).render(
    mode === 'plain' ? (
      <Page />
    ) : (
      <StrictMode>
        <Page />
      </StrictMode>
    ),
  );
}
