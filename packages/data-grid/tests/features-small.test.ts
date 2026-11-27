// Small render features: detection and the
// SSR markup of each feature through the static registry (no placeholder, the
// pending mark of a gated grid only, the same markup with the `features`
// prop), and the off values of an instance created without the feature.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { DataGrid } from '@salmonui/data-grid';
import { adaptive, infiniteScroll, lookup, persistState, rowPinning } from '@salmonui/data-grid/features';
import { requiredFeatures } from '../dist/data-grid/features/detect.js';
import { DataGridInstance } from '../dist/data-grid/instance.js';
import { count, newInstance, people, personColumns, render, type Person } from './fixtures.ts';

const PENDING = ' data-salmon-pending=""';

/** The server markup of a gated grid: the plain grid, the pending mark on its root, no placeholder, no boundary. */
function assertGatedMarkup(html: string): void {
  assert.match(html, /role="grid"[^>]*data-salmon-pending=""/);
  assert.equal(count(html, /data-salmon-pending/), 1, 'only the grid root is marked');
  assert.doesNotMatch(html, /<div[^>]*aria-busy="true"[^>]*data-salmon-pending/, 'no placeholder');
  assert.doesNotMatch(html, /<!--\$/, 'no Suspense boundary of its own');
}

describe('rowPinning render feature', () => {
  it('is required by isRowPinned or defaultPinnedRows ([] counts)', () => {
    assert.deepEqual(requiredFeatures({ columns: [] } as never), []);
    assert.deepEqual(requiredFeatures({ columns: [], defaultPinnedRows: [] } as never), ['rowPinning']);
    assert.deepEqual(requiredFeatures({ columns: [], isRowPinned: () => false } as never), ['rowPinning']);
  });

  it('renders the pinned rows on the server; the features prop gives the same markup without the gate', () => {
    const html = render({ rows: 20, defaultPinnedRows: ['p7'] });
    assertGatedMarkup(html);
    assert.match(html, /salmon-data-grid-frozen-rows--top[\s\S]*data-row-id="p7"[^>]*data-pinned/);
    assert.equal(render({ rows: 20, defaultPinnedRows: ['p7'], features: [rowPinning] }), html.replace(PENDING, ''));
    // A provided feature whose trigger does not hold changes nothing.
    assert.equal(render({ rows: 5, features: [rowPinning] }), render({ rows: 5 }));
  });

  it('without the feature the API answers the off values', () => {
    const on = newInstance<Person>({ data: people(5), columns: personColumns, defaultPinnedRows: ['p2'] }, ':rp1:');
    assert.deepEqual(on.api.getPinnedRowIds(), ['p2']);
    const bare = new DataGridInstance<Person>({ data: people(5), columns: personColumns, defaultPinnedRows: ['p2'] } as never, ':rp2:');
    assert.equal(bare.engine.getModuleState('rowPinning'), undefined);
    assert.deepEqual(bare.api.getPinnedRowIds(), []);
    assert.equal(bare.api.isRowPinned('p2'), false);
    assert.equal(bare.api.pinRows('p1').status, 'rejected');
  });
});

interface Sale {
  readonly id: string;
  readonly dept: string;
}
const sales: readonly Sale[] = [
  { id: 's1', dept: 'd1' },
  { id: 's2', dept: 'd2' },
];
const DEPTS = { data: [{ code: 'd1', label: 'Sales' }, { code: 'd2', label: 'Support' }], keyField: 'code', displayField: 'label' };
const saleColumns = (dept: Record<string, unknown> = {}) => [{ field: 'id', header: 'ID', primaryKey: true }, { field: 'dept', header: 'Dept', ...dept }];

function renderSales(props: Record<string, unknown>): string {
  return renderToString(createElement(DataGrid as never, { 'aria-label': 'Sales', data: sales, ...props }));
}

describe('lookup render feature', () => {
  it('is required by any declared column with lookup, nested and hidden ones included', () => {
    assert.deepEqual(requiredFeatures({ columns: saleColumns() } as never), []);
    assert.deepEqual(requiredFeatures({ columns: saleColumns({ lookup: DEPTS }) } as never), ['lookup']);
    assert.deepEqual(requiredFeatures({ columns: [{ header: 'Group', columns: saleColumns({ lookup: DEPTS }) }] } as never), ['lookup']);
    assert.deepEqual(requiredFeatures({ columns: saleColumns({ lookup: DEPTS, hidden: true }) } as never), ['lookup']);
  });

  it('renders display values on the server; the features prop gives the same markup without the gate', () => {
    const html = renderSales({ columns: saleColumns({ lookup: DEPTS }) });
    assertGatedMarkup(html);
    assert.match(html, />Sales</);
    assert.match(html, />Support</);
    assert.equal(renderSales({ columns: saleColumns({ lookup: DEPTS }), features: [lookup] }), html.replace(PENDING, ''));
  });

  it('a lookup column added after creation shows display values without a warning when the module is registered', async () => {
    const { createLookupModule } = await import('@salmonui/data-grid/engine/lookup');
    const warnings: string[] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => void warnings.push(args.map(String).join(' '));
    try {
      const withModule = newInstance<Sale>({ id: 'late-lookup-1', data: sales, columns: saleColumns(), modules: [createLookupModule()] }, ':lk1:');
      withModule.syncProps({ id: 'late-lookup-1', data: sales, columns: saleColumns({ lookup: DEPTS }), modules: [createLookupModule()] } as never);
      const column = withModule.engine.getSnapshot().columns.byId.get('dept');
      assert.equal(column?.accessor(sales[0] as never), 'Sales');
      assert.deepEqual(warnings.filter((w) => w.includes('lookup')), []);
      // Without the module (creation-only) the late column has no display values, and development builds say so.
      const bare = newInstance<Sale>({ id: 'late-lookup-2', data: sales, columns: saleColumns() }, ':lk2:');
      bare.syncProps({ id: 'late-lookup-2', data: sales, columns: saleColumns({ lookup: DEPTS }) } as never);
      assert.equal(bare.engine.getSnapshot().columns.byId.get('dept')?.accessor(sales[0] as never), 'd1');
      assert.equal(warnings.filter((w) => w.includes('lookup column was added after')).length, 1);
    } finally {
      console.warn = original;
    }
  });
});

describe('persistState render feature', () => {
  const storageOf = (stored: unknown) => {
    const calls: string[] = [];
    return { calls, storage: { load: (key: string) => (calls.push(`load:${key}`), stored), save: (key: string) => void calls.push(`save:${key}`), remove: (key: string) => void calls.push(`remove:${key}`) } };
  };

  it('is required by persistState (false and absent are off)', () => {
    assert.deepEqual(requiredFeatures({ columns: [], persistState: false } as never), []);
    assert.deepEqual(requiredFeatures({ columns: [], persistState: true } as never), ['persistState']);
    assert.deepEqual(requiredFeatures({ columns: [], persistState: {} } as never), ['persistState']);
  });

  it('renders the definition state on the server; the features prop gives the same markup without the gate', () => {
    const { calls, storage } = storageOf(null);
    const html = render({ rows: 5, id: 'ps', persistState: { storage } });
    assertGatedMarkup(html);
    assert.equal(render({ rows: 5, id: 'ps', persistState: { storage }, features: [persistState] }), html.replace(PENDING, ''));
    assert.equal(html.replace(PENDING, ''), render({ rows: 5, id: 'ps' }));
    assert.deepEqual(calls, [], 'no storage access while rendering');
  });

  it('restores in mount; the state API is static and resetState drops the stored entry only while bound', async () => {
    const stored = { version: 1, sorting: [{ field: 'age', direction: 'desc' }] };
    const { calls, storage } = storageOf(stored);
    const instance = newInstance<Person>({ id: 'ps2', data: people(5), columns: personColumns, sorting: true, persistState: { storage } }, ':ps2:');
    const unmount = instance.mount();
    await Promise.resolve();
    await Promise.resolve();
    assert.deepEqual(calls, ['load:salmon-data-grid:ps2']);
    assert.equal(instance.api.getState().sorting?.[0]?.field, 'age');
    instance.api.resetState();
    assert.ok(calls.includes('remove:salmon-data-grid:ps2'));
    unmount();
    // Without the feature: getState / restoreState / resetState work and nothing touches a storage.
    const bare = new DataGridInstance<Person>({ id: 'ps3', data: people(5), columns: personColumns, sorting: true, persistState: { storage } } as never, ':ps3:');
    const off = bare.mount();
    bare.api.restoreState(stored as never);
    assert.equal(bare.api.getState().sorting?.[0]?.field, 'age');
    bare.api.resetState();
    assert.equal(bare.api.getState().sorting?.length ?? 0, 0);
    off();
    assert.deepEqual(calls.filter((c) => c.endsWith(':ps3')), []);
  });
});

describe('adaptive render feature', () => {
  it('is required by adaptive (false and absent are off)', () => {
    assert.deepEqual(requiredFeatures({ columns: [], adaptive: false } as never), []);
    assert.deepEqual(requiredFeatures({ columns: [], adaptive: true } as never), ['adaptive']);
    assert.deepEqual(requiredFeatures({ columns: [], adaptive: { target: 'mobile' } } as never), ['adaptive']);
  });

  it("renders the adaptive layout on the server (target 'both', defaultActive); the features prop gives the same markup", () => {
    const html = render({ rows: 5, adaptive: { rowLayout: 'vertical' }, sorting: true });
    assertGatedMarkup(html);
    assert.match(html, /role="grid"[^>]*data-adaptive=""[^>]*data-row-layout="vertical"/);
    assert.equal(count(html, /salmon-data-grid-card"/), 5);
    assert.match(html, /salmon-data-grid-adaptive-bar/);
    assert.equal(render({ rows: 5, adaptive: { rowLayout: 'vertical' }, sorting: true, features: [adaptive] }), html.replace(PENDING, ''));
    // Mobile target: not measured on the server, so `defaultActive` decides.
    assert.match(render({ rows: 5, adaptive: { target: 'mobile', defaultActive: true } }), /data-adaptive=""/);
    assert.doesNotMatch(render({ rows: 5, adaptive: { target: 'mobile' } }), /data-adaptive/);
    assert.equal(render({ rows: 5, features: [adaptive] }), render({ rows: 5 }));
  });

  it('without the feature the instance has no controller and the API answers the off values', () => {
    const on = newInstance<Person>({ data: people(5), columns: personColumns, adaptive: true }, ':ad1:');
    assert.ok(on.adaptive);
    assert.equal(on.api.isAdaptive(), true);
    const bare = new DataGridInstance<Person>({ data: people(5), columns: personColumns, adaptive: true } as never, ':ad2:');
    assert.equal(bare.adaptive, null);
    assert.equal(bare.api.isAdaptive(), false);
    bare.api.openSortDialog();
  });
});

describe('infiniteScroll render feature', () => {
  const pendingSource = () => ({ mode: 'remote' as const, read: () => new Promise<never>(() => {}) });

  it('is required by infiniteScroll (false and absent are off)', () => {
    assert.deepEqual(requiredFeatures({ columns: [], infiniteScroll: false } as never), []);
    assert.deepEqual(requiredFeatures({ columns: [], infiniteScroll: true } as never), ['infiniteScroll']);
  });

  it('renders the loading row or the seeded rows on the server; the features prop gives the same markup', () => {
    const source = pendingSource();
    const loading = render({ data: source as never, infiniteScroll: true });
    assertGatedMarkup(loading);
    assert.equal(count(loading, /data-row-id="__loading:/), 1);
    assert.equal(render({ data: source as never, infiniteScroll: true, features: [infiniteScroll] }), loading.replace(PENDING, ''));
    const seeded = render({ data: source as never, infiniteScroll: { blockSize: 100, initialResult: { rows: people(100), totalRowCount: 5000 } } });
    assert.match(seeded, /aria-rowcount="5001"/);
    assert.match(seeded, /data-row-id="p0"/);
  });

  it('without the feature no stand-in is registered and no loading row renders', () => {
    const bare = new DataGridInstance<Person>({ data: people(5), columns: personColumns, infiniteScroll: true } as never, ':inf1:');
    assert.equal(bare.engine.getModuleState('infiniteScroll'), undefined);
    assert.equal(bare.features.parts.LoadingRow, null);
    const on = newInstance<Person>({ data: people(5), columns: personColumns, infiniteScroll: true }, ':inf2:');
    assert.ok(on.engine.getModuleState('infiniteScroll'));
    assert.ok(on.features.parts.LoadingRow);
  });
});
