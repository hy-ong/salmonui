// Infinite scroll: range reads from the viewport,
// prefetch, debounce and stale aborts, the block cache with `maxBlocks`,
// known and unknown totals, query resets, grouping hand-off, selection,
// keyboard focus onto placeholders, write echoes, the seeded first block
// (SSR) and the load-next API, over a fake remote source and a manual clock.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createFocusModule,
  createDataGridEngine,
  createGroupingModule,
  createSelectionModule,
  createSortModule,
  type ColumnDef,
  type DataSourceEvent,
  type DataSourceRequest,
  type DataSourceResult,
  type DataSource,
  type DataGridModule,
  type RowModelView,
  type WriteRequest,
  type WriteResult,
} from '@salmonui/data-grid/engine';
import { createEditApi, createEditModule } from '@salmonui/data-grid/engine/edit';
import {
  createInfiniteScrollModule,
  INFINITE_LOADING_ID_PREFIX,
  type InfiniteScheduler,
  type InfiniteScrollOptions,
  type InfiniteScrollState,
  type InfiniteScrollStats,
} from '@salmonui/data-grid/engine/infinite';

interface Item {
  readonly id: string;
  readonly n: number;
  readonly label: string;
}

const columns: ColumnDef<Item>[] = [
  { field: 'id', primaryKey: true },
  { field: 'n', type: 'number' },
  { field: 'label' },
];

function items(count: number): Item[] {
  return Array.from({ length: count }, (_, i) => ({ id: `r${i}`, n: i, label: `row ${i}` }));
}

interface FakeOptions {
  readonly total?: boolean;
  readonly sync?: boolean;
  /** Answer `pageInfo.hasNextPage` (default true). */
  readonly pageInfo?: boolean;
}

function fakeRemote(all: Item[], opts: FakeOptions = {}) {
  const requests: DataSourceRequest[] = [];
  const settles: (() => void)[] = [];
  const listeners = new Set<(e: DataSourceEvent<Item>) => void>();
  const writes: WriteRequest<Item>[] = [];
  let fail = false;
  const answer = (request: DataSourceRequest): DataSourceResult<Item> => {
    let rows = all;
    const sort = request.query.sorting[0];
    if (sort) rows = [...all].sort((a, b) => (sort.direction === 'desc' ? b.n - a.n : a.n - b.n));
    const range = request.range ?? { start: 0, end: rows.length };
    const page = rows.slice(range.start, range.end);
    return {
      version: request.version,
      rows: page,
      ...(opts.total === false ? {} : { totalRowCount: rows.length }),
      performed: ['search', 'filter', 'sort', 'page'],
      ...(opts.pageInfo === false ? {} : { pageInfo: { hasNextPage: range.end < rows.length } }),
    };
  };
  const source: DataSource<Item> = {
    mode: 'remote',
    read(request) {
      requests.push(request);
      if (opts.sync) return answer(request);
      return new Promise((resolve, reject) => {
        request.signal.addEventListener?.('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
        settles.push(() => {
          if (request.signal.aborted) return;
          if (fail) reject(new Error('boom'));
          else resolve(answer(request));
        });
      });
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    // A server that appends added rows at the end of the data (a new row at the bottom).
    async write(request: WriteRequest<Item>): Promise<WriteResult<Item>> {
      writes.push(request);
      await Promise.resolve();
      const added = request.added.map((a, k) => {
        const n = all.length + k;
        return { tempId: a.tempId, row: { ...a.row, id: `r${n}`, n } };
      });
      for (const a of added) all.push(a.row);
      for (const l of listeners) l({ type: 'patch', rows: added.map((a) => a.row), updated: [], added: added.map((a) => a.row.id), removed: [] });
      return { version: request.version, status: 'applied', added, changed: [], deleted: [] };
    },
  };
  return {
    source,
    requests,
    writes,
    /** Settles every pending read (and the ones they trigger), then drains microtasks. */
    async flush(): Promise<void> {
      for (let i = 0; i < 20; i++) {
        while (settles.length) (settles.shift() as () => void)();
        await new Promise((r) => setTimeout(r, 0));
      }
    },
    /** Settles only the reads pending now. */
    async settleOnce(): Promise<void> {
      const now = settles.splice(0);
      for (const s of now) s();
      for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0));
    },
    emit(event: DataSourceEvent<Item>) {
      for (const l of listeners) l(event);
    },
    setFail(v: boolean) {
      fail = v;
    },
  };
}

function manualClock() {
  let now = 1_000;
  let seq = 0;
  const timers = new Map<number, { at: number; run: () => void }>();
  const scheduler: InfiniteScheduler = {
    now: () => now,
    setTimeout(run, ms) {
      const id = ++seq;
      timers.set(id, { at: now + ms, run });
      return id;
    },
    clearTimeout(h) {
      timers.delete(h as number);
    },
  };
  return {
    scheduler,
    advance(ms: number) {
      now += ms;
      for (const [id, t] of [...timers].sort((a, b) => a[1].at - b[1].at)) {
        if (t.at > now) continue;
        timers.delete(id);
        t.run();
      }
    },
    get pending() {
      return timers.size;
    },
  };
}

interface InfiniteFacade {
  getStatus(): InfiniteScrollState;
  getStats(): InfiniteScrollStats;
  ensureRange(start: number, end: number): void;
  isRowLoaded(index: number): boolean;
}

function setup(all: Item[], options: InfiniteScrollOptions<Item> = {}, fake: FakeOptions = {}, extra: DataGridModule<Item, any, any>[] = [], engineOptions: Record<string, unknown> = {}) {
  const remote = fakeRemote(all, fake);
  const clock = manualClock();
  const engine = createDataGridEngine({
    getRowId: (r: Item) => r.id,
    columns,
    dataSource: remote.source,
    modules: [createSortModule<Item>(), createSelectionModule<Item>(), createFocusModule<Item>(), ...extra, createInfiniteScrollModule<Item>({ scheduler: clock.scheduler, ...options })],
    ...engineOptions,
  });
  const inf = (engine as unknown as { infiniteScroll: InfiniteFacade }).infiniteScroll;
  const view = (): RowModelView => engine.getSnapshot().rows.view as RowModelView;
  return { engine, remote, clock, inf, view };
}

describe('infinite scroll', () => {
  it('requests the initial blocks as one range and renders placeholders for the rest', async () => {
    const { engine, remote, inf, view } = setup(items(1000), { blockSize: 50, initialBlocks: 2 });
    assert.equal(remote.requests.length, 1);
    assert.deepEqual(remote.requests[0]?.range, { start: 0, end: 100 });
    assert.equal(engine.getSnapshot().rows.count, 1, 'one loading row before the first result');
    assert.equal(view().kindAt(0), 'loading');
    await remote.flush();
    const snap = engine.getSnapshot();
    assert.equal(snap.rows.count, 1000, 'known total: the scroll range covers every row');
    assert.equal(view().kind, 'infinite');
    assert.equal(engine.getRowIdAt(99), 'r99');
    assert.equal(engine.getRowIdAt(100), `${INFINITE_LOADING_ID_PREFIX}100`);
    assert.equal(view().kindAt(100), 'loading');
    assert.equal(engine.getRow('r42')?.label, 'row 42');
    assert.equal(engine.getRowIndex('r42'), 42);
    assert.equal(engine.getRowSnapshot('r42')?.kind, 'data');
    assert.equal(engine.getCellSnapshot('r42', 'label')?.formattedValue, 'row 42');
    assert.equal(inf.getStatus().loadedRowCount, 100);
    assert.equal(inf.getStatus().totalRowCount, 1000);
    assert.equal(remote.requests.length, 1, 'nothing is prefetched before the renderer reports a range');
  });

  it('prefetches ahead of the viewport, one read in flight, and costs about one read per block scrolled ( request count)', async () => {
    const { remote, inf, clock } = setup(items(20_000), { blockSize: 100, initialBlocks: 1 });
    await remote.flush();
    // Scroll 10,000 rows (3 rows per window change) with a 20-row viewport; reads settle as the clock moves.
    for (let top = 0; top < 10_000; top += 3) {
      inf.ensureRange(top, top + 20);
      clock.advance(5);
      if (top % 21 === 0) await remote.settleOnce();
    }
    await remote.flush();
    const reads = remote.requests.length;
    assert.ok(reads <= Math.ceil(10_000 / 100) + 2, `reads per distance: ${reads}`);
    assert.ok(reads >= 100, `every block was read: ${reads}`);
    for (const r of remote.requests) assert.ok((r.range as { end: number }).end - (r.range as { start: number }).start <= 300, 'reads stay block sized');
    assert.ok(inf.isRowLoaded(10_010), 'the threshold prefetched past the viewport');
    // Reporting a loaded range again is a cache hit: no read, no timer.
    const before = remote.requests.length;
    inf.ensureRange(500, 520);
    assert.equal(remote.requests.length, before);
    assert.equal(clock.pending, 0);
  });

  it('debounces jumps and aborts stale reads (scrollbar drag)', async () => {
    const { remote, inf, clock } = setup(items(1_000_000), { blockSize: 100, debounceMs: 50 });
    await remote.flush();
    const base = remote.requests.length;
    inf.ensureRange(400_000, 400_020);
    clock.advance(10);
    inf.ensureRange(600_000, 600_020);
    clock.advance(10);
    inf.ensureRange(800_000, 800_020);
    assert.equal(remote.requests.length, base, 'no read while the viewport is moving');
    clock.advance(60);
    assert.equal(remote.requests.length, base + 1, 'one read once the viewport is still');
    const target = remote.requests.at(-1) as DataSourceRequest;
    assert.ok((target.range as { start: number }).start <= 800_000 && (target.range as { end: number }).end > 800_020);
    // Jump away while it is in flight: the read is aborted.
    inf.ensureRange(100_000, 100_020);
    assert.equal(target.signal.aborted, true, 'stale read aborted');
    assert.equal(inf.getStats().aborted, 1);
    clock.advance(60);
    await remote.flush();
    assert.ok(inf.isRowLoaded(100_000));
    assert.ok(!inf.isRowLoaded(800_000), 'the aborted block was never placed');
  });

  it('bounds memory with cache + maxBlocks, evicts farthest first and re-reads on return', async () => {
    const { remote, inf, clock, engine } = setup(items(100_000), { blockSize: 100, cache: true, maxBlocks: 3, threshold: 10 });
    await remote.flush();
    for (let top = 0; top < 5_000; top += 50) {
      inf.ensureRange(top, top + 20);
      clock.advance(60);
      await remote.flush();
      assert.ok(inf.getStatus().loadedRowCount <= 300, `held rows ${inf.getStatus().loadedRowCount}`);
    }
    assert.ok(inf.getStats().evicted > 0);
    assert.equal(engine.getRow('r0'), undefined, 'evicted rows are gone');
    assert.equal(engine.getRowIdAt(0), `${INFINITE_LOADING_ID_PREFIX}0`, 'and render as placeholders again');
    const before = remote.requests.length;
    inf.ensureRange(0, 20);
    clock.advance(60);
    await remote.flush();
    assert.equal(remote.requests.length, before + 1, 'returning re-reads the evicted block');
    assert.equal(engine.getRow('r5')?.n, 5);
    // Without cache every block is kept (the default).
    const all = setup(items(10_000), { blockSize: 100 });
    await all.remote.flush();
    for (let top = 0; top < 2_000; top += 50) {
      all.inf.ensureRange(top, top + 20);
      all.clock.advance(60);
      await all.remote.flush();
    }
    assert.ok(all.inf.getStatus().loadedRowCount >= 2_000);
  });

  it('grows with an unknown total and stops at the end (cursor-style sources)', async () => {
    const { engine, remote, inf, clock } = setup(items(250), { blockSize: 100, initialBlocks: 1 }, { total: false });
    await remote.flush();
    assert.equal(engine.getSnapshot().rows.count, 101, 'loaded rows plus one loading row');
    assert.equal(inf.getStatus().totalRowCount, null);
    assert.equal(inf.getStatus().hasMore, true);
    inf.ensureRange(85, 101);
    clock.advance(60);
    await remote.flush();
    assert.equal(engine.getSnapshot().rows.count, 201);
    inf.ensureRange(190, 201);
    clock.advance(60);
    await remote.flush();
    assert.equal(engine.getSnapshot().rows.count, 250, 'a short block ends the data');
    assert.equal(inf.getStatus().hasMore, false);
    assert.equal(inf.getStatus().totalRowCount, 250);
    const reads = remote.requests.length;
    inf.ensureRange(230, 250);
    clock.advance(60);
    assert.equal(remote.requests.length, reads, 'nothing past the end');
  });

  it('resets on a query change: aborts reads, drops blocks, bumps the generation', async () => {
    const { engine, remote, inf, clock } = setup(items(5_000), { blockSize: 100 });
    await remote.flush();
    inf.ensureRange(2_000, 2_020);
    clock.advance(60);
    const inFlight = remote.requests.at(-1) as DataSourceRequest;
    const generation = inf.getStatus().generation;
    engine.dispatch({ type: 'sort.toggle', columnId: 'n' });
    engine.dispatch({ type: 'sort.toggle', columnId: 'n' });
    assert.equal(inFlight.signal.aborted, true);
    await remote.flush();
    assert.ok(inf.getStatus().generation > generation);
    const last = remote.requests.at(-1) as DataSourceRequest;
    assert.deepEqual(last.range, { start: 0, end: 300 }, 'initial blocks of the new query');
    assert.equal(engine.getRowIdAt(0), 'r4999', 'descending order from the server');
    assert.equal(engine.getRow('r2000'), undefined, 'old blocks dropped');
  });

  it('yields to grouping and returns when grouping is cleared', async () => {
    const { engine, remote, inf } = setup(items(300), { blockSize: 100 }, {}, [createGroupingModule<Item>() as DataGridModule<Item, any, any>]);
    await remote.flush();
    assert.equal(engine.getSnapshot().rows.view?.kind, 'infinite');
    engine.dispatch({ type: 'grouping.groupBy', columnId: 'label' } as never);
    await remote.flush();
    assert.equal(inf.getStatus().active, false);
    assert.notEqual(engine.getSnapshot().rows.view?.kind, 'infinite');
    assert.equal(remote.requests.at(-1)?.range, undefined, 'grouped read is a plain read');
    engine.dispatch({ type: 'grouping.clear' } as never);
    await remote.flush();
    assert.equal(inf.getStatus().active, true);
    assert.equal(engine.getSnapshot().rows.view?.kind, 'infinite');
  });

  it('selects loaded rows and moves keyboard focus onto unloaded rows, then follows them when they load', async () => {
    const { engine, remote, inf, clock } = setup(items(1_000), { blockSize: 100, initialBlocks: 1 });
    await remote.flush();
    engine.dispatch({ type: 'selection.selectRows', rowIds: ['r7'] });
    const selection = (engine as unknown as { selection: { getSelectedRowIds(): readonly string[]; isRowSelected(id: string): boolean } }).selection;
    assert.deepEqual([...selection.getSelectedRowIds()], ['r7']);
    assert.equal(selection.isRowSelected('r7'), true);
    engine.dispatch({ type: 'focus.set', target: { kind: 'cell', rowId: 'r99', columnId: 'label' } });
    engine.dispatch({ type: 'focus.move', direction: 'down' });
    const target = () => (engine.getModuleState('focus') as { target: { rowId: string } }).target.rowId;
    assert.equal(target(), `${INFINITE_LOADING_ID_PREFIX}100`, 'focus moved onto the placeholder');
    inf.ensureRange(90, 110);
    clock.advance(60);
    await remote.flush();
    assert.equal(target(), 'r100', 'focus follows the row once it loads');
    // Ctrl+End to the last row of a known total: load then focus.
    engine.dispatch({ type: 'focus.move', direction: 'lastCell' });
    assert.equal(target(), `${INFINITE_LOADING_ID_PREFIX}999`);
    inf.ensureRange(980, 1000);
    clock.advance(60);
    await remote.flush();
    assert.equal(target(), 'r999');
  });

  it('applies write echoes to loaded rows and reloads visible blocks after structural writes', async () => {
    const { engine, remote, inf, clock } = setup(items(500), { blockSize: 100 });
    await remote.flush();
    const changed: Item = { id: 'r5', n: 5, label: 'edited' };
    remote.emit({ type: 'patch', rows: [changed], updated: ['r5'], added: [], removed: [] });
    await remote.flush();
    assert.equal(engine.getRow('r5')?.label, 'edited');
    assert.equal(engine.getCellSnapshot('r5', 'label')?.formattedValue, 'edited');
    assert.equal(engine.getSnapshot().rows.source.length, 0, 'the engine source rows are untouched');
    inf.ensureRange(0, 20);
    const before = remote.requests.length;
    remote.emit({ type: 'reset', rows: [] });
    assert.equal(engine.getRow('r1')?.label, 'row 1', 'visible rows stay while they reload');
    clock.advance(60);
    await remote.flush();
    assert.equal(remote.requests.length, before + 1);
    assert.equal(engine.getRow('r5')?.label, 'row 5', 'reloaded from the source');
  });

  it('adds a row at the bottom: the write lands at the end, the row count grows and the last block re-reads in full', async () => {
    const variants: [string, FakeOptions][] = [
      ['known total', {}],
      ['known total without pageInfo', { pageInfo: false }],
      ['unknown total', { total: false }],
    ];
    for (const [name, fake] of variants) {
      // 450 rows: the last block (rows 400-449) is short, so the new row 450 lands inside it.
      const { engine, remote, inf, clock, view } = setup(items(450), { blockSize: 100 }, fake, [createEditModule<Item>()], { edit: { newRowPosition: 'bottom' } });
      const api = createEditApi(engine as never);
      const settle = async () => {
        for (let i = 0; i < 4; i++) {
          clock.advance(60);
          await remote.flush();
        }
      };
      await remote.flush();
      inf.ensureRange(400, 450);
      await settle();
      inf.ensureRange(400, 450);
      await settle();
      assert.equal(engine.getSnapshot().rows.count, 450, `${name}: before the add`);
      assert.ok(inf.isRowLoaded(449));
      assert.equal(engine.dispatch({ type: 'edit.addRecord', values: { id: 'draft', label: 'added at the bottom' } } as never).status, 'applied');
      const state = () => engine.getModuleState('edit') as { addedRowIds: readonly string[]; active: { isNew: boolean } | null };
      assert.equal(state().addedRowIds.length, 1, 'the draft row is open');
      assert.equal((engine as unknown as { edit: { getAddedRowPosition(id: string): string } }).edit.getAddedRowPosition(state().addedRowIds[0] as string), 'bottom');
      const reads = remote.requests.length;
      api.save();
      await api.whenEditSettled();
      await settle();
      assert.equal(remote.writes.length, 1);
      assert.equal(remote.writes[0]?.added[0]?.row.label, 'added at the bottom');
      assert.deepEqual(state().addedRowIds, [], 'the saved draft is gone');
      assert.ok(remote.requests.length > reads, 'the visible blocks were re-read');
      const last = remote.requests.at(-1) as DataSourceRequest;
      assert.ok((last.range as { end: number }).end >= 451, 'the re-read reaches past the old end');
      assert.equal(engine.getSnapshot().rows.count, 451, `${name}: the row count includes the new row`);
      assert.equal(inf.getStatus().totalRowCount, 451);
      assert.ok(inf.isRowLoaded(450), 'the new row is loaded, not a placeholder');
      assert.equal(view().kindAt(450), 'data');
      assert.equal(engine.getRowIdAt(450), 'r450');
      assert.equal(engine.getRow('r450')?.label, 'added at the bottom');
      assert.equal(engine.getRowIdAt(449), 'r449', 'the rows above stay in place');
      assert.equal(inf.getStatus().hasMore, false);
    }
  });

  it('a row added while the viewport is away from the end grows the total and loads when scrolled to', async () => {
    for (const total of [true, false]) {
      const { engine, remote, inf, clock } = setup(items(500), { blockSize: 100, initialBlocks: 5 }, { total }, [createEditModule<Item>()], { edit: { newRowPosition: 'bottom' } });
      const api = createEditApi(engine as never);
      await remote.flush();
      assert.equal(engine.getSnapshot().rows.count, 500);
      inf.ensureRange(0, 20);
      engine.dispatch({ type: 'edit.addRecord', values: { id: 'draft', label: 'appended' } } as never);
      api.save();
      await api.whenEditSettled();
      clock.advance(60);
      await remote.flush();
      if (total) assert.equal(engine.getSnapshot().rows.count, 501, 'known total: the server total grows');
      inf.ensureRange(480, 501);
      clock.advance(60);
      await remote.flush();
      clock.advance(60);
      await remote.flush();
      assert.equal(engine.getSnapshot().rows.count, 501, `${total ? 'known' : 'unknown'} total after scrolling to the end`);
      assert.equal(engine.getRowIdAt(500), 'r500');
      assert.equal(engine.getRow('r500')?.label, 'appended');
    }
  });

  it('a row removed at the end of an unknown total shrinks the row count after the reload', async () => {
    const all = items(450);
    const { engine, remote, inf, clock } = setup(all, { blockSize: 100 }, { total: false });
    const settle = async () => {
      for (let i = 0; i < 4; i++) {
        clock.advance(60);
        await remote.flush();
      }
    };
    await remote.flush();
    for (let i = 0; i < 2; i++) {
      inf.ensureRange(400, 450);
      await settle();
    }
    assert.equal(engine.getSnapshot().rows.count, 450);
    const removed = all.pop() as Item;
    remote.emit({ type: 'patch', rows: [], updated: [], added: [], removed: [removed.id] });
    await settle();
    assert.equal(engine.getSnapshot().rows.count, 449);
    assert.equal(engine.getRow('r449'), undefined);
    assert.equal(inf.getStatus().hasMore, false);
  });

  it('renders a seeded first block synchronously and does not request it again (SSR)', async () => {
    const all = items(1_000);
    const seed = { rows: all.slice(0, 300), totalRowCount: 1_000 };
    const { engine, remote } = setup(all, { blockSize: 100, initialResult: seed }, {}, [], { deferDataSource: true });
    const server = engine.getServerSnapshot();
    assert.equal(server.rows.count, 1_000);
    assert.equal(engine.getRowIdAt(299), 'r299');
    assert.equal(remote.requests.length, 0, 'no read before connect');
    engine.connect();
    await remote.flush();
    assert.equal(remote.requests.length, 0, 'the seeded blocks are not requested again');
    assert.equal(engine.getRowIdAt(10), 'r10');
  });

  it('loads the next block on command, reports errors and retries', async () => {
    const { engine, remote, inf } = setup(items(1_000), { blockSize: 100, initialBlocks: 1 });
    await remote.flush();
    assert.equal(engine.dispatch({ type: 'infiniteScroll.loadNext' } as never).status, 'applied');
    await remote.flush();
    assert.ok(inf.isRowLoaded(150));
    remote.setFail(true);
    engine.dispatch({ type: 'infiniteScroll.loadNext' } as never);
    await remote.flush();
    assert.equal(inf.getStatus().status, 'error');
    const view = engine.getSnapshot().rows.view as unknown as { statusAt(i: number): string };
    assert.equal(view.statusAt(250), 'error');
    remote.setFail(false);
    assert.equal(engine.dispatch({ type: 'infiniteScroll.retry' } as never).status, 'applied');
    await remote.flush();
    assert.equal(inf.getStatus().status, 'ready');
    assert.ok(inf.isRowLoaded(250));
  });

  it('a reload of the same query re-reads the visible blocks in place (no reset, no scroll to top)', async () => {
    const { engine, remote, inf, clock } = setup(items(5_000), { blockSize: 100 });
    await remote.flush();
    inf.ensureRange(2_000, 2_020);
    clock.advance(60);
    await remote.flush();
    const generation = inf.getStatus().generation;
    const before = remote.requests.length;
    engine.reload();
    assert.equal(engine.getRow('r2005')?.n, 2005, 'visible rows stay while they reload');
    await remote.flush();
    assert.equal(inf.getStatus().generation, generation);
    const last = remote.requests.at(-1) as DataSourceRequest;
    assert.equal(remote.requests.length, before + 1);
    assert.ok((last.range as { start: number }).start <= 2_000 && (last.range as { end: number }).end >= 2_020, 'the visible blocks');
    assert.equal(engine.getRow('r10'), undefined, 'blocks outside the window are dropped');
  });

  it('leaves local sources alone', () => {
    const engine = createDataGridEngine({ getRowId: (r: Item) => r.id, columns, dataSource: items(50), modules: [createInfiniteScrollModule<Item>()] });
    assert.equal(engine.getSnapshot().rows.count, 50);
    assert.equal(engine.getSnapshot().rows.view, undefined);
  });

  it('accepts synchronous sources', () => {
    const { engine } = setup(items(400), { blockSize: 100 }, { sync: true });
    assert.equal(engine.getRowIdAt(250), 'r250');
  });
});
