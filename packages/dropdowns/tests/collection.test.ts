// Dropdown collection primitives:
// collection model, search index, selection draft, type-ahead (shared
// roving module), virtual window math, store, and the remote adapter over a fake `@salmonui/data`
// source.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { DataSourceRequest, DataSourceResult } from '@salmonui/core/data';
import { createCollection, groupAtEntry } from '../dist/internal/collection/collection.js';
import { foldText } from '../dist/internal/collection/fold.js';
import { createSearchIndex, matchRanges } from '../dist/internal/collection/search.js';
import { isSelected, SELECT_ALL, SELECT_NONE, selectAllValues, selectedCount, selectedValues, setSelected, toggleSelected } from '../dist/internal/collection/selection.js';
import { createCollectionStore } from '../../core/dist/internal/collection/store.js';
import { createTypeahead, isTypeaheadKey, typeahead, TYPEAHEAD_MS } from '../../core/dist/internal/roving.js';
import { nearEnd, nextWindow, OVERSCAN, revealOffset, windowRange } from '../../core/dist/internal/collection/virtual.js';
import { createRemoteCollection, readValueItems } from '../dist/internal/collection/remote.js';

interface City {
  id: number;
  name: string;
  country: { name: string };
  region?: string;
  closed?: boolean;
}

const cities: City[] = [
  { id: 1, name: 'Zürich', country: { name: 'Switzerland' }, region: 'Europe' },
  { id: 2, name: 'Paris', country: { name: 'France' }, region: 'Europe' },
  { id: 3, name: 'Osaka', country: { name: 'Japan' }, region: 'Asia', closed: true },
  { id: 4, name: 'Ōita', country: { name: 'Japan' }, region: 'Asia' },
];

describe('collection model', () => {
  it('reads value and label from objects by default', () => {
    const c = createCollection([{ value: 'a', label: 'Alpha' }, { value: 'b' }]);
    assert.equal(c.size, 2);
    assert.equal(c.value(0), 'a');
    assert.equal(c.label(0), 'Alpha');
    assert.equal(c.label(1), 'b', 'label falls back to value');
    assert.equal(c.indexOf('b'), 1);
    assert.equal(c.indexOf('zz'), -1);
  });

  it('uses primitives as their own value and label', () => {
    const strings = createCollection(['red', 'green']);
    assert.equal(strings.value(1), 'green');
    assert.equal(strings.label(1), 'green');
    const numbers = createCollection([10, 20]);
    assert.equal(numbers.value(0), 10);
    assert.equal(numbers.label(0), '10');
    const booleans = createCollection([true, false]);
    assert.equal(booleans.value(1), false);
    assert.equal(booleans.label(1), 'false');
  });

  it('maps fields through accessor functions, nested paths included', () => {
    const c = createCollection(cities, { getItemValue: (x) => x.id, getItemLabel: (x) => `${x.name} (${x.country.name})` });
    assert.equal(c.value(1), 2);
    assert.equal(c.label(1), 'Paris (France)');
    assert.equal(c.indexOf(4), 3);
  });

  it('flattens contiguous groups into header and item entries', () => {
    const c = createCollection(cities, { getItemValue: (x) => x.id, getItemLabel: (x) => x.name, getItemGroup: (x) => x.region });
    const e = c.entries();
    assert.deepEqual([...e.codes], [-1, 0, 1, -2, 2, 3]);
    assert.deepEqual(e.groups, ['Europe', 'Asia']);
    assert.deepEqual([...e.headerAt], [0, 3]);
    assert.equal(e.itemCount, 4);
    assert.equal(groupAtEntry(e, 2), 'Europe', 'sticky header follows the first visible entry');
    assert.equal(groupAtEntry(e, 4), 'Asia');
    // Entries over a subset (search results) keep the headers of the groups present.
    const sub = c.entries(Int32Array.from([1, 3]));
    assert.deepEqual([...sub.codes], [-1, 1, -2, 3]);
  });

  it('reads the default `group` field and reports non-contiguous groups', () => {
    const c = createCollection([
      { value: 1, group: 'A' },
      { value: 2, group: 'B' },
      { value: 3, group: 'A' },
    ]);
    assert.equal(c.grouped, true);
    assert.deepEqual(c.splitGroups(), ['A']);
    assert.deepEqual([...c.entries().codes], [-1, 0, -2, 1, -3, 2], 'a split group renders a second header');
  });

  it('reads the default `disabled` field', () => {
    const c = createCollection([{ value: 1, disabled: true }, { value: 2 }]);
    assert.equal(c.disabled(0), true);
    assert.equal(c.disabled(1), false);
    const custom = createCollection(cities, { isItemDisabled: (x) => x.closed === true });
    assert.equal(custom.disabled(2), true);
  });

  it('reports duplicate values', () => {
    const c = createCollection(['a', 'b', 'a', 'c', 'b']);
    assert.deepEqual(c.duplicates(), ['a', 'b']);
    assert.equal(c.indexOf('a'), 0, 'the first occurrence wins');
  });

  it('never copies the items array', () => {
    const c = createCollection(cities);
    assert.equal(c.items, cities);
  });
});

describe('search index', () => {
  const labels = ['Apple', 'apricot', 'Banana', 'Crème brûlée', 'pineapple'];
  const c = createCollection(labels);

  it('filters with startsWith, contains and endsWith', () => {
    const index = createSearchIndex(c);
    assert.deepEqual([...(index.search('ap', 'startsWith') ?? [])], [0, 1]);
    assert.deepEqual([...(index.search('ap', 'contains') ?? [])], [0, 1, 4]);
    assert.deepEqual([...(index.search('ple', 'endsWith') ?? [])], [0, 4]);
    assert.equal(index.search('', 'contains'), null, 'empty text lists every item');
  });

  it('accepts a predicate operator', () => {
    const index = createSearchIndex(c);
    assert.deepEqual([...(index.search('x', (item: string) => item.length === 6) ?? [])], [2]);
  });

  it('is case-insensitive unless matchCase', () => {
    assert.deepEqual([...(createSearchIndex(c).search('apple', 'contains') ?? [])], [0, 4]);
    assert.deepEqual([...(createSearchIndex(c, { matchCase: true }).search('Apple', 'contains') ?? [])], [0]);
  });

  it('folds accents with ignoreAccents', () => {
    assert.deepEqual([...(createSearchIndex(c).search('creme', 'startsWith') ?? [])], []);
    assert.deepEqual([...(createSearchIndex(c, { ignoreAccents: true }).search('creme brulee', 'startsWith') ?? [])], [3]);
    assert.equal(foldText('Ōita', true), 'oita');
    assert.equal(foldText('Ōita', false, true), 'Ōita');
  });

  it('builds lazily and narrows from the previous matches', () => {
    let reads = 0;
    const counted = createCollection(labels, { getItemLabel: (x: string) => (reads++, x) });
    const index = createSearchIndex(counted);
    assert.equal(index.built, false);
    index.build();
    assert.equal(index.built, true);
    assert.equal(reads, labels.length, 'each label is read once');
    index.search('a', 'startsWith');
    index.search('ap', 'startsWith');
    assert.equal(reads, labels.length, 'later searches use the folded labels');
  });

  it('computes highlight ranges on the original label', () => {
    assert.deepEqual(matchRanges('Crème brûlée', 'bru', 'contains', { ignoreAccents: true }), [[6, 9]]);
    assert.deepEqual(matchRanges('Apple', 'ap', 'startsWith'), [[0, 2]]);
    assert.deepEqual(matchRanges('pineapple', 'ple', 'endsWith'), [[6, 9]]);
    assert.deepEqual(matchRanges('Apple', 'x', 'contains'), []);
    // A decomposed accent stays inside the highlighted range.
    assert.deepEqual(matchRanges('Crème', 'cre', 'startsWith', { ignoreAccents: true }), [[0, 4]]);
  });
});

describe('selection draft (base plus toggles)', () => {
  const c = createCollection(['a', 'b', 'c', 'd']);
  it('selects all without listing unloaded values', () => {
    let d = SELECT_ALL;
    d = toggleSelected(d, 'b');
    assert.equal(isSelected(d, 'a'), true);
    assert.equal(isSelected(d, 'b'), false);
    assert.equal(selectedCount(d, 1_000_000), 999_999);
    assert.deepEqual(selectedValues(d, c), ['a', 'c', 'd']);
  });

  it('toggles and sets ranges over a none base', () => {
    let d = SELECT_NONE;
    d = setSelected(d, ['c', 'a'], true);
    assert.deepEqual(selectedValues(d, c), ['a', 'c'], 'data order');
    d = setSelected(d, ['a'], false);
    assert.deepEqual(selectedValues(d, c), ['c']);
  });

  it('select all keeps disabled items as they are and honours a limit', () => {
    const items = createCollection([{ value: 1 }, { value: 2, disabled: true }, { value: 3 }, { value: 4 }]);
    assert.deepEqual(selectAllValues(items, new Set()), [1, 3, 4]);
    assert.deepEqual(selectAllValues(items, new Set([2])), [1, 2, 3, 4]);
    assert.deepEqual(selectAllValues(items, new Set(), 2), [1, 3]);
  });
});

describe('type-ahead (shared internal/roving.ts, used by Listbox)', () => {
  const labels = ['Apple', 'Avocado', 'Banana', 'Blueberry', 'Cherry'];
  const label = (i: number): string => labels[i] as string;
  const all = (): boolean => true;

  it('matches a prefix with a 500 ms buffer', () => {
    const t = createTypeahead();
    assert.equal(typeahead(t, 'b', 0, labels.length, -1, label, all), 2);
    assert.equal(typeahead(t, 'l', 100, labels.length, 2, label, all), 3, 'buffer "bl"');
    assert.equal(typeahead(t, 'c', 100 + TYPEAHEAD_MS + 1, labels.length, 3, label, all), 4, 'buffer reset after the timeout');
  });

  it('cycles with a repeated letter and skips disabled items', () => {
    const t = createTypeahead();
    assert.equal(typeahead(t, 'a', 0, labels.length, -1, label, all), 0);
    assert.equal(typeahead(t, 'a', 50, labels.length, 0, label, all), 1);
    assert.equal(typeahead(t, 'a', 100, labels.length, 1, label, all), 0, 'wraps around');
    assert.equal(typeahead(createTypeahead(), 'a', 0, labels.length, -1, label, (i) => i !== 0), 1);
  });

  it('is accent and case insensitive (Intl.Collator base)', () => {
    assert.equal(typeahead(createTypeahead(), 'é', 0, 2, -1, (i) => ['Zed', 'Eclair'][i] as string, all), 1);
  });

  it('accepts printable keys only', () => {
    assert.equal(isTypeaheadKey({ key: 'a', ctrlKey: false, metaKey: false, altKey: false }), true);
    assert.equal(isTypeaheadKey({ key: 'a', ctrlKey: true, metaKey: false, altKey: false }), false);
    assert.equal(isTypeaheadKey({ key: 'ArrowDown', ctrlKey: false, metaKey: false, altKey: false }), false);
  });
});

describe('virtual window', () => {
  it('mounts visible + 2 x overscan entries at most', () => {
    const w = windowRange(100_000, 500, 8);
    assert.equal(w.first, 500 - OVERSCAN);
    assert.equal(w.last - w.first, 8 + 2 * OVERSCAN);
    assert.deepEqual(windowRange(5, 0, 8), { first: 0, last: 5 });
    assert.deepEqual(windowRange(100, 99, 8), { first: 92 - OVERSCAN, last: 100 });
  });

  it('keeps the mounted window until the visible range leaves it', () => {
    let w = windowRange(1000, 0, 8);
    const commits: number[] = [];
    for (let start = 0; start < 200; start++) {
      const next = nextWindow(w, 1000, start, 8);
      if (next !== w) commits.push(start);
      w = next;
    }
    assert.ok(commits.length <= 200 / (OVERSCAN >> 1) + 1, `window commits ${commits.length} times for 200 rows`);
    assert.ok(w.first <= 199 && w.last >= 207);
  });

  it('requests the next range an overscan before the end', () => {
    assert.equal(nearEnd(86, 100, 8), true);
    assert.equal(nearEnd(85, 100, 8), false);
    assert.equal(nearEnd(10, 100, 8), false);
  });

  it('reveals an entry only when it is out of view', () => {
    assert.equal(revealOffset(5, 32, 0, 256), null);
    assert.equal(revealOffset(10, 32, 0, 256), 11 * 32 - 256);
    assert.equal(revealOffset(2, 32, 200, 256), 64);
  });
});

describe('collection store', () => {
  it('notifies only on change', () => {
    const s = createCollectionStore({ active: -1, first: 0, last: 20, itemHeight: 32, sticky: null });
    let calls = 0;
    const off = s.subscribe(() => calls++);
    s.set({ active: 3 });
    s.set({ active: 3 });
    s.set({ first: 0 });
    assert.equal(calls, 1);
    off();
    s.set({ active: 4 });
    assert.equal(calls, 1);
    assert.equal(s.getState().active, 4);
  });
});

// --- remote adapter -----------------------------------------------------------

interface Row {
  value: number;
  label: string;
}
const ROWS: Row[] = Array.from({ length: 1000 }, (_, i) => ({ value: i, label: `Item ${String(i).padStart(4, '0')}` }));

function fakeSource(options: { async?: boolean; fail?: boolean } = {}) {
  const requests: DataSourceRequest[] = [];
  const pending: (() => void)[] = [];
  const source = {
    read(request: DataSourceRequest): DataSourceResult<Row> | Promise<DataSourceResult<Row>> {
      requests.push(request);
      const search = request.query.search;
      const matching = search ? ROWS.filter((r) => r.label.toLowerCase().includes(search.text.toLowerCase())) : ROWS;
      const range = request.range ?? { start: 0, end: matching.length };
      const result = { version: request.version, rows: matching.slice(range.start, range.end), totalRowCount: matching.length };
      if (options.fail) {
        if (!options.async) throw new Error('boom');
        return new Promise((_, reject) => pending.push(() => reject(new Error('boom'))));
      }
      if (!options.async) return result;
      return new Promise((resolve) => pending.push(() => resolve(result)));
    },
  };
  const flush = async (): Promise<void> => {
    while (pending.length) pending.shift()!();
    await new Promise((r) => setTimeout(r, 0));
  };
  return { source, requests, flush };
}

describe('remote adapter', () => {
  it('reads a range and sizes the list from totalRowCount', () => {
    const { source, requests } = fakeSource();
    const r = createRemoteCollection(source, { blockSize: 50, debounce: 0 });
    r.ensure(0, 20);
    assert.equal(requests.length, 1);
    assert.deepEqual(requests[0]!.range, { start: 0, end: 50 });
    const s = r.getSnapshot();
    assert.equal(s.total, 1000, 'totalRowCount sets aria-setsize');
    assert.equal(s.item(10)?.label, 'Item 0010');
    assert.equal(s.item(60), undefined);
    r.ensure(40, 70);
    assert.equal(requests.length, 2);
    assert.deepEqual(requests[1]!.range, { start: 50, end: 100 });
    r.dispose();
  });

  it('turns the search text into the query search and merges the base query', () => {
    const { source, requests } = fakeSource();
    const r = createRemoteCollection(source, {
      debounce: 0,
      operator: 'contains',
      ignoreAccents: true,
      searchFields: ['label', 'code'],
      query: { filters: [{ columnId: 'active', operator: 'equal', value: true, predicate: 'and', source: 'api' }], sorting: [{ columnId: 'label', direction: 'asc' }] },
    });
    r.ensure(0, 20);
    r.setSearch('01');
    const last = requests.at(-1)!;
    assert.deepEqual(last.query.search, { text: '01', columnIds: ['label', 'code'], operator: 'contains', ignoreCase: true, ignoreAccent: true });
    assert.equal(last.query.filters.length, 1);
    assert.deepEqual(last.query.sorting, [{ columnId: 'label', direction: 'asc' }]);
    assert.deepEqual(last.range, { start: 0, end: 100 }, 'a new search starts at the top');
    assert.equal(r.getSnapshot().total, ROWS.filter((x) => x.label.includes('01')).length);
    r.dispose();
  });

  it('debounces remote searches', async () => {
    const { source, requests } = fakeSource();
    const r = createRemoteCollection(source, { debounce: 20 });
    r.ensure(0, 10);
    r.setSearch('1');
    r.setSearch('12');
    r.setSearch('123');
    assert.equal(requests.length, 1, 'no request while typing');
    await new Promise((res) => setTimeout(res, 40));
    assert.equal(requests.length, 2);
    assert.equal(requests[1]!.query.search?.text, '123');
    r.setSearch('');
    assert.equal(requests.length, 3, 'clearing the text restores the full list at once');
    assert.equal(requests[2]!.query.search, null);
    r.dispose();
  });

  it('holds requests below minSearchLength', () => {
    const { source, requests } = fakeSource();
    const r = createRemoteCollection(source, { debounce: 0, minSearchLength: 3 });
    r.ensure(0, 10);
    r.setSearch('It');
    assert.equal(requests.length, 1);
    assert.equal(r.getSnapshot().held, true);
    r.setSearch('Ite');
    assert.equal(requests.length, 2);
    r.dispose();
  });

  it('caps the list and the read range with maxResults', () => {
    const { source, requests } = fakeSource();
    const r = createRemoteCollection(source, { debounce: 0, maxResults: 20 });
    r.ensure(0, 100);
    assert.deepEqual(requests[0]!.range, { start: 0, end: 20 });
    assert.equal(r.getSnapshot().total, 20);
    r.dispose();
  });

  it('reads the items of values that are not loaded with one `in` filter', async () => {
    const seen: DataSourceRequest[] = [];
    const rows = [{ value: 3, label: 'Three' }, { value: 9, label: 'Nine' }];
    const source = {
      read(request: DataSourceRequest): Promise<DataSourceResult<{ value: number; label: string }>> {
        seen.push(request);
        const f = request.query.filters.at(-1) as unknown as { value: number[] };
        return Promise.resolve({ version: request.version, rows: rows.filter((r) => f.value.includes(r.value)), totalRowCount: 2 });
      },
    };
    const base = { filters: [{ columnId: 'active', operator: 'equal', value: true, predicate: 'and' as const, source: 'api' as const }] };
    const items = await readValueItems(source, [9, 3], 'value', base, new AbortController().signal);
    assert.deepEqual(items?.map((r) => r.label), ['Three', 'Nine']);
    assert.equal(seen.length, 1);
    assert.deepEqual(seen[0]?.range, { start: 0, end: 2 });
    assert.equal(seen[0]?.query.filters.length, 2, 'the base query filters are kept');
    assert.deepEqual(seen[0]?.query.filters[1], { columnId: 'value', operator: 'in', value: [9, 3], predicate: 'and', source: 'api' });
    const controller = new AbortController();
    const pending = readValueItems(source, [3], 'value', undefined, controller.signal);
    controller.abort();
    assert.equal(await pending, null, 'an aborted read resolves to null');
  });

  it('aborts superseded requests and drops stale responses', async () => {
    const { source, requests, flush } = fakeSource({ async: true });
    const r = createRemoteCollection(source, { debounce: 0 });
    r.ensure(0, 10);
    r.setSearch('Item 00');
    assert.equal(requests[0]!.signal.aborted, true, 'the first read was aborted by the search');
    r.setSearch('Item 000');
    assert.equal(requests[1]!.signal.aborted, true);
    await flush();
    const s = r.getSnapshot();
    assert.equal(s.search, 'Item 000');
    assert.equal(s.total, 10, 'only the newest response is applied');
    assert.equal(s.loading, false);
    r.dispose();
  });

  it('reports errors and retries', async () => {
    const { source, requests, flush } = fakeSource({ async: true, fail: true });
    const r = createRemoteCollection(source, { debounce: 0 });
    r.ensure(0, 10);
    await flush();
    assert.match(String(r.getSnapshot().error), /boom/);
    r.ensure(0, 10);
    assert.equal(requests.length, 1, 'no automatic re-read while failed');
    r.retry();
    assert.equal(requests.length, 2);
    r.dispose();
  });

  it('evicts far blocks beyond maxBlocks', () => {
    const { source } = fakeSource();
    const r = createRemoteCollection(source, { debounce: 0, blockSize: 10, maxBlocks: 3 });
    for (let b = 0; b < 6; b++) r.ensure(b * 10, b * 10 + 10);
    const s = r.getSnapshot();
    assert.equal(s.item(55)?.value, 55);
    assert.equal(s.item(5), undefined, 'the first block was evicted');
    r.dispose();
  });
});
