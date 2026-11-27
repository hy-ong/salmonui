// TreeView browser page (tests/browser/tree-view*.spec.ts).
//   ?mode=hydrate        server-renders with renderToString, then hydrates (window.__hydrated)
//   ?mode=plain          no StrictMode (timing runs)
//   ?dir=rtl             mirrored page; ?scheme=dark
//   ?expandOn=click|doubleClick|none, ?selection=single|none, ?propagation=none, ?checkOnClick=1, ?wrap=1
//   ?perf=1              only the #perf tree: 10 roots x 100 x 99 (+ ?wide=10000: a root with 10,000 children; ?top=1: one root above all)
// Every callback appends to window.__events; window.__tree / __second / __perf are the TreeView APIs.
import { StrictMode, useRef, useState, useEffect, type ReactNode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { TreeView, moveTreeItems, type TreeViewApi, type TreeViewKey } from '@salmonui/navigation/tree-view';
import { ThemeProvider } from '@salmonui/core/theme';
import '@salmonui/core/styles.css';
import '@salmonui/navigation/tree-view/styles.css';

interface Folder {
  id: string;
  name: string;
  children?: Folder[];
  lazy?: boolean;
  disabled?: boolean;
  url?: string;
}

const params = new URLSearchParams(typeof location === 'undefined' ? '' : location.search);
const win = (typeof window === 'undefined' ? {} : window) as unknown as Record<string, unknown> & { __events: unknown[] };
win.__events = [];
const log = (...entry: unknown[]): void => void win.__events.push(entry);

const initial: Folder[] = [
  {
    id: 'docs',
    name: 'Documents',
    children: [
      { id: 'cv', name: 'CV.pdf' },
      { id: 'tax', name: 'Taxes', children: [{ id: 't1', name: '2025.pdf' }, { id: 't2', name: '2026.pdf' }, { id: 't3', name: 'Receipts', disabled: true }] },
      { id: 'letters', name: 'Letters' },
    ],
  },
  { id: 'pics', name: 'Pictures', lazy: true },
  { id: 'broken', name: 'Broken share', lazy: true },
  { id: 'music', name: 'Music', children: [{ id: 'jazz', name: 'Jazz' }, { id: 'rock', name: 'Rock' }] },
  { id: 'site', name: 'Website', url: '#site-link' },
  { id: 'notes', name: 'Notes' },
];

const EXPANDED: readonly TreeViewKey[] = ['docs'];
const secondInitial: Folder[] = [{ id: 'archive', name: 'Archive', children: [{ id: 'old', name: 'Old.zip' }] }, { id: 'inbox', name: 'Inbox' }];

const accessors = {
  getItemId: (f: Folder) => f.id,
  getItemLabel: (f: Folder) => f.name,
  getChildren: (f: Folder) => f.children,
  hasChildren: (f: Folder) => f.lazy === true,
  isItemDisabled: (f: Folder) => f.disabled === true,
};
const moveOptions = { getItemId: accessors.getItemId, getChildren: accessors.getChildren, withChildren: (f: Folder, children: readonly Folder[]) => ({ ...f, children: [...children] }) };
const rename = (list: readonly Folder[], id: TreeViewKey, name: string): Folder[] =>
  list.map((f) => (f.id === id ? { ...f, name } : f.children ? { ...f, children: rename(f.children, id, name) } : f));

let failNext = true;
const loadChildren = (f: Folder, { signal }: { signal: AbortSignal }): Promise<Folder[]> =>
  new Promise((resolve, reject) => {
    log('load', f.id);
    const timer = setTimeout(() => {
      if (f.id === 'broken' && failNext) {
        failNext = false;
        reject(new Error('Share offline'));
      } else resolve([1, 2, 3].map((i) => ({ id: `${f.id}-${i}`, name: `${f.name} ${i}` })));
    }, 60);
    signal.addEventListener('abort', () => clearTimeout(timer));
  });

function Main(): ReactNode {
  const [data, setData] = useState(initial);
  const [second, setSecond] = useState(secondInitial);
  const [checked, setChecked] = useState<readonly TreeViewKey[]>(['t1']);
  const api = useRef<TreeViewApi<Folder>>(null);
  const api2 = useRef<TreeViewApi<Folder>>(null);
  useEffect(() => {
    win.__tree = api.current;
    win.__second = api2.current;
    win.__setChecked = setChecked;
  });
  const expandOn = (params.get('expandOn') ?? 'auto') as 'auto';
  const selection = (params.get('selection') ?? 'multiple') as 'multiple';
  return (
    <form id="form" onSubmit={(e) => e.preventDefault()}>
      <div data-salmon-a11y-root="" style={{ display: 'flex', gap: 24 }}>
        <TreeView
          ref={api}
          id="main"
          aria-label="Files"
          data={data}
          {...accessors}
          loadChildren={loadChildren}
          onLoadError={(error) => log('loadError', (error as Error).message)}
          getItemHref={(f) => f.url}
          getItemIcon={(f) => <span className="demo-icon">{f.children || f.lazy ? '📁' : '📄'}</span>}
          getItemProps={(f) => ({ title: f.name })}
          renderItem={params.get('render') ? (c) => (c.error ? <span>{`${c.label} failed`}</span> : <span>{c.label}</span>) : undefined}
          selection={selection}
          expandOn={expandOn}
          textWrap={params.get('wrap') === '1'}
          expanded={EXPANDED}
          checkable
          checkPropagation={(params.get('propagation') ?? 'cascade') as 'cascade'}
          checkOnClick={params.get('checkOnClick') === '1'}
          checked={checked}
          defaultChecked={['t1']}
          name="files"
          renamable
          draggable
          dragGroup="files"
          height={360}
          style={{ inlineSize: 320, border: '1px solid var(--salmon-border-default)' }}
          onBeforeExpandedChange={(e) => {
            log('beforeExpanded', e.id, e.expanded, e.source);
            if (e.id === 'music' && win.__vetoMusic) e.preventDefault();
          }}
          onExpandedChange={(e) => log('expanded', e.expanded, e.id, e.source)}
          onBeforeSelectedChange={(e) => {
            if (e.id === 'notes' && win.__vetoNotes) e.preventDefault();
          }}
          onSelectedChange={(e) => log('selected', e.selected, e.id, e.source)}
          onBeforeCheckedChange={(e) => log('beforeChecked', e.id, e.checked, e.source)}
          onCheckedChange={(e) => {
            log('checked', e.checked, e.id, e.source);
            setChecked(e.checked);
          }}
          onItemClick={(e) => log('click', e.id, e.source)}
          onBeforeRename={(e) => {
            if (e.label === 'veto') e.preventDefault();
          }}
          onRename={(e) => {
            log('rename', e.id, e.label, e.previousLabel);
            setData((d) => rename(d, e.id, e.label));
          }}
          onMove={(e) => {
            log('move', e.ids, e.targetId, e.position, e.source, e.sourceTreeId ?? null);
            if (e.sourceTreeId) {
              setSecond((d) => moveTreeItems(d, { ids: e.ids, targetId: '__none__', position: 'after' }, moveOptions));
              setData((d) => moveTreeItems(d, { ...e, items: e.items as Folder[] }, moveOptions));
            } else setData((d) => moveTreeItems(d, e, moveOptions));
          }}
          onKeyDown={(e) => {
            if (e.key === 'q') {
              log('userKey', 'q');
              e.preventDefault();
            }
          }}
        />
        <TreeView
          ref={api2}
          id="second"
          aria-label="Archive"
          data={second}
          {...accessors}
          draggable
          dragGroup="files"
          style={{ inlineSize: 240, blockSize: 200 }}
          onMove={(e) => {
            log('move2', e.ids, e.targetId, e.position, e.sourceTreeId ?? null);
            if (e.sourceTreeId) {
              setData((d) => moveTreeItems(d, { ids: e.ids, targetId: '__none__', position: 'after' }, moveOptions));
              setSecond((d) => moveTreeItems(d, { ...e, items: e.items as Folder[] }, moveOptions));
            } else setSecond((d) => moveTreeItems(d, e, moveOptions));
          }}
        />
      </div>
      <button type="reset" id="reset">
        Reset
      </button>
      <a id="site-link" href="#site-link">
        anchor
      </a>
    </form>
  );
}

/** 10 roots × 100 × 99 leaves; ?wide=k adds a first root with k children. */
function perfData(): Folder[] {
  const wide = Number(params.get('wide') ?? 0);
  const roots: Folder[] = [];
  if (wide > 0) roots.push({ id: 'wide', name: 'Wide', children: Array.from({ length: wide }, (_, i) => ({ id: `w${i}`, name: `Child ${i}` })) });
  const words = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel', 'India', 'Juliett'];
  for (let r = 0; r < 10; r++) {
    const children: Folder[] = [];
    for (let c = 0; c < 100; c++) {
      const leaves: Folder[] = [];
      for (let l = 0; l < 99; l++) leaves.push({ id: `${r}.${c}.${l}`, name: `${words[l % 10]} ${l}` });
      children.push({ id: `${r}.${c}`, name: `${words[c % 10]} ${r}.${c}`, children: leaves });
    }
    roots.push({ id: `${r}`, name: `${words[r]} root`, children });
  }
  return params.get('top') ? [{ id: 'top', name: 'Everything', children: roots }] : roots;
}

// Generated before the mount clock starts.
const PERF_DATA = params.get('perf') ? perfData() : [];
const ROOTS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

function Perf(): ReactNode {
  const [data] = useState(PERF_DATA);
  const api = useRef<TreeViewApi<Folder>>(null);
  useEffect(() => {
    win.__perf = api.current;
  });
  return (
    <TreeView
      ref={api}
      id="perf"
      aria-label="Perf"
      data={data}
      {...accessors}
      checkable
      selection="multiple"
      expanded={params.get('collapsed') ? undefined : params.get('top') ? ['top'] : ROOTS}
      height={640}
      style={{ inlineSize: 400 }}
    />
  );
}

const Page = (): ReactNode => (
  <ThemeProvider theme={{ colorScheme: params.get('scheme') === 'dark' ? 'dark' : 'light' }}>{params.get('perf') ? <Perf /> : <Main />}</ThemeProvider>
);

if (typeof document !== 'undefined') {
  if (params.get('dir') === 'rtl') document.documentElement.dir = 'rtl';
  const root = document.getElementById('root');
  const mode = params.get('mode');
  if (root && mode === 'hydrate') {
    const html = renderToString(
      <StrictMode>
        <Page />
      </StrictMode>,
    );
    win.__ssrHtml = html;
    root.innerHTML = html;
    hydrateRoot(
      root,
      <StrictMode>
        <Page />
      </StrictMode>,
      { onRecoverableError: (error) => console.error('recoverable', error) },
    );
    requestAnimationFrame(() => (win.__hydrated = true));
  } else if (root) {
    const t0 = performance.now();
    createRoot(root).render(
      mode === 'plain' ? (
        <Page />
      ) : (
        <StrictMode>
          <Page />
        </StrictMode>
      ),
    );
    // Mount to first painted window: the commit, then the next frame's paint.
    requestAnimationFrame(() => {
      const check = (): void => {
        if (document.querySelector('[role="treeitem"]')) {
          void document.body.offsetHeight;
          const ch = new MessageChannel();
          ch.port1.onmessage = () => (win.__mountMs = performance.now() - t0);
          ch.port2.postMessage(0);
        } else requestAnimationFrame(check);
      };
      check();
    });
  }
}
