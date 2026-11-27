// Listbox browser page (tests/browser/listbox.spec.ts, dropdowns-perf.spec.ts,
// a11y.spec.ts). `?case=` picks the scenario:
//
//   basic      single selection, fruit list (default; ?dupes adds a duplicate value)
//   multiple   multiple + checkbox indicator + select all + maxSelected (?max=<n>)
//   big        100,000 items, searchable, highlight (?n=<count>)
//   grouped    1,000 grouped items (virtual, sticky header)
//   dual       two lists with buttons (moveItems / reorderItems), keyboard
//              reorder and drag and drop in one dragGroup
//   form       a form with name, required, submit and reset
//   remote     a remote source over 10,000 rows (?delay=<ms>, ?fail)
//   rtl        `dir="rtl"` around a multiple list
//   listview   the ListView patterns on Listbox:
//              checkboxes at the inline end through classNames, native
//              onScroll passthrough, a disabled list (?dir=rtl)
//   grid       layout="grid" rows with Star and Delete buttons (?dir=rtl)
//   gallery    layout="grid" columns={4} tiles (?multiple, ?n=<count>, ?dir=rtl)
//
// Every change is recorded in `window.__changes`; option renders in
// `window.__optionRenders` (renderItem counter, ?count).
import { StrictMode, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import '@salmonui/core/styles.css';
import '@salmonui/dropdowns/listbox/styles.css';
import './app.css';
import { Listbox, moveItems, reorderItems, type ListboxKey, type ListboxDataSource } from '@salmonui/dropdowns/listbox';
import type { DataSourceRequest, DataSourceResult } from '@salmonui/core/data';

declare global {
  interface Window {
    __changes: { value: unknown; reason: string; source: string; items: unknown[] }[];
    __lbEvents: { type: string; detail: unknown }[];
    __optionRenders: number;
    __lbReads: DataSourceRequest[];
    __submitted?: [string, string][];
  }
}
window.__changes = [];
window.__lbEvents = [];
window.__optionRenders = 0;
window.__lbReads = [];

const params = new URLSearchParams(location.search);
const scenario = params.get('case') ?? 'basic';

interface Fruit {
  value: string;
  label: string;
  disabled?: boolean;
}

const fruits: Fruit[] = [
  { value: 'apple', label: 'Apple' },
  { value: 'apricot', label: 'Apricot' },
  { value: 'banana', label: 'Banana' },
  { value: 'blueberry', label: 'Blueberry' },
  { value: 'cherry', label: 'Cherry', disabled: true },
  { value: 'date', label: 'Date' },
  { value: 'elderberry', label: 'Elderberry' },
  { value: 'fig', label: 'Fig' },
  { value: 'grape', label: 'Grape' },
  { value: 'kiwi', label: 'Kiwi' },
  { value: 'lemon', label: 'Lemon' },
  { value: 'mango', label: 'Mango' },
];

const record = (value: unknown, event: { reason: string; source: string; items: readonly unknown[] }): void => {
  window.__changes.push({ value, reason: event.reason, source: event.source, items: [...event.items] });
};

const countRenders = params.has('count')
  ? ({ label }: { label: string }) => {
      window.__optionRenders++;
      return label;
    }
  : undefined;

// ?dupes: a duplicate value (development warning).
const basicData = params.has('dupes') ? [...fruits, { value: 'apple', label: 'Apple again' }] : fruits;

function Basic() {
  const [value, setValue] = useState<ListboxKey | null>(null);
  return (
    <section>
      <h1 id="basic-label">Fruit</h1>
      <Listbox
        data={basicData}
        aria-labelledby="basic-label"
        value={value}
        onValueChange={(v, e) => {
          record(v, e);
          setValue(v);
        }}
        {...(countRenders ? { renderItem: countRenders } : {})}
      />
      <output data-testid="value">{String(value)}</output>
    </section>
  );
}

function Multiple() {
  const max = params.get('max');
  return (
    <section>
      <h1 id="multi-label">Toppings</h1>
      <Listbox
        data={fruits}
        multiple
        indicator="checkbox"
        showSelectAll
        defaultValue={['banana']}
        aria-labelledby="multi-label"
        onValueChange={record}
        {...(max ? { maxSelected: Number(max) } : {})}
      />
    </section>
  );
}

const WORDS = ['Ångström', 'Café', 'Zürich', 'Øresund', 'Crème', 'naïve', 'Señor', 'Straße', 'Łódź', 'São Paulo', 'Kraków', 'Málaga'];
const bigData = scenario === 'big' ? Array.from({ length: Number(params.get('n') ?? 100_000) }, (_, i) => ({ value: i, label: `${WORDS[i % WORDS.length]} ${i}` })) : [];

function Big() {
  return (
    <section>
      <h1 id="big-label">Places</h1>
      <Listbox
        data={bigData}
        searchable
        ignoreAccents
        highlightMatches
        searchOperator={(params.get('op') as 'contains' | null) ?? 'startsWith'}
        aria-labelledby="big-label"
        onValueChange={record as never}
        {...((params.has('multiple') ? { multiple: true } : {}) as object)}
        {...(countRenders ? { renderItem: countRenders } : {})}
      />
    </section>
  );
}

const REGIONS = ['Africa', 'Americas', 'Asia', 'Europe', 'Oceania'];
const grouped = Array.from({ length: 1000 }, (_, i) => ({ value: i, label: `City ${i}`, group: REGIONS[Math.floor(i / 200)] as string }));

function Grouped() {
  return (
    <section>
      <h1 id="grouped-label">Cities</h1>
      <Listbox data={grouped} aria-labelledby="grouped-label" onValueChange={record} />
    </section>
  );
}

function Dual() {
  const [left, setLeft] = useState<Fruit[]>(fruits.slice(0, 6));
  const [right, setRight] = useState<Fruit[]>(fruits.slice(6));
  const [leftSel, setLeftSel] = useState<readonly ListboxKey[]>([]);
  const [rightSel, setRightSel] = useState<readonly ListboxKey[]>([]);
  return (
    <section style={{ display: 'flex', gap: 16, alignItems: 'start' }}>
      <div>
        <h1 id="left-label">Available</h1>
        <Listbox
          id="left"
          data={left}
          multiple
          reorderable
          dragGroup="fruit"
          value={leftSel}
          aria-labelledby="left-label"
          onValueChange={(v, e) => {
            record(v, e);
            setLeftSel(v);
          }}
          onReorder={(e) => {
            window.__lbEvents.push({ type: 'reorder:left', detail: { values: e.values, toIndex: e.toIndex, delta: e.delta, source: e.source } });
            setLeft((l) => (e.delta !== null ? reorderItems(l, e.values, e.delta) : moveItems(l, l, e.values, e.toIndex)[0]));
          }}
          onItemDragStart={(e) => {
            window.__lbEvents.push({ type: 'dragstart:left', detail: e.values });
            if (params.has('nodrag')) e.preventDefault();
          }}
          onItemDrag={() => window.__lbEvents.push({ type: 'drag:left', detail: null })}
          onItemDrop={(e) => {
            window.__lbEvents.push({ type: 'drop:left', detail: { values: e.values, fromList: e.fromList, toIndex: e.toIndex } });
            const [r, l] = moveItems(right, left, e.values, e.toIndex);
            setRight(r);
            setLeft(l);
            setRightSel([]);
          }}
        />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 48 }}>
        <button
          type="button"
          data-testid="to-right"
          onClick={() => {
            const [l, r] = moveItems(left, right, leftSel);
            setLeft(l);
            setRight(r);
            setLeftSel([]);
          }}
        >
          Move right
        </button>
        <button
          type="button"
          data-testid="all-left"
          onClick={() => {
            const [r, l] = moveItems(right, left, right.map((f) => f.value));
            setRight(r);
            setLeft(l);
          }}
        >
          Move all left
        </button>
      </div>
      <div>
        <h1 id="right-label">Chosen</h1>
        <Listbox
          id="right"
          data={right}
          multiple
          reorderable
          dragGroup="fruit"
          value={rightSel}
          aria-labelledby="right-label"
          onValueChange={(v) => setRightSel(v)}
          onReorder={(e) => setRight((l) => (e.delta !== null ? reorderItems(l, e.values, e.delta) : moveItems(l, l, e.values, e.toIndex)[0]))}
          onItemDrop={(e) => {
            window.__lbEvents.push({ type: 'drop:right', detail: { values: e.values, fromList: e.fromList, toIndex: e.toIndex } });
            const [l, r] = moveItems(left, right, e.values, e.toIndex);
            setLeft(l);
            setRight(r);
            setLeftSel([]);
          }}
        />
      </div>
      <output data-testid="left-order">{left.map((f) => f.value).join(',')}</output>
      <output data-testid="right-order">{right.map((f) => f.value).join(',')}</output>
    </section>
  );
}

function FormCase() {
  return (
    <form
      data-testid="form"
      onSubmit={(event) => {
        event.preventDefault();
        window.__submitted = [...new FormData(event.currentTarget).entries()].map(([k, v]) => [k, String(v)]);
      }}
    >
      <h1 id="form-label">Favourite</h1>
      <Listbox data={fruits} name="fruit" required defaultValue="banana" aria-labelledby="form-label" onValueChange={record} />
      <h2 id="form-multi-label">Basket</h2>
      <Listbox data={fruits} name="basket" multiple defaultValue={['apple', 'kiwi']} aria-labelledby="form-multi-label" onValueChange={record} />
      <button type="submit">Submit</button>
      <button type="reset">Reset</button>
    </form>
  );
}

const remoteRows = Array.from({ length: 10_000 }, (_, i) => ({ value: i, label: `Customer ${String(i).padStart(5, '0')}` }));
const delay = Number(params.get('delay') ?? 30);
const remoteSource: ListboxDataSource<{ value: number; label: string }> = {
  read(request: DataSourceRequest): Promise<DataSourceResult<{ value: number; label: string }>> {
    window.__lbReads.push(request);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (params.has('fail') && (window as { __fail?: boolean }).__fail !== false) return reject(new Error('Server unavailable'));
        const text = request.query.search?.text.toLowerCase() ?? '';
        const rows = text ? remoteRows.filter((r) => r.label.toLowerCase().includes(text)) : remoteRows;
        const range = request.range ?? { start: 0, end: rows.length };
        resolve({ version: request.version, rows: rows.slice(range.start, range.end), totalRowCount: rows.length });
      }, delay);
      request.signal.addEventListener('abort', () => clearTimeout(timer));
    });
  },
};

function Remote() {
  // Re-rendering the parent with inline `searchFields` / `query` literals must not re-read.
  // An inline onLoadError that sets state re-renders the list while the error stands.
  const [renders, setRenders] = useState(0);
  const [errors, setErrors] = useState(0);
  return (
    <section>
      <h1 id="remote-label">Customers</h1>
      <button type="button" onClick={() => setRenders((n) => n + 1)}>
        Re-render ({renders})
      </button>
      <Listbox
        data={remoteSource}
        searchable
        searchOperator="contains"
        searchFields={['label']}
        query={{ sorting: [] }}
        debounce={50}
        multiple
        aria-labelledby="remote-label"
        onValueChange={record}
        onLoadError={(e) => {
          window.__lbEvents.push({ type: 'error', detail: String(e) });
          setErrors((n) => n + 1);
        }}
      />
      <span id="remote-errors">{errors}</span>
    </section>
  );
}

function Rtl() {
  return (
    <section dir="rtl">
      <h1 id="rtl-label">פירות</h1>
      <Listbox data={fruits} multiple indicator="checkbox" defaultValue={['apple']} aria-labelledby="rtl-label" />
      <Listbox id="end-list" data={fruits} multiple indicator="checkbox" indicatorPosition="end" defaultValue={['apple']} aria-label="End checkboxes" />
    </section>
  );
}

function ListView() {
  return (
    <section dir={params.get('dir') === 'rtl' ? 'rtl' : 'ltr'}>
      <style>{'.check-end .salmon-listbox-checkbox { order: 1; margin-inline-start: auto; }'}</style>
      <h1 id="lv-label">Fruit</h1>
      <Listbox
        id="lv-end"
        data={fruits}
        multiple
        indicator="checkbox"
        defaultValue={['apple']}
        classNames={{ option: 'check-end' }}
        style={{ blockSize: 160 }}
        virtualization={false}
        onScroll={(event) => window.__lbEvents.push({ type: 'scroll', detail: event.currentTarget.scrollTop })}
        aria-labelledby="lv-label"
      />
      <Listbox id="lv-disabled" data={fruits.slice(0, 3)} disabled defaultValue="apple" aria-label="Disabled fruit" />
    </section>
  );
}

// layout="grid": rows with in-row controls, and a tile gallery
// (?dir=rtl, ?n=<count> for a virtual gallery).
function GridRows() {
  const [value, setValue] = useState<ListboxKey | null>(null);
  return (
    <section dir={params.get('dir') === 'rtl' ? 'rtl' : 'ltr'}>
      <h1 id="grid-label">Inbox</h1>
      <button type="button" id="before-grid">
        Before
      </button>
      <Listbox
        id="grid-rows"
        layout="grid"
        data={fruits}
        value={value}
        onValueChange={(next, event) => {
          setValue(next);
          record(next, event);
        }}
        classNames={{ option: 'grid-row' }}
        renderItem={({ label, item }) => (
          <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ flex: 1 }}>{label}</span>
            <button type="button" aria-label={`Star ${label}`} onClick={() => window.__lbEvents.push({ type: 'star', detail: item.value })}>
              Star
            </button>
            <button type="button" aria-label={`Delete ${label}`} onClick={() => window.__lbEvents.push({ type: 'delete', detail: item.value })}>
              Delete
            </button>
          </span>
        )}
        aria-labelledby="grid-label"
      />
      <button type="button" id="after-grid">
        After
      </button>
    </section>
  );
}

const tileCount = Number(params.get('n') ?? 18);
const tiles = Array.from({ length: tileCount }, (_, i) => ({ value: `t${i}`, label: `Style ${i + 1}`, disabled: i === 5 }));

function Gallery() {
  return (
    <section dir={params.get('dir') === 'rtl' ? 'rtl' : 'ltr'} style={{ maxWidth: 420 }}>
      <h1 id="gallery-label">Styles</h1>
      <Listbox
        id="gallery"
        layout="grid"
        columns={4}
        {...({ multiple: params.has('multiple') } as { multiple: true })}
        data={tiles}
        maxVisibleItems={3}
        styles={{ option: { blockSize: 56, justifyContent: 'center' } }}
        onValueChange={record as never}
        aria-labelledby="gallery-label"
      />
    </section>
  );
}

const cases: Record<string, () => ReactNode> = { basic: Basic, multiple: Multiple, big: Big, grouped: Grouped, dual: Dual, form: FormCase, remote: Remote, rtl: Rtl, listview: ListView, grid: GridRows, gallery: Gallery };
const Case = cases[scenario] ?? Basic;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <main className="app listbox-page" style={{ maxWidth: 720 }}>
      <Case />
    </main>
  </StrictMode>,
);
