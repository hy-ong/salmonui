// `spans` render feature:
// detection, the SSR markup of spanned cells through the static registry,
// the inert grid without the feature, and the late enable when spans
// appear after creation.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { spans } from '@salmonui/data-grid/features';
import type { DataGridColumn } from '@salmonui/data-grid';
import { requiredFeatures } from '../dist/data-grid/features/detect.js';
import { DataGridInstance } from '../dist/data-grid/instance.js';
import { count, newInstance, people, personColumns, render, type Person } from './fixtures.ts';

const spanColumns: DataGridColumn<Person>[] = personColumns.map((c, i) => (i === 1 ? { ...c, colSpan: ({ rowIndex }: { rowIndex: number }) => (rowIndex === 0 ? 2 : 1) } : c));

describe('spans detection', () => {
  it('requires spans for mergeCells true, columns or rows, and for a column colSpan or rowSpan', () => {
    assert.deepEqual(requiredFeatures({} as never), []);
    assert.deepEqual(requiredFeatures({ mergeCells: false } as never), []);
    assert.deepEqual(requiredFeatures({ mergeCells: true } as never), ['spans']);
    assert.deepEqual(requiredFeatures({ mergeCells: 'columns' } as never), ['spans']);
    assert.deepEqual(requiredFeatures({ mergeCells: 'rows' } as never), ['spans']);
    assert.deepEqual(requiredFeatures({ columns: [{ field: 'a', rowSpan: true }] } as never), ['spans']);
    assert.deepEqual(requiredFeatures({ columns: [{ field: 'a', colSpan: false }] } as never), []);
    // Nested and hidden columns count, so showing a hidden column never needs a chunk.
    assert.deepEqual(requiredFeatures({ columns: [{ header: 'G', columns: [{ field: 'a', visible: false, colSpan: () => 2 }] }] } as never), ['spans']);
  });
});

describe('spans render feature (static registry, SSR)', () => {
  it('renders spanned cells on the server, with no placeholder and no boundary', () => {
    const html = render({ rows: 10, columns: spanColumns });
    assert.equal(count(html, /aria-colspan="2"/), 1);
    assert.doesNotMatch(html, /aria-busy="true"/);
    assert.match(html, /role="grid"[^>]*data-salmon-pending=""/);
    assert.doesNotMatch(html, /<!--\$/);
  });

  it('renders merged row spans on the server', () => {
    const data = people(6).map((p, i) => ({ ...p, name: i < 3 ? 'same' : `n${i}` }));
    const html = render({ data, mergeCells: 'rows', virtualization: { rows: false } } as never);
    assert.match(html, /aria-rowspan="3"/);
  });

  it('the features prop removes the gate: the same markup without the pending mark', () => {
    const provided = render({ rows: 10, columns: spanColumns, features: [spans] });
    assert.doesNotMatch(provided, /data-salmon-pending/);
    assert.equal(provided, render({ rows: 10, columns: spanColumns }).replace(' data-salmon-pending=""', ''));
  });

  it('a provided feature whose trigger does not hold changes nothing', () => {
    assert.equal(render({ rows: 5, features: [spans] }), render({ rows: 5 }));
  });

  it('an instance without the feature plans no spans and resolves none', () => {
    const bare = new DataGridInstance<Person>({ data: people(5), columns: spanColumns } as never, ':spanf1:');
    assert.equal(bare.getSpanPlanner(), null);
    const view = { centerStart: 0, center: bare.engine.getSnapshot().columns.center } as never;
    assert.equal(bare.spanPlans(people(1)[0] as Person, 'p0', 0, view), null);
    const withFeature = newInstance<Person>({ data: people(5), columns: spanColumns }, ':spanf2:');
    assert.ok(withFeature.getSpanPlanner());
    assert.ok(withFeature.spanPlans(people(1)[0] as Person, 'p0', 0, { centerStart: 0, center: withFeature.engine.getSnapshot().columns.center } as never));
  });
});

describe('spans late enable', () => {
  it('installs the planner when spans appear after creation, bumps the column render version, and does not warn', () => {
    const warnings: string[] = [];
    const original = console.warn;
    console.warn = (message: unknown) => void warnings.push(String(message));
    try {
      const instance = newInstance<Person>({ 'aria-label': 'People', data: people(5), columns: personColumns }, ':spanlate:');
      assert.equal(instance.getSpanPlanner(), null);
      assert.equal(instance.getServerSpanPlanner(), null);
      let notified = 0;
      instance.subscribeColumnRender(() => notified++);
      const version = instance.getColumnRenderVersion();
      // Node resolves the static registry: the planner installs synchronously.
      instance.syncProps({ 'aria-label': 'People', data: people(5), columns: spanColumns } as never);
      assert.ok(instance.getSpanPlanner());
      assert.ok(instance.getColumnRenderVersion() > version);
      assert.ok(notified > 0);
      // Hydration and server reads keep the creation planner (none).
      assert.equal(instance.getServerSpanPlanner(), null);
      assert.ok(!warnings.some((w) => w.includes('"spans" feature was turned on after')), warnings.join('\n'));
    } finally {
      console.warn = original;
    }
  });
});
