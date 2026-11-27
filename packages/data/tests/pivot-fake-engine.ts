// A minimal pivot engine for protocol tests (one row field, one column
// field, sum of one value, grand totals): just enough `PivotEngineLike` to
// exercise the wire without the real engine. The conformance suite
// (pivot-conformance.test.ts) runs the real engine.
import type { PivotEngineFactoryLike, PivotHeaderLike, PivotResultLike } from '@salmonui/data/server';

type Obj = Record<string, unknown>;

interface Model {
  rows?: { field: string }[];
  columns?: { field: string }[];
  values?: { field: string; aggregate: string }[];
}

function header(axis: 'rows' | 'columns', kind: PivotHeaderLike['kind'], path: string[], label: string, position: number, field: string | null, measure: string | null): PivotHeaderLike & { axis: string } {
  const key = kind === 'grandTotal' ? (measure ? `|${measure}` : '') : `${JSON.stringify(path)}${measure ? `|${measure}` : ''}`;
  return { key, axis, kind, path, field, measure, label, depth: 0, position, span: 1, expandable: false, expanded: false };
}

export const fakePivotEngine: PivotEngineFactoryLike = ({ data }) => ({
  setModel(input: unknown): PivotResultLike {
    const m = input as Model;
    const rf = m.rows?.[0]?.field ?? '';
    const cf = m.columns?.[0]?.field ?? '';
    const vf = m.values?.[0]?.field ?? '';
    const rowKeys = [...new Set(data.map((r) => String(r[rf])))].sort();
    const colKeys = [...new Set(data.map((r) => String(r[cf])))].sort();
    const rowTree = [...rowKeys.map((k, i) => header('rows', 'member', [k], k, i, rf, null)), header('rows', 'grandTotal', [], 'Grand Total', rowKeys.length, null, null)];
    const columnTree = [...colKeys.map((k, i) => header('columns', 'member', [k], k, i, cf, vf)), header('columns', 'grandTotal', [], 'Grand Total', colKeys.length, null, vf)];
    const match = (row: Obj, r: number, c: number): boolean => (r >= rowKeys.length || String(row[rf]) === rowKeys[r]) && (c >= colKeys.length || String(row[cf]) === colKeys[c]);
    const valueAt = (r: number, c: number): number | null => {
      let sum = 0;
      let any = false;
      for (const row of data) if (match(row, r, c)) {
        sum += Number(row[vf]);
        any = true;
      }
      return any ? sum : null;
    };
    return {
      model: m,
      cellAt(r, c) {
        const value = valueAt(r, c);
        const kind = r >= rowKeys.length || c >= colKeys.length ? 'grandTotal' : 'value';
        return { rowIndex: r, columnIndex: c, rowKey: rowTree[r]?.key ?? '', columnKey: columnTree[c]?.key ?? '', measure: vf, value, rawValue: value, formattedValue: value === null ? '' : String(value), kind, rowCount: 0 };
      },
      rowCount: rowTree.length,
      columnCount: columnTree.length,
      rowDepth: 1,
      columnDepth: 1,
      rowTree,
      columnTree,
      memberAt: (axis, i) => (axis === 'rows' ? rowTree[i] : columnTree[i]) as PivotHeaderLike,
      valueAt,
      rowsAt(r, c) {
        const out: number[] = [];
        data.forEach((row, i) => match(row, r, c) && out.push(i));
        return out;
      },
    };
  },
});
