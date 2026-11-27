// TreeSelect browser page (tests/browser/tree-select*.spec.ts).
//   ?mode=hydrate              server-renders with renderToString, then hydrates (window.__hydrated)
//   ?dir=rtl                   mirrored page; ?scheme=dark
//   ?expandOn=click|doubleClick|none   expansion mode of #ts-single and #ts-leaves
// Every fixture sits in a wrapper with an id (#ts-<name>); every callback appends to window.__events.
import { StrictMode, useState, type CSSProperties, type ReactNode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { TreeSelect, type TreeSelectExpandOn, type TreeSelectValue } from '@salmonui/dropdowns/tree-select';
import { ThemeProvider } from '@salmonui/core/theme';
import '@salmonui/core/styles.css';
import '@salmonui/dropdowns/tree-select/styles.css';

interface Node {
  id: string;
  label: string;
  children?: Node[];
  disabled?: boolean;
  lazy?: boolean;
}

interface FlatNode {
  id: string;
  label: string;
  parent: string | null;
}

const params = new URLSearchParams(typeof location === 'undefined' ? '' : location.search);
const win = (typeof window === 'undefined' ? {} : window) as unknown as Record<string, unknown> & { __events: unknown[] };
win.__events = [];
const log = (...entry: unknown[]): void => void win.__events.push(entry);

const FILES: Node[] = [
  {
    id: 'docs',
    label: 'Documents',
    children: [
      { id: 'cv', label: 'CV.pdf' },
      {
        id: 'tax',
        label: 'Taxes',
        children: [
          { id: 't2025', label: '2025.pdf' },
          { id: 't2026', label: '2026.pdf' },
          { id: 'receipts', label: 'Receipts', disabled: true },
        ],
      },
      { id: 'letters', label: 'Letters' },
    ],
  },
  { id: 'music', label: 'Music', children: [{ id: 'jazz', label: 'Jazz' }, { id: 'rock', label: 'Rock' }] },
  { id: 'pics', label: 'Pictures', children: [{ id: 'beach', label: 'Beach.png' }, { id: 'snow', label: 'Snow.png' }] },
  { id: 'notes', label: 'Notes' },
  { id: 'old', label: 'Old drive', disabled: true, children: [{ id: 'old1', label: 'Backup.zip' }] },
  ...Array.from({ length: 8 }, (_, i): Node => ({ id: `misc${i + 1}`, label: `Misc ${i + 1}` })),
  {
    id: 'archive',
    label: 'Archive',
    children: [
      {
        id: 'y2019',
        label: '2019',
        children: [
          { id: 'q3', label: 'Q3', children: [{ id: 'q3-report', label: 'Q3 report.pdf' }] },
          { id: 'q4', label: 'Q4', children: [{ id: 'q4-summary', label: 'Q4 summary.pdf' }, { id: 'q4-report', label: 'Q4 report.pdf' }] },
        ],
      },
    ],
  },
];

const FLAT: FlatNode[] = [
  { id: 'eu', label: 'Europe', parent: null },
  { id: 'fr', label: 'France', parent: 'eu' },
  { id: 'paris', label: 'Paris', parent: 'fr' },
  { id: 'lyon', label: 'Lyon', parent: 'fr' },
  { id: 'de', label: 'Germany', parent: 'eu' },
  { id: 'asia', label: 'Asia', parent: null },
  { id: 'jp', label: 'Japan', parent: 'asia' },
  { id: 'tokyo', label: 'Tokyo', parent: 'jp' },
  { id: 'my', label: 'Malaysia', parent: 'asia' },
];

const LAZY: Node[] = [
  { id: 'share', label: 'Team share', lazy: true },
  { id: 'broken', label: 'Broken share', lazy: true },
  { id: 'local', label: 'Local disk', children: [{ id: 'tmp', label: 'tmp' }] },
];

let failBroken = true;
const loadChildren = (n: Node, { signal }: { signal: AbortSignal }): Promise<Node[]> =>
  new Promise((resolve, reject) => {
    log('load', n.id);
    const timer = setTimeout(() => {
      if (n.id === 'broken' && failBroken) {
        failBroken = false;
        reject(new Error('Share offline'));
      } else resolve([1, 2, 3].map((i) => ({ id: `${n.id}-${i}`, label: `${n.label} ${i}` })));
    }, 300);
    signal.addEventListener('abort', () => clearTimeout(timer));
  });

/** 10 roots × 100 children × 10 leaves (10,110 nodes). */
function bigData(): Node[] {
  const roots: Node[] = [];
  for (let r = 0; r < 10; r++) {
    const children: Node[] = [];
    for (let c = 0; c < 100; c++) {
      const leaves: Node[] = [];
      for (let l = 0; l < 10; l++) leaves.push({ id: `${r}.${c}.${l}`, label: `Leaf ${r}.${c}.${l}` });
      children.push({ id: `${r}.${c}`, label: `Branch ${r}.${c}`, children: leaves });
    }
    roots.push({ id: `${r}`, label: `Root ${r}`, children });
  }
  return roots;
}
const BIG = bigData();
const BIG_ROOTS = BIG.map((r) => r.id);

const nodeAccessors = {
  getItemValue: (n: Node) => n.id,
  getItemLabel: (n: Node) => n.label,
  getChildren: (n: Node) => n.children,
  isItemDisabled: (n: Node) => n.disabled === true,
};

const handlers = (name: string) => ({
  onOpenChange: (open: boolean, e: { reason: string; source: string }) => log('open', name, open, e.reason, e.source),
  onExpandedChange: (ids: readonly TreeSelectValue[], e: { id: TreeSelectValue | null; source: string }) => log('expanded', name, [...ids], e.id, e.source),
  onSearchChange: (text: string) => log('search', name, text),
});

const box = (id: string, title: string, children: ReactNode, style?: CSSProperties): ReactNode => (
  <section id={id} style={{ display: 'flex', flexDirection: 'column', gap: 4, ...style }}>
    <span id={`${id}-label`}>{title}</span>
    {children}
  </section>
);

function Main(): ReactNode {
  const expandOn = (params.get('expandOn') ?? 'auto') as TreeSelectExpandOn;
  const [multiExpanded, setMultiExpanded] = useState<readonly TreeSelectValue[]>(['docs']);
  return (
    <div data-salmon-a11y-root="" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 24, padding: 16 }}>
      {box(
        'ts-single',
        'Single',
        <TreeSelect<Node>
          aria-labelledby="ts-single-label"
          data={FILES}
          {...nodeAccessors}
          defaultValue="q4-report"
          expandOn={expandOn}
          placeholder="Pick a file"
          getItemIcon={(n) => <span className="demo-icon">{n.children ? 'D' : 'F'}</span>}
          getItemProps={(n) => ({ title: `Path: ${n.label}`, 'data-kind': n.children ? 'folder' : 'file' })}
          popupHeader={<span className="demo-header">Recent files</span>}
          popupFooter={<span className="demo-footer">Footer text</span>}
          onValueChange={(v, e) => log('value', 'single', v, e.reason, e.source)}
          onKeyDown={(e) => log('key', 'single', e.key)}
          {...handlers('single')}
        />,
      )}
      {box(
        'ts-leaves',
        'Leaves only',
        <TreeSelect<Node>
          aria-labelledby="ts-leaves-label"
          data={FILES}
          {...nodeAccessors}
          expandOn={expandOn}
          isItemSelectable={(n) => !n.children}
          onValueChange={(v, e) => log('value', 'leaves', v, e.reason, e.source)}
          {...handlers('leaves')}
        />,
      )}
      {box(
        'ts-flat',
        'Flat',
        <TreeSelect<FlatNode>
          aria-labelledby="ts-flat-label"
          data={FLAT}
          getItemValue={(n) => n.id}
          getParentId={(n) => n.parent}
          defaultExpanded={['eu']}
          renderItem={({ label, level, selected }) => (
            <span className="demo-render" data-level={level}>
              {label}
              {selected ? ' (chosen)' : ''}
            </span>
          )}
          onValueChange={(v, e) => log('value', 'flat', v, e.reason, e.source)}
          {...handlers('flat')}
        />,
      )}
      {box(
        'ts-multi',
        'Multiple',
        <>
          <TreeSelect<Node>
            aria-labelledby="ts-multi-label"
            multiple
            data={FILES}
            {...nodeAccessors}
            expanded={multiExpanded}
            onExpandedChange={(ids, e) => {
              log('expanded', 'multi', [...ids], e.id, e.source);
              setMultiExpanded(ids);
            }}
            onValueChange={(v, e) => log('value', 'multi', [...v], e.reason, e.source)}
            onOpenChange={(open, e) => log('open', 'multi', open, e.reason, e.source)}
          />
          <button type="button" id="multi-expand-music" onClick={() => setMultiExpanded(['docs', 'music'])}>
            Expand music
          </button>
        </>,
      )}
      {box(
        'ts-checkbox',
        'Checkbox',
        <TreeSelect<Node>
          aria-labelledby="ts-checkbox-label"
          multiple
          indicator="checkbox"
          showSelectAll
          valueDisplay="chips"
          data={FILES.slice(0, 4)}
          {...nodeAccessors}
          defaultExpanded={['docs', 'tax']}
          style={{ inlineSize: 200, minInlineSize: 0 }}
          onValueChange={(v, e) => log('value', 'checkbox', [...v], e.reason, e.source)}
          {...handlers('checkbox')}
        />,
        { inlineSize: 200 },
      )}
      {box(
        'ts-search',
        'Search',
        <TreeSelect<Node>
          aria-labelledby="ts-search-label"
          searchable
          searchOperator="contains"
          highlightMatches
          searchPlaceholder="Find a file"
          data={FILES}
          {...nodeAccessors}
          renderEmpty={({ reason }) => <span className="demo-empty">{reason === 'noMatch' ? 'Nothing matches' : 'No files'}</span>}
          onValueChange={(v, e) => log('value', 'search', v, e.reason, e.source)}
          {...handlers('search')}
        />,
      )}
      {box(
        'ts-lazy',
        'Lazy',
        <TreeSelect<Node>
          aria-labelledby="ts-lazy-label"
          data={LAZY}
          {...nodeAccessors}
          hasChildren={(n) => n.lazy === true}
          loadChildren={loadChildren}
          onLoadError={(error, n) => log('loadError', n.id, (error as Error).message)}
          onValueChange={(v, e) => log('value', 'lazy', v, e.reason, e.source)}
          {...handlers('lazy')}
        />,
      )}
      {box(
        'ts-big',
        'Big',
        <TreeSelect<Node> aria-labelledby="ts-big-label" data={BIG} {...nodeAccessors} defaultExpanded={BIG_ROOTS} onValueChange={(v, e) => log('value', 'big', v, e.reason, e.source)} />,
      )}
      {box(
        'ts-empty',
        'Empty',
        <TreeSelect<Node> aria-labelledby="ts-empty-label" data={[]} {...nodeAccessors} renderEmpty={({ reason }) => <span className="demo-empty">{reason === 'noData' ? 'No files' : 'Nothing matches'}</span>} />,
      )}
      <div dir="rtl">
        {box(
          'ts-rtl',
          'RTL',
          <TreeSelect<Node> aria-labelledby="ts-rtl-label" data={FILES} {...nodeAccessors} onValueChange={(v, e) => log('value', 'rtl', v, e.reason, e.source)} {...handlers('rtl')} />,
        )}
      </div>
      <form
        id="ts-form"
        onSubmit={(e) => {
          e.preventDefault();
          log('submit', [...new FormData(e.currentTarget).entries()].map(([k, v]) => [k, String(v)]));
        }}
      >
        <span id="ts-form-label">Form</span>
        <TreeSelect<Node>
          aria-labelledby="ts-form-label"
          name="file"
          data={FILES}
          {...nodeAccessors}
          defaultValue="cv"
          onValueChange={(v, e) => log('value', 'form', v, e.reason, e.source)}
        />
        <button type="submit" id="form-submit">
          Submit
        </button>
        <button type="reset" id="form-reset">
          Reset
        </button>
      </form>
      <button type="button" id="outside">
        Outside
      </button>
    </div>
  );
}

const Page = (): ReactNode => (
  <ThemeProvider theme={{ colorScheme: params.get('scheme') === 'dark' ? 'dark' : 'light' }}>
    <Main />
  </ThemeProvider>
);

if (typeof document !== 'undefined') {
  if (params.get('dir') === 'rtl') document.documentElement.dir = 'rtl';
  const root = document.getElementById('root');
  if (root && params.get('mode') === 'hydrate') {
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
    createRoot(root).render(
      <StrictMode>
        <Page />
      </StrictMode>,
    );
  }
}
