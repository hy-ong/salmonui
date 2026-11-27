// Select and Combobox browser page (tests/browser/select.spec.ts,
// combobox.spec.ts, select-combobox-perf.spec.ts). Every
// fixture is labelled and keyed by an id; events land in `window.__dd`.
//
//   (no query)            every fixture, small data
//   ?perf=select&n=<n>    one Select over n local items (open budget)
//   ?perf=search&n=<n>    one searchable Select over n items (filter budget)
//   ?perf=combobox&n=<n>  one Combobox over n items
//   ?perf=columns&n=<n>   one Combobox with 5 columns over n rows
//   ?perf=multi&n=<n>     one Select multiple with showSelectAll over n items
//   ?sizes                Select, Combobox and TreeSelect at sm, md and lg (control-metrics.spec.ts)
//   ?delay=<ms>           remote fixture latency (default 30)
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@salmonui/core/styles.css';
import '@salmonui/dropdowns/combobox/styles.css';
import '@salmonui/dropdowns/select/styles.css';
import '@salmonui/dropdowns/tree-select/styles.css';
import './app.css';
import { Select, type SelectValue, type SelectValueChangeEvent } from '@salmonui/dropdowns/select';
import { Combobox, type ComboboxColumn } from '@salmonui/dropdowns/combobox';
import { TreeSelect } from '@salmonui/dropdowns/tree-select';
import type { DataSourceRequest, DataSourceResult } from '@salmonui/core/data';

interface Fruit {
  readonly value: string;
  readonly label: string;
  readonly family: string;
  readonly disabled?: boolean;
}

interface Person {
  readonly id: number;
  readonly name: string;
  readonly city: string;
  readonly age: number;
  readonly active: boolean;
  readonly joined: Date;
}

interface DdEvent {
  readonly id: string;
  readonly value: unknown;
  readonly reason: string;
  readonly source: string;
  readonly items?: number;
}

declare global {
  interface Window {
    __ddRef?: HTMLElement | null;
    __dd: { events: DdEvent[]; open: { id: string; open: boolean; reason: string }[]; submitted: [string, string][] | null; reads: { start: number; end: number; search: string | null; aborted: boolean }[]; ready: boolean };
  }
}

window.__dd = { events: [], open: [], submitted: null, reads: [], ready: false };

const params = new URLSearchParams(location.search);
const perf = params.get('perf');
const n = Number(params.get('n') ?? 100_000);
const delay = Number(params.get('delay') ?? 30);

const FRUITS: Fruit[] = [
  { value: 'apple', label: 'Apple', family: 'Pome' },
  { value: 'apricot', label: 'Apricot', family: 'Stone' },
  { value: 'avocado', label: 'Avocado', family: 'Berry' },
  { value: 'banana', label: 'Banana', family: 'Berry' },
  { value: 'blueberry', label: 'Blueberry', family: 'Berry' },
  { value: 'cherry', label: 'Cherry', family: 'Stone' },
  { value: 'durian', label: 'Durian', family: 'Other', disabled: true },
  { value: 'grape', label: 'Grape', family: 'Berry' },
  { value: 'kiwi', label: 'Kiwi', family: 'Berry' },
  { value: 'lemon', label: 'Lemon', family: 'Citrus' },
  { value: 'lime', label: 'Lime', family: 'Citrus' },
  { value: 'mango', label: 'Mango', family: 'Stone' },
  { value: 'orange', label: 'Orange', family: 'Citrus' },
  { value: 'peach', label: 'Peach', family: 'Stone' },
  { value: 'pear', label: 'Pear', family: 'Pome' },
  { value: 'plum', label: 'Plum', family: 'Stone' },
];
const SORTED_BY_GROUP = [...FRUITS].sort((a, b) => a.family.localeCompare(b.family));
const CITIES = ['Zürich', 'São Paulo', 'Kraków', 'Reykjavík', 'Montréal', 'Málaga', 'Lyon', 'Bern'];
const COUNTRIES = ['Åland', 'Česko', 'Côte d’Ivoire', 'España', 'France', 'Ísland', 'México', 'Perú', 'Türkiye', 'Österreich'];

function items(count: number): { value: number; label: string }[] {
  const out = new Array<{ value: number; label: string }>(count);
  for (let i = 0; i < count; i++) out[i] = { value: i, label: `Item ${i}` };
  return out;
}

function people(count: number): Person[] {
  const out = new Array<Person>(count);
  for (let i = 0; i < count; i++) out[i] = { id: i, name: `Person ${i}`, city: CITIES[i % CITIES.length] as string, age: 20 + (i % 50), active: i % 3 !== 0, joined: new Date(Date.UTC(2024, 0, 1 + (i % 300))) };
  return out;
}

const PEOPLE_COLUMNS: ComboboxColumn<Person>[] = [
  { field: 'id', header: 'ID', width: 60, align: 'end' },
  { field: 'name', header: 'Name', width: '35%' },
  { field: 'city', header: 'City' },
  { field: 'age', header: 'Age', width: 70, align: 'end', format: { maximumFractionDigits: 0 } },
  { field: 'active', header: 'Active', width: 80, align: 'center', displayAsCheckbox: true },
];

/** In-page remote source over `count` generated items (range and search reads, abortable). */
function remoteSource(count: number, fail = false, quiet = false) {
  const all = items(count);
  let failing = fail;
  return {
    mode: 'remote' as const,
    read(request: DataSourceRequest): Promise<DataSourceResult<{ value: number; label: string }>> {
      const search = request.query.search?.text ?? null;
      const entry = { start: request.range?.start ?? 0, end: request.range?.end ?? 0, search, aborted: false };
      if (!quiet) window.__dd.reads.push(entry);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          if (failing) {
            failing = false;
            reject(new Error('The fruit service is unavailable'));
            return;
          }
          const q = search?.toLowerCase();
          // A value read: `value in [...]`.
          const inFilter = request.query.filters.find((f) => 'operator' in f && f.operator === 'in' && f.columnId === 'value') as { value: unknown[] } | undefined;
          const rows = inFilter ? all.filter((x) => inFilter.value.includes(x.value)) : q ? all.filter((x) => x.label.toLowerCase().includes(q)) : all;
          resolve({ version: request.version, rows: rows.slice(entry.start, entry.end), totalRowCount: rows.length });
        }, delay);
        request.signal.addEventListener('abort', () => {
          entry.aborted = true;
          clearTimeout(timer);
          reject(new Error('aborted'));
        });
      });
    },
  };
}

const log =
  (id: string) =>
  (value: unknown, event: SelectValueChangeEvent<unknown>): void => {
    window.__dd.events.push({ id, value, reason: event.reason, source: event.source, items: event.items.length });
  };
const logOpen = (id: string) => (open: boolean, event: { reason: string }) => window.__dd.open.push({ id, open, reason: event.reason });

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="dd-field" data-fixture={id}>
      <label id={`${id}-label`} htmlFor={id}>
        {label}
      </label>
      {children}
    </div>
  );
}

function Controlled() {
  const [value, setValue] = useState<SelectValue | null>('lemon');
  return (
    <Field id="select-controlled" label="Controlled">
      <Select
        id="select-controlled"
        aria-labelledby="select-controlled-label"
        data={FRUITS}
        value={value}
        onValueChange={(v, e) => (log('select-controlled')(v, e), setValue(v))}
        ref={(el) => {
          window.__ddRef = el;
        }}
        onFocus={() => window.__dd.events.push({ id: 'select-controlled', value: null, reason: 'focus', source: 'api' })}
        onBlur={() => window.__dd.events.push({ id: 'select-controlled', value: null, reason: 'blur', source: 'api' })}
      />
      <output data-testid="controlled-value">{String(value)}</output>
      <button type="button" data-testid="controlled-set" onClick={() => setValue('kiwi')}>
        Set kiwi
      </button>
    </Field>
  );
}

function Gallery() {
  const [remote] = useState(() => remoteSource(5_000));
  const [failing] = useState(() => remoteSource(50, true));
  const [bigPeople] = useState(() => people(2_000));
  return (
    <main className="dd-gallery">
      <form
        id="dd-form"
        onSubmit={(event) => {
          event.preventDefault();
          window.__dd.submitted = [...new FormData(event.currentTarget).entries()].map(([k, v]) => [k, String(v)]);
        }}
      >
        <Field id="select-basic" label="Fruit">
          <Select id="select-basic" aria-labelledby="select-basic-label" data={FRUITS} placeholder="Pick a fruit" name="fruit" clearable defaultValue="banana" onValueChange={log('select-basic')} onOpenChange={logOpen('select-basic')} />
        </Field>
        <Field id="select-required" label="Required">
          <Select id="select-required" aria-labelledby="select-required-label" data={FRUITS} placeholder="Required" name="required" required />
        </Field>
        <Field id="select-multi" label="Tags">
          <Select
            id="select-multi"
            aria-labelledby="select-multi-label"
            multiple
            indicator="checkbox"
            showSelectAll
            data={SORTED_BY_GROUP}
            getItemGroup={(f) => f.family}
            groupSelection
            name="tags"
            defaultValue={['apple', 'pear']}
            onValueChange={log('select-multi')}
          />
        </Field>
        <Field id="cbx-multi" label="Labels">
          <Combobox id="cbx-multi" aria-labelledby="cbx-multi-label" multiple creatable commitOnBlur data={FRUITS} name="labels" defaultValue={['apple']} onValueChange={log('cbx-multi')} onInputChange={(text, event) => window.__dd.events.push({ id: 'cbx-multi-input', value: text, reason: event.reason, source: event.source })} getChipProps={(f) => (f.value === 'apple' ? { className: 'dd-chip-apple' } : undefined)} />
        </Field>
        <button type="submit" data-testid="submit">
          Submit
        </button>
        <button type="reset" data-testid="reset">
          Reset
        </button>
      </form>
      {/* Field parts on the components themselves: no external <label>. */}
      <div className="dd-field" data-fixture="select-labelled">
        <Select id="select-labelled" label="Status" description="Shown to the customer" errorMessage="Pick a status" invalid required data={FRUITS} placeholder="Pick one" />
      </div>
      <div className="dd-field" data-fixture="cbx-labelled">
        <Combobox id="cbx-labelled" label="Owner" description="Type to search" data={FRUITS} />
      </div>
      <Controlled />
      <Field id="select-search" label="Country">
        <Select id="select-search" aria-labelledby="select-search-label" searchable searchPlaceholder="Search countries" ignoreAccents highlightMatches searchOperator="contains" data={COUNTRIES} onValueChange={log('select-search')} />
      </Field>
      <Field id="select-limit" label="Up to three">
        <Select id="select-limit" aria-labelledby="select-limit-label" multiple maxSelected={3} data={FRUITS} onValueChange={log('select-limit')} />
      </Field>
      <Field id="select-count" label="Count">
        <Select id="select-count" aria-labelledby="select-count-label" multiple valueDisplay="count" hideSelected data={FRUITS} defaultValue={['apple', 'kiwi']} onValueChange={log('select-count')} />
      </Field>
      <Field id="select-large" label="Large">
        <Select id="select-large" aria-labelledby="select-large-label" data={items(1_000)} onValueChange={log('select-large')} />
      </Field>
      <Field id="select-remote" label="Remote">
        <Select id="select-remote" aria-labelledby="select-remote-label" searchable debounce={50} data={remote} onValueChange={log('select-remote')} />
      </Field>
      <Field id="select-templates" label="Templates">
        <Select
          id="select-templates"
          aria-labelledby="select-templates-label"
          data={FRUITS}
          getItemIcon={(f) => <span className="dd-icon">{f.label[0]}</span>}
          renderItem={({ item, selected }) => <span data-testid="tpl-item">{`${item.label}${selected ? ' ✓' : ''}`}</span>}
          renderValue={({ items: sel }) => <strong data-testid="tpl-value">{sel.map((f) => f.label).join('+')}</strong>}
          popupHeader={<span data-testid="tpl-header">Pick one</span>}
          popupFooter={<span data-testid="tpl-footer">16 fruits</span>}
          getItemProps={(f) => ({ 'data-family': f.family })}
          defaultValue="mango"
        />
      </Field>
      <Field id="select-groups" label="Groups">
        <Select id="select-groups" aria-labelledby="select-groups-label" data={SORTED_BY_GROUP} getItemGroup={(f) => f.family} renderGroupHeader={({ group }) => <em data-testid="tpl-group">{group.toUpperCase()}</em>} />
      </Field>
      <Field id="select-error" label="Failing">
        <Select
          id="select-error"
          aria-labelledby="select-error-label"
          data={failing}
          onLoadError={(error) => window.__dd.events.push({ id: 'select-error', value: String((error as Error).message), reason: 'error', source: 'api' })}
        />
      </Field>
      <Field id="select-empty" label="Empty">
        <Select id="select-empty" aria-labelledby="select-empty-label" data={[]} renderEmpty={({ reason }) => <em data-testid="tpl-empty">{reason}</em>} />
      </Field>
      <Field id="select-readonly" label="Read only">
        <Select id="select-readonly" aria-labelledby="select-readonly-label" data={FRUITS} readOnly defaultValue="kiwi" />
      </Field>
      <Field id="select-disabled" label="Disabled">
        <Select id="select-disabled" aria-labelledby="select-disabled-label" data={FRUITS} disabled defaultValue="kiwi" />
      </Field>
      <Field id="select-sheet" label="Sheet">
        <Select id="select-sheet" aria-label="Sheet fruit" popupMode="sheet" data={FRUITS} onValueChange={log('select-sheet')} />
      </Field>
      <Field id="cbx-basic" label="Fruit combobox">
        <Combobox id="cbx-basic" aria-labelledby="cbx-basic-label" data={FRUITS} placeholder="Type a fruit" onValueChange={log('cbx-basic')} onOpenChange={logOpen('cbx-basic')} />
      </Field>
      <Field id="cbx-creatable" label="Creatable">
        <Combobox id="cbx-creatable" aria-labelledby="cbx-creatable-label" creatable data={FRUITS} onCreateItem={(text) => (text === 'nope' ? null : { value: text.toLowerCase(), label: text, family: 'Custom' })} onValueChange={log('cbx-creatable')} />
      </Field>
      <Field id="cbx-autofill" label="Autofill">
        <Combobox id="cbx-autofill" aria-labelledby="cbx-autofill-label" autofill data={FRUITS} onValueChange={log('cbx-autofill')} />
      </Field>
      <Field id="cbx-auto" label="AutoComplete">
        <Combobox id="cbx-auto" aria-labelledby="cbx-auto-label" creatable showTrigger={false} minSearchLength={1} maxResults={5} searchOperator="contains" highlightMatches data={CITIES} onValueChange={log('cbx-auto')} />
      </Field>
      <Field id="cbx-columns" label="People">
        <Combobox id="cbx-columns" aria-labelledby="cbx-columns-label" columns={PEOPLE_COLUMNS} data={bigPeople} getItemValue={(p) => p.id} getItemLabel={(p) => p.name} searchFields={['name', 'city']} searchOperator="contains" striped gridLines="both" sorting={{ multiple: true }} onValueChange={log('cbx-columns')} />
      </Field>
      <Field id="cbx-columns2" label="People (templates)">
        <Combobox
          id="cbx-columns2"
          aria-labelledby="cbx-columns2-label"
          data={bigPeople}
          getItemValue={(p) => p.id}
          getItemLabel={(p) => p.name}
          rowHeight={40}
          sorting={{ sortBy: [{ columnId: 'age', direction: 'desc' }] }}
          columns={[
            { field: 'name', header: 'Name', renderHeader: ({ column }) => <b data-testid="tpl-col-header">{column.header}!</b> },
            { field: 'city', header: 'City', cellProps: (p) => ({ className: p.city === 'Bern' ? 'dd-bern' : undefined }) },
            { field: 'age', header: 'Age', renderCell: ({ value }) => <i data-testid="tpl-cell">{`${String(value)} y`}</i> },
            // A second column over the same field (formatted): keys stay unique.
            { field: 'age', header: 'Months', sortable: false, format: (value) => String(Number(value) * 12) },
          ]}
        />
      </Field>
      <Field id="cbx-remote" label="Remote combobox">
        <Combobox id="cbx-remote" aria-labelledby="cbx-remote-label" data={remote} debounce={50} searchOperator="contains" onValueChange={log('cbx-remote')} />
      </Field>
      <Filtering />
      <div dir="rtl" className="dd-rtl">
        <Field id="cbx-rtl" label="RTL">
          <Combobox id="cbx-rtl" aria-labelledby="cbx-rtl-label" multiple data={FRUITS} defaultValue={['apple', 'kiwi', 'lime']} />
        </Field>
        <Field id="select-rtl" label="RTL select">
          <Select id="select-rtl" aria-labelledby="select-rtl-label" data={FRUITS} defaultValue="kiwi" />
        </Field>
      </div>
    </main>
  );
}

// Controlled filtering: the parent filters `data` from the search
// text and the component's own operator accepts every item it is given; a
// failing remote Combobox reports onLoadError; a local Combobox
// over 1,000 items is virtualized.
const LARGE = items(1_000);
const acceptAll = (): boolean => true;
function Filtering() {
  const [selectText, setSelectText] = useState('');
  const [cbxText, setCbxText] = useState('');
  const [failing] = useState(() => remoteSource(50, true));
  const [remoteValue] = useState(() => remoteSource(5_000, false, true));
  const contains = (text: string) => FRUITS.filter((f) => f.label.toLowerCase().includes(text.toLowerCase()));
  return (
    <>
      <Field id="select-filter" label="Server filtered">
        <Select
          id="select-filter"
          aria-labelledby="select-filter-label"
          searchable
          data={contains(selectText)}
          searchOperator={acceptAll}
          onSearchChange={(text) => {
            window.__dd.events.push({ id: 'select-filter', value: text, reason: 'search', source: 'keyboard' });
            setSelectText(text);
          }}
          onValueChange={log('select-filter')}
        />
      </Field>
      <Field id="cbx-filter" label="Server filtered combobox">
        <Combobox
          id="cbx-filter"
          aria-labelledby="cbx-filter-label"
          data={contains(cbxText)}
          searchOperator={acceptAll}
          onInputChange={(text) => {
            window.__dd.events.push({ id: 'cbx-filter', value: text, reason: 'search', source: 'keyboard' });
            setCbxText(text);
          }}
          onValueChange={log('cbx-filter')}
        />
      </Field>
      <Field id="cbx-error" label="Failing combobox">
        <Combobox
          id="cbx-error"
          aria-labelledby="cbx-error-label"
          data={failing}
          onLoadError={(error) => window.__dd.events.push({ id: 'cbx-error', value: String((error as Error).message), reason: 'error', source: 'api' })}
        />
      </Field>
      <Field id="select-remote-value" label="Remote with a value">
        <Select id="select-remote-value" aria-labelledby="select-remote-value-label" data={remoteValue} defaultValue={4242} placeholder="None" />
      </Field>
      <Field id="select-remote-multi" label="Remote multiple">
        <Select id="select-remote-multi" aria-labelledby="select-remote-multi-label" multiple data={remoteValue} defaultValue={[7]} onValueChange={log('select-remote-multi')} />
      </Field>
      <Field id="cbx-remote-value" label="Remote combobox with values">
        <Combobox id="cbx-remote-value" aria-labelledby="cbx-remote-value-label" multiple data={remoteValue} defaultValue={[7, 4243]} />
      </Field>
      <Field id="cbx-large" label="Large combobox">
        <Combobox id="cbx-large" aria-labelledby="cbx-large-label" data={LARGE} maxVisibleItems={5} styles={{ popup: { minInlineSize: 360 } }} onValueChange={log('cbx-large')} />
      </Field>
    </>
  );
}

const REMOTE_COLUMNS: ComboboxColumn<{ value: number; label: string }>[] = [
  { field: 'value', header: 'Id', width: 90, align: 'end' },
  { field: 'label', header: 'Label' },
];
function RemoteColumns() {
  const [source] = useState(() => remoteSource(n));
  return <Combobox id="perf" aria-labelledby="perf-label" columns={REMOTE_COLUMNS} data={source} debounce={50} />;
}

function Perf() {
  const [data] = useState(() => (perf === 'columns' ? people(n) : items(n)));
  const label = <label id="perf-label" htmlFor="perf">{`${perf} ${n}`}</label>;
  if (perf === 'columns') {
    return (
      <main>
        {label}
        <Combobox id="perf" aria-labelledby="perf-label" columns={PEOPLE_COLUMNS} data={data as Person[]} getItemValue={(p) => p.id} getItemLabel={(p) => p.name} />
      </main>
    );
  }
  const list = data as { value: number; label: string }[];
  if (perf === 'columns-remote') {
    // the columns grid over a remote source reads ranges, never the whole table.
    return (
      <main>
        {label}
        <RemoteColumns />
      </main>
    );
  }
  if (perf === 'combobox') {
    return (
      <main>
        {label}
        <Combobox id="perf" aria-labelledby="perf-label" data={list} />
      </main>
    );
  }
  return (
    <main>
      {label}
      {perf === 'multi' ? (
        <Select id="perf" aria-labelledby="perf-label" multiple indicator="checkbox" showSelectAll data={list} onValueChange={log('perf')} />
      ) : (
        <Select id="perf" aria-labelledby="perf-label" data={list} searchable={perf === 'search'} onValueChange={log('perf')} />
      )}
    </main>
  );
}

interface Folder {
  id: string;
  label: string;
  children?: Folder[];
}
const FOLDERS: Folder[] = [{ id: 'docs', label: 'Documents', children: [{ id: 'cv', label: 'CV.pdf' }, { id: 'tax', label: 'Tax.pdf' }] }];

function Sizes() {
  return (
    <main>
      {(['sm', 'md', 'lg'] as const).map((size) => (
        <div key={size} data-size-row={size} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBlockEnd: 8 }}>
          <Select id={`select-${size}`} aria-label={`Select ${size}`} size={size} data={FRUITS} defaultValue="kiwi" clearable />
          <Combobox id={`cbx-${size}`} aria-label={`Combobox ${size}`} size={size} data={FRUITS} defaultValue="kiwi" clearable />
          <Combobox id={`cbx-chips-${size}`} aria-label={`Combobox chips ${size}`} size={size} multiple data={FRUITS} defaultValue={['apple']} />
          <TreeSelect<Folder> aria-label={`TreeSelect ${size}`} size={size} data={FOLDERS} getItemValue={(f) => f.id} getItemLabel={(f) => f.label} getChildren={(f) => f.children} defaultValue="cv" clearable />
        </div>
      ))}
    </main>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(<StrictMode>{params.has('sizes') ? <Sizes /> : perf ? <Perf /> : <Gallery />}</StrictMode>);
requestAnimationFrame(() => {
  window.__dd.ready = true;
});
