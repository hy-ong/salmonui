// Formatted versus raw copy: `column.clipboardFormatter(value, ctx)`
// (compiled to `(value, row)`) and `clipboard.copyFormatted`.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createFocusModule, createDataGridEngine, createSelectionModule, type ClipboardCopy, type ColumnDef, type ValueContext } from '@salmonui/data-grid/engine';
import { createClipboardModule } from '@salmonui/data-grid/engine/clipboard';
import { createEditModule } from '@salmonui/data-grid/engine/edit';
import { createLookupModule } from '@salmonui/data-grid/engine/lookup';

interface Item {
  readonly id: string;
  readonly amount: number;
  readonly at: Date;
  readonly code: string;
  readonly ratio: number;
  readonly cityId: number;
}

const rows: Item[] = [
  { id: 'a', amount: 1234.5, at: new Date(Date.UTC(2026, 10, 11, 9, 5)), code: 'x1', ratio: 0.25, cityId: 1 },
  { id: 'b', amount: -2, at: new Date(Date.UTC(2026, 0, 2)), code: 'y2', ratio: 0.5, cityId: 2 },
];
const cities = [{ id: 1, name: 'Tokyo' }, { id: 2, name: 'Oslo' }];

function make(copyFormatted?: boolean) {
  const contexts: ValueContext<Item>[] = [];
  const columns: ColumnDef<Item>[] = [
    { field: 'id', primaryKey: true },
    { field: 'amount', type: 'number', format: 'C2' },
    { field: 'at', type: 'date', format: 'yyyy-MM-dd' },
    {
      field: 'code',
      clipboardFormatter: (value, ctx) => {
        contexts.push(ctx);
        return `${String(value).toUpperCase()}@${ctx.row.id}:${ctx.locale}`;
      },
    },
    { field: 'ratio', type: 'number', valueFormatter: (value) => `${Number(value) * 100} pct` },
    { field: 'cityId', lookup: { data: cities, keyField: 'id', displayField: 'name' } },
  ];
  const modules = [createLookupModule<Item>(), createSelectionModule<Item>(), createFocusModule<Item>(), createEditModule<Item>(), createClipboardModule<Item>()] as const;
  const engine = createDataGridEngine<Item, typeof modules>({
    getRowId: (r) => r.id,
    columns,
    dataSource: rows,
    modules,
    locale: 'en-US',
    currency: 'USD',
    timeZone: 'UTC',
    edit: { mode: 'batch' },
    selection: { mode: 'both', type: 'multiple' },
    ...(copyFormatted === undefined ? {} : { clipboard: { copyFormatted } }),
  });
  const clip = (engine as unknown as { clipboard: { copy(o?: object): ClipboardCopy } }).clipboard;
  const copyRows = (): string[] => {
    engine.dispatch({ type: 'selection.selectRows', rowIds: ['a', 'b'] });
    return clip.copy().text.split('\n');
  };
  return { engine, clip, contexts, copyRows };
}

describe('clipboard formatting', () => {
  it('copies formatted text by default: format, valueFormatter, clipboardFormatter and lookup display text', () => {
    const { copyRows } = make();
    assert.deepEqual(copyRows(), ['a\t$1,234.50\t2026-11-11\tX1@a:en-US\t25 pct\tTokyo', 'b\t-$2.00\t2026-01-02\tY2@b:en-US\t50 pct\tOslo']);
  });

  it('clipboardFormatter receives the value and a { row, column, locale } context', () => {
    const { engine, clip, contexts } = make();
    engine.dispatch({ type: 'focus.set', target: { kind: 'cell', rowId: 'b', columnId: 'code' } });
    assert.equal(clip.copy().text, 'Y2@b:en-US');
    const ctx = contexts.at(-1)!;
    assert.equal(ctx.row, rows[1]);
    assert.equal(ctx.column.columnId, 'code');
    assert.equal(ctx.locale, 'en-US');
    assert.equal(engine.getSnapshot().columns.leaves.find((c) => c.columnId === 'code')?.clipboardFormatter('q', rows[0]!), 'Q@a:en-US', 'compiled to (value, row)');
    assert.equal(engine.getSnapshot().columns.leaves.find((c) => c.columnId === 'amount')?.clipboardFormatter(5, rows[0]!), '$5.00', 'defaults to the display formatter');
  });

  it('copyFormatted: false copies raw values; clipboardFormatter still wins', () => {
    const { copyRows } = make(false);
    assert.deepEqual(copyRows(), ['a\t1234.5\t2026-11-11T09:05:00.000Z\tX1@a:en-US\t0.25\tTokyo', 'b\t-2\t2026-01-02T00:00:00.000Z\tY2@b:en-US\t0.5\tOslo']);
  });

  it('a per-copy copyFormatted overrides the option', () => {
    const raw = make(false);
    raw.engine.dispatch({ type: 'focus.set', target: { kind: 'cell', rowId: 'a', columnId: 'amount' } });
    assert.equal(raw.clip.copy().text, '1234.5');
    assert.equal(raw.clip.copy({ copyFormatted: true }).text, '$1,234.50');
    const formatted = make();
    formatted.engine.dispatch({ type: 'focus.set', target: { kind: 'cell', rowId: 'a', columnId: 'amount' } });
    assert.equal(formatted.clip.copy({ copyFormatted: false }).text, '1234.5');
  });
});
