// A hand-built pivot result for the export tests: regions (even ones expanded
// into countries, with a subtotal row on top) by years × measures (Sales,
// Units) plus grand totals. Shaped like `PivotResult` of
// `@salmonui/pivot-table/engine`; the conformance with the real engine runs
// in pivot-engine-export.test.ts.
import type { PivotExportCell, PivotExportHeader, PivotExportResult, PivotWindowSource } from '@salmonui/export/pivot';

type Node = { -readonly [K in keyof PivotExportHeader]: PivotExportHeader[K] } & { children?: Node[] };

const node = (kind: Node['kind'], path: string[], label: string, depth: number, position: number, span: number, field: string | null, measure: string | null): Node => ({
  key: kind === 'grandTotal' ? (measure ? `|${measure}` : '') : `${JSON.stringify(path)}${measure ? `|${measure}` : ''}`,
  kind,
  path,
  field,
  measure,
  label,
  depth,
  position,
  span,
});

export interface Fixture extends PivotExportResult {
  readonly model: { readonly rows: { field: string; caption?: string }[]; readonly formats?: unknown; readonly conditionalFormats?: unknown };
}

export function pivotFixture(options: { regions?: number; countries?: number; years?: number; formats?: unknown; conditionalFormats?: unknown } = {}): Fixture {
  const regions = options.regions ?? 3;
  const countries = options.countries ?? 2;
  const years = options.years ?? 2;
  const rowTree: Node[] = [];
  const rowLeaves: Node[] = [];
  for (let i = 0; i < regions; i++) {
    const r = `R${i}`;
    const at = rowLeaves.length;
    if (i % 2 === 0) {
      const region = node('member', [r], r, 0, at, 1 + countries, 'Region', null);
      region.children = [];
      rowLeaves.push(node('subtotal', [r], `${r} Total`, 0, at, 1, 'Region', null));
      for (let k = 0; k < countries; k++) {
        const c = node('member', [r, `${r}C${k}`], `${r}C${k}`, 1, at + 1 + k, 1, 'Country', null);
        region.children.push(c);
        rowLeaves.push(c);
      }
      rowTree.push(region);
    } else {
      const region = node('member', [r], r, 0, at, 1, 'Region', null);
      rowTree.push(region);
      rowLeaves.push(region);
    }
  }
  const grand = node('grandTotal', [], 'Grand Total', 0, rowLeaves.length, 1, null, null);
  rowTree.push(grand);
  rowLeaves.push(grand);

  const columnTree: Node[] = [];
  const columnLeaves: Node[] = [];
  const measures = ['Sales', 'Units'];
  for (let y = 0; y <= years; y++) {
    const total = y === years;
    const label = total ? 'Grand Total' : String(2023 + y);
    const top = node(total ? 'grandTotal' : 'member', total ? [] : [label], label, 0, columnLeaves.length, measures.length, total ? null : 'Year', null);
    top.children = measures.map((m) => {
      const leaf = node(total ? 'grandTotal' : 'value', total ? [] : [label], m, 1, columnLeaves.length, 1, null, m);
      columnLeaves.push(leaf);
      return leaf;
    });
    columnTree.push(top);
  }

  const value = (r: number, c: number): number | null => (r === 1 && c === 0 ? null : (r + 1) * 10 + c + 0.25);
  const kindOf = (r: number, c: number): PivotExportCell['kind'] => {
    const kinds = [rowLeaves[r]?.kind, columnLeaves[c]?.kind];
    return kinds.includes('grandTotal') ? 'grandTotal' : kinds.includes('subtotal') ? 'subtotal' : 'value';
  };
  return {
    model: {
      rows: [{ field: 'Region', caption: 'Region' }, { field: 'Country' }],
      ...(options.formats !== undefined ? { formats: options.formats } : {}),
      ...(options.conditionalFormats !== undefined ? { conditionalFormats: options.conditionalFormats } : {}),
    },
    rowCount: rowLeaves.length,
    columnCount: columnLeaves.length,
    rowDepth: 2,
    columnDepth: 2,
    rowTree,
    columnTree,
    memberAt: (axis, i) => (axis === 'rows' ? rowLeaves[i] : columnLeaves[i]) as PivotExportHeader,
    cellAt(r, c) {
      const v = value(r, c);
      const measure = columnLeaves[c]?.measure ?? null;
      return { rowIndex: r, columnIndex: c, measure, value: v, formattedValue: v === null ? '' : v.toFixed(2), kind: kindOf(r, c) };
    },
  };
}

/**
 * A window source over a fixture, as the remote engine's `loadWindow`: each
 * window answers only its rows (placeholders elsewhere) and its row tree
 * holds only the nodes overlapping it.
 */
export function windowSource(result: PivotExportResult): PivotWindowSource & { readonly calls: [number, number][] } {
  const calls: [number, number][] = [];
  const prune = (list: readonly PivotExportHeader[], s: number, e: number): PivotExportHeader[] =>
    list.filter((n) => n.position < e && n.position + n.span > s).map((n) => ({ ...n, ...(n.children ? { children: prune(n.children, s, e) } : {}) }));
  return {
    calls,
    async loadWindow(w) {
      const s = w.rows[0];
      const e = Math.min(result.rowCount, w.rows[1]);
      calls.push([s, e]);
      const placeholder: PivotExportHeader = { key: '', kind: 'member', path: [], field: null, measure: null, label: '', depth: 0, position: 0, span: 1 };
      return {
        ...result,
        rowTree: prune(result.rowTree, s, e),
        memberAt: (axis, i) => (axis === 'columns' || (i >= s && i < e) ? result.memberAt(axis, i) : placeholder),
        cellAt: (r, c) => (r >= s && r < e ? result.cellAt(r, c) : { rowIndex: r, columnIndex: c, measure: null, value: null, formattedValue: '', kind: 'value' }),
      };
    },
  };
}
