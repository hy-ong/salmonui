// Pivot engine: field index -> group transform ->
// member, label and value filters -> bucket (tuple ids per axis) ->
// mergeable aggregate states in typed arrays -> calculated fields -> show
// values as -> sort -> layout. DOM-free, zero dependencies, Worker-safe.
//
// Aggregation model: every row node of the row tree owns a "profile", the
// states of that node against every column node (all column depths at
// once). Visible frontier nodes (collapsed or innermost) build their profile
// from their own units; expanded nodes and totals merge their children's
// profiles, so subtotals, grand totals, column drill and collapse never scan
// raw rows, and drilling a row member scans only that member's units.
// Units are raw rows, or pre-aggregated records (one per distinct row x
// column leaf tuple) when that is guaranteed to compress at least 4x (data
// compression; average and distinct count stay exact).
import { compileFormula, type CompiledFormula } from './formula.js';
import {
  BLANK_LABEL,
  buildFieldIndex,
  buildLevel,
  encodeRow,
  getterOf,
  inferType,
  levelNames,
  memberRanks,
  numberFormat,
  numbersOf,
  type FieldIndex,
  type Getter,
  type LabelEnv,
  type Level,
} from './fields.js';
import { createPairMap, type PairMap } from './hash.js';
import { normalizePivotModel } from './model.js';
import type {
  Json,
  PivotAggregate,
  PivotAxisField,
  PivotCell,
  PivotCustomAggregator,
  PivotFieldDefinition,
  PivotFieldInfo,
  PivotFieldType,
  PivotFilter,
  PivotHeaderKind,
  PivotHeaderNode,
  PivotMember,
  PivotMemberPath,
  PivotModel,
  PivotModelInput,
  PivotResult,
  PivotValueField,
  PivotValueOperator,
} from './types.js';

/** Labels the engine writes into header nodes (`{label}` is replaced by the member label). */
export interface PivotEngineText {
  readonly grandTotal?: string;
  readonly total?: string;
  readonly blank?: string;
}

export interface PivotEngineOptions<Row> {
  readonly data: readonly Row[];
  /** Inferred from the first rows when omitted. */
  readonly fields?: readonly PivotFieldDefinition<Row>[];
  readonly model?: PivotModelInput;
  readonly locale?: string;
  readonly customAggregates?: Readonly<Record<string, PivotCustomAggregator>>;
  /** Pure override of a cell value. */
  readonly getCellValue?: (cell: PivotCell) => number | null;
  readonly text?: PivotEngineText;
}

export interface PivotEngine<Row> {
  subscribe(listener: () => void): () => void;
  /** Changes identity only when the result changes. */
  getSnapshot(): PivotResult;
  getModel(): PivotModel;
  getFields(): readonly PivotFieldInfo[];
  getMembers(field: string, options?: { readonly search?: string; readonly limit?: number }): readonly PivotMember[];
  setModel(input: PivotModelInput | ((model: PivotModel) => PivotModelInput)): PivotResult;
  /** Small changes (a few replaced rows, or appended rows) update the aggregates incrementally. */
  setData(rows: readonly Row[]): PivotResult;
  expand(path: PivotMemberPath): PivotResult;
  collapse(path: PivotMemberPath): PivotResult;
  expandAll(axis?: 'rows' | 'columns'): PivotResult;
  collapseAll(axis?: 'rows' | 'columns'): PivotResult;
  getRawRows(indexes: readonly number[]): readonly Row[];
  drillThrough(rowIndex: number, columnIndex: number): readonly Row[];
  refresh(): PivotResult;
  destroy(): void;
  /** Internal counters (compression, incremental updates); not a stable API. */
  getDiagnostics(): PivotDiagnostics;
}

/** A calculated field whose formula does not compile (its cells are empty). */
export interface PivotModelError {
  readonly name: string;
  readonly message: string;
  readonly position: number;
}

// Measure kinds and their state widths (after the shared row count slot).
const SUM = 0;
const PRODUCT = 1;
const COUNT = 2;
const MIN = 3;
const MAX = 4;
const AVG = 5;
const VAR = 6;
const CUSTOM = 7;
const LAZY = 8;
const WIDTH = [2, 2, 1, 2, 2, 2, 3, 1, 0];
const KIND: Readonly<Record<PivotAggregate, number>> = {
  sum: SUM,
  product: PRODUCT,
  count: COUNT,
  distinctCount: LAZY,
  min: MIN,
  max: MAX,
  average: AVG,
  median: LAZY,
  populationStdev: VAR,
  sampleStdev: VAR,
  populationVar: VAR,
  sampleVar: VAR,
  custom: CUSTOM,
};

interface Measure {
  readonly key: string;
  readonly agg: PivotAggregate;
  readonly field: string;
  readonly kind: number;
  readonly off: number;
  readonly num: Float64Array | null;
  readonly idx: FieldIndex;
  readonly blank: number;
  readonly custom: PivotCustomAggregator | null;
  readonly ci: number;
}

interface ValueSpec {
  readonly name: string;
  readonly field: PivotValueField;
  readonly caption: string;
  /** Base measure index, or -1 for a calculated field. */
  readonly mi: number;
  readonly calc: CompiledFormula | null;
  readonly refs: readonly number[];
}

interface Axis {
  readonly sig: string;
  readonly levels: Level[];
  readonly fields: PivotAxisField[];
  readonly D: number;
  leaf: Int32Array;
  readonly parent: number[];
  readonly member: number[];
  readonly depth: number[];
  readonly kids: (number[] | undefined)[];
  readonly map: PairMap;
  readonly top: number[];
}

interface Profile {
  readonly cols: Int32Array;
  readonly st: Float64Array;
  readonly cust: unknown[] | null;
}

/** Units of the row tree in depth-first contiguous ranges. */
interface View {
  readonly start: Int32Array;
  readonly units: Int32Array;
  readonly order: Int32Array;
  /** Rows per node (filtered). */
  readonly rows: Int32Array;
}

interface Layout {
  readonly pn: number[];
  readonly pm: number[];
  readonly pk: number[];
  readonly ph: number[];
  readonly dk: number[];
  readonly dn: number[];
  readonly dm: number[];
  readonly dd: number[];
  readonly dp: number[];
  readonly ds: number[];
  readonly dc: (number[] | null)[];
  readonly dpar: number[];
  readonly roots: number[];
  readonly depth: number;
  readonly values: boolean;
}

const EMPTY_PROFILE: Profile = { cols: new Int32Array(0), st: new Float64Array(0), cust: null };
const DESC_KIND: readonly PivotHeaderKind[] = ['member', 'subtotal', 'grandTotal', 'value'];
const CELL_KIND = ['value', 'subtotal', 'grandTotal', 'subtotal'] as const;
const PERCENT = new Set(['percentOfGrandTotal', 'percentOfColumnTotal', 'percentOfRowTotal', 'percentOfParentTotal', 'percentOfParentColumnTotal', 'percentOfParentRowTotal', 'percentOfRunningTotal', 'percentOfDifferenceFrom']);

const now: () => number = (() => {
  const p = (globalThis as { performance?: { now(): number } }).performance;
  return p ? () => p.now() : () => Date.now();
})();

export function drain<T>(gen: Generator<unknown, T>): T {
  for (;;) {
    const r = gen.next();
    if (r.done) return r.value;
  }
}

const json = (v: unknown) => JSON.stringify(v ?? null);

function compareValue(op: PivotValueOperator, v: number, a: number, b?: number): boolean {
  switch (op) {
    case 'equal':
      return v === a;
    case 'notEqual':
      return v !== a;
    case 'greaterThan':
      return v > a;
    case 'greaterThanOrEqual':
      return v >= a;
    case 'lessThan':
      return v < a;
    case 'lessThanOrEqual':
      return v <= a;
    case 'between':
      return v >= Math.min(a, b ?? a) && v <= Math.max(a, b ?? a);
    case 'notBetween':
      return v < Math.min(a, b ?? a) || v > Math.max(a, b ?? a);
    default:
      return true;
  }
}

/** Whether a pivot value operator matches (conditional formats reuse it). */
export const matchesValueOperator = compareValue;

// ---------------------------------------------------------------------------
// The core: caches and the compute pipeline.

export interface PivotCore<Row> {
  rows: readonly Row[];
  model: PivotModel;
  result: PivotResult | null;
  compute(): Generator<number, PivotResult>;
  fields(): readonly PivotFieldInfo[];
  members(field: string, options?: { readonly search?: string; readonly limit?: number }): readonly PivotMember[];
  setRows(rows: readonly Row[]): void;
  rowsAt(rowNode: number, colNode: number): number[];
  reset(): void;
  progress: number;
  expandedPaths(axis: 'rows' | 'columns', all: boolean): PivotMemberPath[];
  diagnostics(): PivotDiagnostics;
}

/** Internal counters for tests and benchmarks (not a stable API). */
export interface PivotDiagnostics {
  readonly rows: number;
  /** Aggregation units: raw rows, or pre-aggregated records when compressed. */
  readonly units: number;
  readonly compressed: boolean;
  /** Pipelines run from the filter stage on (data, axes, filters or measures changed). */
  readonly fullComputes: number;
  /** Data replacements applied as row deltas. */
  readonly incrementalUpdates: number;
}

export function createPivotCore<Row>(options: PivotEngineOptions<Row>): PivotCore<Row> {
  const locale = options.locale ?? 'en-US';
  const collator = new Intl.Collator(locale, { numeric: true });
  const custom = options.customAggregates ?? {};
  const text = options.text ?? {};
  const fmtCache = new Map<string, Intl.NumberFormat | Intl.DateTimeFormat>();
  let rows: readonly unknown[] = options.data;
  let defs = new Map<string, PivotFieldDefinition<unknown>>();
  let fieldOrder: string[] = [];
  const setDefs = () => {
    defs = new Map();
    const list = (options.fields ?? []) as readonly PivotFieldDefinition<unknown>[];
    for (const d of list) defs.set(d.field, d);
    fieldOrder = list.map((d) => d.field);
    if (!options.fields) {
      const seen = new Set<string>();
      for (let i = 0; i < rows.length && i < 50; i++) {
        const r = rows[i];
        if (r && typeof r === 'object') for (const k of Object.keys(r)) if (!seen.has(k)) seen.add(k), fieldOrder.push(k);
      }
    }
  };
  setDefs();

  const fieldIdx = new Map<string, FieldIndex>();
  const numCache = new Map<string, Float64Array>();
  const levelCache = new Map<string, Level>();
  const axisCache = new Map<string, Axis>();
  const typeOf = (f: string): PivotFieldType => defs.get(f)?.type ?? inferType(rows, getterOf(defs.get(f), f));

  function* fieldIndex(f: string): Generator<number, FieldIndex> {
    let idx = fieldIdx.get(f);
    if (!idx) fieldIdx.set(f, (idx = yield* buildFieldIndex(rows, f, typeOf(f), getterOf(defs.get(f), f))));
    return idx;
  }
  const numbers = (f: string) => {
    let n = numCache.get(f);
    if (!n) numCache.set(f, (n = numbersOf(rows, getterOf(defs.get(f), f))));
    return n;
  };

  let model = normalizePivotModel(options.model);
  let env: LabelEnv = { locale, formats: model.formats, cache: fmtCache };

  function* levelsOf(field: string): Generator<number, Level[]> {
    const g = model.groups[field];
    const names = levelNames(field, g);
    const idx = yield* fieldIndex(field);
    const out: Level[] = [];
    names.forEach((name, k) => {
      const part = g?.kind === 'date' ? g.parts[k] : undefined;
      const sig = `${name}\u0000${json(g)}\u0000${part ?? ''}\u0000${json(model.formats[field])}`;
      let level = levelCache.get(sig);
      if (!level || level.base !== idx) levelCache.set(sig, (level = buildLevel(env, name, idx, g, part)));
      out.push(level);
    });
    return out;
  }

  function* buildAxis(fields: readonly PivotAxisField[]): Generator<number, Axis> {
    const levels: Level[] = [];
    const owners: PivotAxisField[] = [];
    for (const f of fields) for (const l of yield* levelsOf(f.field)) levels.push(l), owners.push(f);
    const sig = levels.map((l) => l.signature).join('\u0001');
    const cached = axisCache.get(sig);
    if (cached && cached.leaf.length === rows.length && levels.every((l, i) => cached.levels[i] === l)) return cached;
    const n = rows.length;
    const ax: Axis = { sig, levels, fields: owners, D: levels.length, leaf: new Int32Array(n), parent: [-1], member: [-1], depth: [0], kids: [], map: createPairMap(), top: [] };
    const ids = levels.map((l) => l.ids);
    const D = levels.length;
    for (let i = 0; i < n; i++) {
      let node = 0;
      for (let l = 0; l < D; l++) node = childOf(ax, node, ids[l]![i]!, true);
      ax.leaf[i] = node;
      if ((i & 0x3ffff) === 0x3ffff) yield i;
    }
    if (axisCache.size > 6) axisCache.delete(axisCache.keys().next().value!);
    axisCache.set(sig, ax);
    return ax;
  }

  // --- derived state of the current model
  let rowAx: Axis;
  let colAx: Axis;
  let measures: Measure[] = [];
  let stride = 1;
  let customCount = 0;
  let values: ValueSpec[] = [];
  let errors: PivotModelError[] = [];
  let mask: Uint8Array | null = null;
  let excluded = new Set<string>();
  let units: { row: Int32Array; col: Int32Array; st: Float64Array | null; cust: unknown[] | null; count: number } | null = null;
  let view: View | null = null;
  let rawView: View | null = null;
  let colRows: Int32Array = new Int32Array(1);
  let profiles: (Profile | undefined)[] = [];
  let lazy = new Map<number, Map<number, number | null>>();
  let kidsCache = new Map<number, number[]>();
  let sigs = { mask: '', base: '', sort: '' };
  let lastFilterBy: PivotModel['filterBy'] = {};
  let rankCache = new Map<string, Int32Array>();
  const stats = { full: 0, incremental: 0 };
  let filterLevels: { level: Level; allowed: (m: number) => boolean }[] = [];

  const reset = () => {
    live = null;
    fieldIdx.clear();
    numCache.clear();
    levelCache.clear();
    axisCache.clear();
    rankCache.clear();
    sigs = { mask: '', base: '', sort: '' };
    view = rawView = null;
    profiles = [];
    lazy = new Map();
    kidsCache = new Map();
  };

  // --- measures

  const measureOf = (agg: PivotAggregate, field: string, customId?: string): number => {
    const key = `${agg}\u0000${field}\u0000${customId ?? ''}`;
    const found = measures.findIndex((m) => m.key === key);
    if (found !== -1) return found;
    const idx = drain(fieldIndex(field));
    const kind = agg === 'custom' && !(customId && custom[customId]) ? COUNT : KIND[agg];
    const m: Measure = {
      key,
      agg,
      field,
      kind,
      off: stride,
      num: kind === COUNT || kind === CUSTOM || (kind === LAZY && agg === 'distinctCount') ? null : numbers(field),
      idx,
      blank: idx.map.get(undefined) ?? -1,
      custom: kind === CUSTOM ? custom[customId!]! : null,
      ci: kind === CUSTOM ? customCount++ : -1,
    };
    stride += WIDTH[kind]!;
    measures.push(m);
    return measures.length - 1;
  };

  function setupMeasures() {
    measures = [];
    stride = 1;
    customCount = 0;
    errors = [];
    const fieldNames = fieldOrder;
    const calcs = new Map(model.calculatedFields.map((c) => [c.name, c]));
    values = model.values.map((v, k) => {
      const name = measureId(model.values, k);
      const c = calcs.get(v.field);
      if (c) {
        let calc: CompiledFormula | null = null;
        try {
          calc = compileFormula(c.formula, fieldNames);
        } catch (e) {
          const err = e as { message: string; position?: number };
          errors.push({ name: c.name, message: err.message, position: err.position ?? 0 });
        }
        const refs = calc ? calc.references.map((r) => measureOf(r.aggregate, r.field)) : [];
        return { name, field: v, caption: v.caption ?? c.caption ?? c.name, mi: -1, calc, refs };
      }
      return { name, field: v, caption: v.caption ?? defs.get(v.field)?.caption ?? v.field, mi: measureOf(v.aggregate, v.field, v.customId), calc: null, refs: [] };
    });
  }

  /** Value field index by measure id, or by source field when that is unambiguous. */
  const valueIndex = (id: string) => {
    const k = values.findIndex((v) => v.name === id);
    return k !== -1 ? k : values.findIndex((v) => v.field.field === id);
  };

  // --- state math

  const initState = (st: Float64Array, o: number, cust: unknown[] | null, co: number) => {
    st[o] = 0;
    for (const m of measures) {
      const a = o + m.off;
      const k = m.kind;
      if (k === LAZY) continue;
      st[a] = 0;
      if (k === CUSTOM) cust![co + m.ci] = m.custom!.init();
      else if (k !== COUNT) st[a + 1] = k === PRODUCT ? 1 : k === MIN ? Infinity : k === MAX ? -Infinity : 0;
      if (k === VAR) st[a + 2] = 0;
    }
  };

  const addRow = (st: Float64Array, o: number, i: number, cust: unknown[] | null, co: number) => {
    st[o]!++;
    for (const m of measures) {
      const a = o + m.off;
      const x = m.num ? m.num[i]! : 0;
      switch (m.kind) {
        case SUM:
        case AVG:
          if (x === x) st[a]!++, (st[a + 1]! += x);
          break;
        case PRODUCT:
          if (x === x) st[a]!++, (st[a + 1]! *= x);
          break;
        case COUNT:
          if (m.idx.ids[i] !== m.blank) st[a]!++;
          break;
        case MIN:
          if (x === x) {
            st[a]!++;
            if (x < st[a + 1]!) st[a + 1] = x;
          }
          break;
        case MAX:
          if (x === x) {
            st[a]!++;
            if (x > st[a + 1]!) st[a + 1] = x;
          }
          break;
        case VAR:
          if (x === x) {
            const n = ++st[a]!;
            const d = x - st[a + 1]!;
            st[a + 1]! += d / n;
            st[a + 2]! += d * (x - st[a + 1]!);
          }
          break;
        case CUSTOM:
          st[a]!++;
          cust![co + m.ci] = m.custom!.add(cust![co + m.ci], m.idx.get(rows[i]));
      }
    }
  };

  const mergeState = (st: Float64Array, o: number, src: Float64Array, so: number, cust: unknown[] | null, co: number, scust: unknown[] | null, sco: number) => {
    st[o]! += src[so]!;
    for (const m of measures) {
      const a = o + m.off;
      const b = so + m.off;
      switch (m.kind) {
        case SUM:
        case AVG:
          st[a]! += src[b]!;
          st[a + 1]! += src[b + 1]!;
          break;
        case PRODUCT:
          st[a]! += src[b]!;
          st[a + 1]! *= src[b + 1]!;
          break;
        case COUNT:
          st[a]! += src[b]!;
          break;
        case MIN:
          st[a]! += src[b]!;
          if (src[b + 1]! < st[a + 1]!) st[a + 1] = src[b + 1]!;
          break;
        case MAX:
          st[a]! += src[b]!;
          if (src[b + 1]! > st[a + 1]!) st[a + 1] = src[b + 1]!;
          break;
        case VAR: {
          const nb = src[b]!;
          if (!nb) break;
          const na = st[a]!;
          if (!na) {
            st[a] = nb;
            st[a + 1] = src[b + 1]!;
            st[a + 2] = src[b + 2]!;
            break;
          }
          const n = na + nb;
          const d = src[b + 1]! - st[a + 1]!;
          st[a] = n;
          st[a + 1]! += (d * nb) / n;
          st[a + 2]! += src[b + 2]! + (d * d * na * nb) / n;
          break;
        }
        case CUSTOM:
          st[a]! += src[b]!;
          cust![co + m.ci] = m.custom!.merge(cust![co + m.ci], scust![sco + m.ci]);
      }
    }
  };

  const stateValue = (st: Float64Array, o: number, m: Measure, cust: unknown[] | null, co: number): number | null => {
    if (!st[o]) return null;
    const a = o + m.off;
    const n = st[a]!;
    switch (m.kind) {
      case COUNT:
        return n;
      case CUSTOM:
        return m.custom!.result(cust![co + m.ci]);
      case AVG:
        return n ? st[a + 1]! / n : null;
      case VAR: {
        const sample = m.agg === 'sampleVar' || m.agg === 'sampleStdev';
        if (n < (sample ? 2 : 1)) return null;
        const v = Math.max(0, st[a + 2]!) / (sample ? n - 1 : n);
        return m.agg.endsWith('Stdev') ? Math.sqrt(v) : v;
      }
      default:
        return n ? st[a + 1]! : null;
    }
  };

  // --- filters (member and label: row mask; value filters: after aggregating the filtered level)

  function labelMatch(level: Level, m: number, spec: Extract<PivotFilter, { label: unknown }>['label']): boolean {
    const key = level.keys[m]!;
    const label = level.labels[m]!;
    const op = spec.operator;
    const cs = spec.caseSensitive === true;
    const norm = (s: string) => (cs ? s : s.toLowerCase());
    if (op === 'contains' || op === 'doesNotContain' || op === 'startsWith' || op === 'doesNotStartWith' || op === 'endsWith' || op === 'doesNotEndWith') {
      const l = norm(label);
      const v = norm(String(spec.value ?? ''));
      const hit = op.includes('ontain') ? l.includes(v) : op.includes('tart') ? l.startsWith(v) : l.endsWith(v);
      return op.startsWith('doesNot') ? !hit : hit;
    }
    const cmp = (x: Json): number => {
      if (typeof key === 'number' && typeof x === 'number') return key - x;
      if (level.base.type === 'date' && typeof key === 'string' && typeof x === 'string' && level.remap === null) return Date.parse(key) - Date.parse(x);
      return collator.compare(cs ? label : label.toLowerCase(), cs ? String(x) : String(x).toLowerCase());
    };
    const c = cmp(spec.value);
    switch (op) {
      case 'equal':
        return c === 0;
      case 'notEqual':
        return c !== 0;
      case 'greaterThan':
        return c > 0;
      case 'greaterThanOrEqual':
        return c >= 0;
      case 'lessThan':
        return c < 0;
      case 'lessThanOrEqual':
        return c <= 0;
      default: {
        const c2 = cmp(spec.value2 ?? spec.value);
        const inside = (c >= 0 && c2 <= 0) || (c <= 0 && c2 >= 0);
        return op === 'between' ? inside : !inside;
      }
    }
  }

  function memberTest(level: Level, f: PivotFilter): ((m: number) => boolean) | null {
    if ('include' in f || 'exclude' in f) {
      const list = 'include' in f ? f.include : f.exclude;
      const set = new Set(list.map(json));
      const inc = 'include' in f;
      return (m) => set.has(json(level.keys[m])) === inc;
    }
    if ('label' in f) return (m) => labelMatch(level, m, f.label);
    return null;
  }

  /** Levels of the fields placed on any axis; filters on fields that are not placed are ignored. */
  function* filterLevel(name: string): Generator<number, Level | null> {
    for (const l of [...rowAx.levels, ...colAx.levels]) if (l.name === name) return l;
    const f = model.filters.find((x) => x.field === name) ?? [...model.rows, ...model.columns].find((x) => levelNames(x.field, model.groups[x.field])[0] === name);
    if (!f) return null;
    return (yield* levelsOf(f.field))[0] ?? null;
  }

  function* buildMask(): Generator<number, void> {
    filterLevels = [];
    const valueFilters: { level: Level; axis: Axis; l: number; spec: Extract<PivotFilter, { value: unknown }>['value'] }[] = [];
    for (const [name, f] of Object.entries(model.filterBy)) {
      const level = yield* filterLevel(name);
      if (!level) continue;
      if ('value' in f) {
        const ri = rowAx.levels.indexOf(level);
        const ci = colAx.levels.indexOf(level);
        if (ri !== -1) valueFilters.push({ level, axis: rowAx, l: ri, spec: f.value });
        else if (ci !== -1) valueFilters.push({ level, axis: colAx, l: ci, spec: f.value });
        continue;
      }
      const test = memberTest(level, f);
      if (!test) continue;
      const cache: number[] = [];
      filterLevels.push({ level, allowed: (m) => (cache[m] ??= test(m) ? 1 : 0) === 1 });
    }
    excluded = new Set();
    const n = rows.length;
    if (!filterLevels.length && !valueFilters.length) {
      mask = null;
      return;
    }
    const mk = new Uint8Array(n).fill(1);
    for (const { level, allowed } of filterLevels) {
      const ids = level.ids;
      const ok = new Uint8Array(level.keys.length);
      for (let m = 0; m < ok.length; m++) ok[m] = allowed(m) ? 1 : 0;
      for (let i = 0; i < n; i++) if (!ok[ids[i]!]) mk[i] = 0;
      yield 0;
    }
    mask = mk;
    // Value filters, outer levels first: a member's total against the other axis grand total.
    valueFilters.sort((a, b) => (a.axis === b.axis ? a.l - b.l : a.axis === rowAx ? -1 : 1));
    for (const vf of valueFilters) {
      const k = valueIndex(vf.spec.measure);
      if (k === -1) continue;
      const depth = vf.l + 1;
      const ax = vf.axis;
      const up = ax.D - depth;
      const slot = new Int32Array(ax.parent.length).fill(-1);
      const nodes: number[] = [];
      const list: number[] = [];
      for (let i = 0; i < n; i++) {
        if (!mk[i]) continue;
        let node = ax.leaf[i]!;
        for (let s = 0; s < up; s++) node = ax.parent[node]!;
        if (slot[node] === -1) (slot[node] = nodes.length), nodes.push(node);
        list.push(i);
      }
      const t = aggregateRows(list, (i, out) => ((out[0] = slot[ancestor(ax, ax.leaf[i]!, depth)]!), 1), nodes.length);
      const vals = nodes.map((_, s) => valueOfSpec(k, (mi) => tableValue(t, s, mi)));
      const keep = new Set<number>();
      const { operator: op, value: a, value2: b } = vf.spec;
      if (op === 'top' || op === 'bottom') {
        const byParent = new Map<number, number[]>();
        nodes.forEach((node, s) => {
          const p = ax.parent[node]!;
          let list = byParent.get(p);
          if (!list) byParent.set(p, (list = []));
          list.push(s);
        });
        for (const list of byParent.values()) {
          list.sort((x, y) => (vals[y] ?? -Infinity) - (vals[x] ?? -Infinity));
          if (op === 'bottom') list.reverse();
          for (const s of list.slice(0, Math.max(0, Math.floor(a)))) keep.add(nodes[s]!);
        }
      } else nodes.forEach((node, s) => vals[s] !== null && compareValue(op, vals[s]!, a, b) && keep.add(node));
      for (const node of nodes) if (!keep.has(node)) excluded.add(`${ax === rowAx ? 'r' : 'c'}${node}`);
      for (let i = 0; i < n; i++) if (mk[i] && !keep.has(ancestor(ax, ax.leaf[i]!, depth))) mk[i] = 0;
      yield 0;
    }
  }

  const ancestor = (ax: Axis, node: number, depth: number) => {
    while (ax.depth[node]! > depth) node = ax.parent[node]!;
    return node;
  };

  /** Generic (slow path) aggregation of rows into slots: value filters, distinct count and median. */
  interface Table {
    readonly st: Float64Array;
    readonly cust: unknown[] | null;
    readonly lazy: Map<number, (Set<number> | number[])[]>;
  }
  function aggregateRows(list: ArrayLike<number>, slotsOf: (i: number, out: Int32Array) => number, nSlots: number, onlyLazy = false): Table {
    const st = new Float64Array(onlyLazy ? 0 : nSlots * stride);
    const cust = customCount && !onlyLazy ? new Array<unknown>(nSlots * customCount) : null;
    if (!onlyLazy) for (let s = 0; s < nSlots; s++) initState(st, s * stride, cust, s * customCount);
    const lz = new Map<number, (Set<number> | number[])[]>();
    measures.forEach((m, mi) => m.kind === LAZY && lz.set(mi, []));
    const out = new Int32Array(64);
    for (let x = 0; x < list.length; x++) {
      const i = list[x]!;
      const k = slotsOf(i, out);
      for (let j = 0; j < k; j++) {
        const s = out[j]!;
        if (!onlyLazy) addRow(st, s * stride, i, cust, s * customCount);
        for (const [mi, arr] of lz) {
          const m = measures[mi]!;
          if (m.agg === 'distinctCount') {
            const id = m.idx.ids[i]!;
            if (id !== m.blank) ((arr[s] ??= new Set<number>()) as Set<number>).add(id);
          } else {
            const v = m.num![i]!;
            if (v === v) ((arr[s] ??= []) as number[]).push(v);
          }
        }
      }
    }
    return { st, cust, lazy: lz };
  }
  const lazyResult = (m: Measure, bucket: Set<number> | number[] | undefined): number | null => {
    if (!bucket) return m.agg === 'distinctCount' ? 0 : null;
    if (bucket instanceof Set) return bucket.size;
    if (!bucket.length) return null;
    const s = Float64Array.from(bucket).sort();
    const h = s.length >> 1;
    return s.length & 1 ? s[h]! : (s[h - 1]! + s[h]!) / 2;
  };
  const tableValue = (t: Table, s: number, mi: number): number | null => {
    const m = measures[mi]!;
    if (m.kind === LAZY) return lazyResult(m, t.lazy.get(mi)![s]);
    return stateValue(t.st, s * stride, m, t.cust, s * customCount);
  };

  // --- bucket: units in depth-first ranges of the row tree

  function* buildViews(): Generator<number, void> {
    const n = rows.length;
    const pass = mask;
    const rowLeaf = rowAx.leaf;
    const colLeaf = colAx.leaf;
    // Data compression: pre-aggregate rows sharing every axis member when that is
    // guaranteed to shrink the units 4x (distinct leaf tuples <= rows / 4).
    let rl = 0;
    let cl = 0;
    for (const d of rowAx.depth) if (d === rowAx.D) rl++;
    for (const d of colAx.depth) if (d === colAx.D) cl++;
    const lazyOnly = measures.length > 0 && measures.every((m) => m.kind === LAZY);
    units = null;
    if (!lazyOnly && rl * cl * 4 <= n && n >= 1024) {
      const cap = Math.max(16, Math.min(n, rl * cl));
      const map = createPairMap(cap);
      let row = new Int32Array(cap);
      let col = new Int32Array(cap);
      let st = new Float64Array(cap * stride);
      const cust = customCount ? new Array<unknown>(cap * customCount) : null;
      let count = 0;
      for (let i = 0; i < n; i++) {
        if (pass && !pass[i]) continue;
        let u = map.get(rowLeaf[i]!, colLeaf[i]!);
        if (u === -1) {
          u = map.put(rowLeaf[i]!, colLeaf[i]!, count++);
          if (u >= row.length) {
            const r2 = new Int32Array(row.length * 2);
            r2.set(row);
            row = r2;
            const c2 = new Int32Array(col.length * 2);
            c2.set(col);
            col = c2;
            const s2 = new Float64Array(st.length * 2);
            s2.set(st);
            st = s2;
          }
          row[u] = rowLeaf[i]!;
          col[u] = colLeaf[i]!;
          initState(st, u * stride, cust, u * customCount);
        }
        addRow(st, u * stride, i, cust, u * customCount);
        if ((i & 0x3ffff) === 0x3ffff) yield i;
      }
      units = { row, col, st, cust, count };
    }
    view = units ? orderUnits(units.row, units.count, (u) => units!.st![u * stride]!) : null;
    rawView = null;
    if (!view) view = rawView = yield* rawUnits();
    // Rows per column node.
    colRows = new Int32Array(colAx.parent.length);
    for (let i = 0; i < n; i++) if (!pass || pass[i]) colRows[colLeaf[i]!]!++;
    for (let k = colAx.parent.length - 1; k > 0; k--) colRows[colAx.parent[k]!]! += colRows[k]!;
  }

  function* rawUnits(): Generator<number, View> {
    const n = rows.length;
    const leaf = rowAx.leaf;
    if (!mask) return orderUnits(leaf, n, null);
    let count = 0;
    for (let i = 0; i < n; i++) count += mask[i]!;
    const list = new Int32Array(count);
    const leafOf = new Int32Array(count);
    let k = 0;
    for (let i = 0; i < n; i++) if (mask[i]) (list[k] = i), (leafOf[k++] = leaf[i]!);
    yield 0;
    return orderUnits(leafOf, count, null, list);
  }

  /** Counting sort of units by row leaf so that every row node is one contiguous range. */
  function orderUnits(leafOf: Int32Array, count: number, weight: ((u: number) => number) | null, ids?: Int32Array): View {
    const size = rowAx.parent.length;
    const unitsPer = new Int32Array(size);
    let rowsPer = unitsPer;
    for (let u = 0; u < count; u++) unitsPer[leafOf[u]!]!++;
    if (weight) {
      rowsPer = new Int32Array(size);
      for (let u = 0; u < count; u++) rowsPer[leafOf[u]!]! += weight(u);
    }
    const par = rowAx.parent;
    for (let k = size - 1; k > 0; k--) {
      unitsPer[par[k]!]! += unitsPer[k]!;
      if (weight) rowsPer[par[k]!]! += rowsPer[k]!;
    }
    const start = new Int32Array(size);
    const cursor = new Int32Array(size);
    for (let k = 1; k < size; k++) {
      const p = par[k]!;
      start[k] = cursor[p]!;
      cursor[p]! += unitsPer[k]!;
      cursor[k] = start[k]!;
    }
    // Only leaves receive units (every unit's node is a leaf of the axis).
    const order = new Int32Array(count);
    for (let u = 0; u < count; u++) order[cursor[leafOf[u]!]!++] = ids ? ids[u]! : u;
    return { start, units: unitsPer, order, rows: rowsPer };
  }

  const getRawView = () => (rawView ??= drain(rawUnits()));

  // --- profiles

  let scratch = new Float64Array(0);
  let scust: unknown[] | null = null;
  let stamp = new Int32Array(0);
  let touched = new Int32Array(0);
  let gen = 0;
  const prepScratch = () => {
    const size = colAx.parent.length;
    if (stamp.length < size || scratch.length < size * stride) {
      stamp = new Int32Array(size);
      touched = new Int32Array(size);
      scratch = new Float64Array(size * stride);
      gen = 0;
    }
    scust = customCount ? new Array<unknown>(size * customCount) : null;
    gen++;
  };
  const compact = (k: number): Profile => {
    const cols = touched.slice(0, k).sort();
    const w = stride;
    const st = new Float64Array(k * w);
    const cust = customCount ? new Array<unknown>(k * customCount) : null;
    for (let j = 0; j < k; j++) {
      const c = cols[j]!;
      for (let x = 0, o = c * w, d = j * w; x < w; x++) st[d + x] = scratch[o + x]!;
      if (cust) for (let x = 0; x < customCount; x++) cust[j * customCount + x] = scust![c * customCount + x];
    }
    return { cols, st, cust };
  };

  /** Accumulates units `order[s..e)` at their column leaves (plain function: generators deopt hot loops). */
  const accumulate = (order: Int32Array, s: number, e: number, g: number, k: number): number => {
    const u0 = units;
    const colLeaf = colAx.leaf;
    const w = stride;
    const cc = customCount;
    for (let x = s; x < e; x++) {
      const u = order[x]!;
      const c = u0 ? u0.col[u]! : colLeaf[u]!;
      const o = c * w;
      if (stamp[c] !== g) {
        stamp[c] = g;
        touched[k++] = c;
        initState(scratch, o, scust, c * cc);
      }
      if (u0) mergeState(scratch, o, u0.st!, u * w, scust, c * cc, u0.cust, u * cc);
      else addRow(scratch, o, u, scust, c * cc);
    }
    return k;
  };

  function* fromUnits(r: number): Generator<number, Profile> {
    const v = view!;
    const s = v.start[r]!;
    const e = s + v.units[r]!;
    if (s === e) return EMPTY_PROFILE;
    prepScratch();
    const g = gen;
    const cpar = colAx.parent;
    let k = 0;
    // Accumulate at the column leaves, then roll the leaves up level by level
    // (touched holds every leaf before any parent, so parents merge final children).
    for (let x = s; x < e; x += 0x20000) {
      k = accumulate(v.order, x, Math.min(e, x + 0x20000), g, k);
      if (e - s > 0x20000) yield x;
    }
    for (let j = 0; j < k; j++) {
      const c = touched[j]!;
      const p = cpar[c]!;
      if (p === -1) continue;
      const o = p * stride;
      if (stamp[p] !== g) {
        stamp[p] = g;
        touched[k++] = p;
        initState(scratch, o, scust, p * customCount);
      }
      mergeState(scratch, o, scratch, c * stride, scust, p * customCount, scust, c * customCount);
    }
    return compact(k);
  }

  const fromKids = (list: readonly number[]): Profile => {
    const ps = list.map(ensure);
    prepScratch();
    const g = gen;
    let k = 0;
    for (const p of ps) {
      const cols = p.cols;
      for (let j = 0; j < cols.length; j++) {
        const c = cols[j]!;
        const o = c * stride;
        if (stamp[c] !== g) {
          stamp[c] = g;
          touched[k++] = c;
          initState(scratch, o, scust, c * customCount);
        }
        mergeState(scratch, o, p.st, j * stride, scust, c * customCount, p.cust, j * customCount);
      }
    }
    return compact(k);
  };

  let rowExpanded: Set<number> = new Set();
  let colExpanded: Set<number> = new Set();
  let allRows = false;
  let allCols = false;
  const isOpen = (ax: Axis, node: number) => node === 0 || (ax.depth[node]! < ax.D && (ax === rowAx ? allRows || rowExpanded.has(node) : allCols || colExpanded.has(node)));

  const ensure = (r: number): Profile => {
    let p = profiles[r];
    if (p) return p;
    if ((view!.rows[r] ?? 0) === 0) p = EMPTY_PROFILE;
    // From the node's own units in view order, so values never depend on the
    // history of drills (equal model + data = equal floats). The root, whose
    // children are always visible, merges them in id order instead.
    else p = r === 0 && rowAx.kids[0]?.length ? fromKids(rowAx.kids[0]) : drain(fromUnits(r));
    profiles[r] = p;
    return p;
  };

  const lookup = (p: Profile, c: number) => {
    const cols = p.cols;
    let lo = 0;
    let hi = cols.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const v = cols[mid]!;
      if (v === c) return mid;
      if (v < c) lo = mid + 1;
      else hi = mid - 1;
    }
    return -1;
  };

  const lazyValue = (r: number, c: number, mi: number): number | null => {
    const key = r * measures.length + mi;
    let map = lazy.get(key);
    if (!map) {
      const rv = getRawView();
      const s = rv.start[r] ?? 0;
      const list = rv.order.subarray(s, s + (rv.units[r] ?? 0));
      const cpar = colAx.parent;
      const slots = new Int32Array(colAx.parent.length).fill(-1);
      const cols: number[] = [];
      const t = aggregateRows(
        list,
        (i, out) => {
          let k = 0;
          for (let x = colAx.leaf[i]!; x !== -1; x = cpar[x]!) {
            if (slots[x] === -1) (slots[x] = cols.length), cols.push(x);
            out[k++] = slots[x]!;
          }
          return k;
        },
        0,
        true,
      );
      map = new Map();
      const m = measures[mi]!;
      const buckets = t.lazy.get(mi)!;
      cols.forEach((col, s2) => map!.set(col, lazyResult(m, buckets[s2])));
      lazy.set(key, map);
    }
    const v = map.get(c);
    return v === undefined ? null : v;
  };

  const baseValue = (r: number, c: number, mi: number): number | null => {
    const p = ensure(r);
    const j = lookup(p, c);
    if (j === -1) return null;
    const m = measures[mi]!;
    if (m.kind === LAZY) return lazyValue(r, c, mi);
    return stateValue(p.st, j * stride, m, p.cust, j * customCount);
  };

  const valueOfSpec = (k: number, get: (mi: number) => number | null): number | null => {
    const v = values[k]!;
    if (v.mi !== -1) return get(v.mi);
    if (!v.calc) return null;
    return v.calc.evaluate((agg, field) => get(measures.findIndex((m) => m.agg === agg && m.field === field)));
  };

  const rawCell = (r: number, c: number, k: number) => valueOfSpec(k, (mi) => baseValue(r, c, mi));

  // --- sort

  const ranksOf = (level: Level): Int32Array => {
    const spec = model.sort[level.name] ?? model.sort[level.base.field];
    const key = `${level.signature}\u0000${json(spec)}`;
    let r = rankCache.get(key);
    if (!r || r.length !== level.keys.length) rankCache.set(key, (r = memberRanks(level, spec ?? 'asc', collator)));
    return r;
  };

  let valueSortCol = -1;
  let valueSortMeasure = -1;

  function visibleKids(ax: Axis, node: number): number[] {
    const tag = ax === rowAx ? node * 2 : node * 2 + 1;
    let list = kidsCache.get(tag);
    if (list) return list;
    const depth = ax.depth[node]!;
    const level = ax.levels[depth]!;
    const counts = ax === rowAx ? view!.rows : colRows;
    const prefix = ax === rowAx ? 'r' : 'c';
    if (model.showEmptyMembers) {
      const allowed = filterLevels.find((f) => f.level === level)?.allowed;
      list = [];
      for (let m = 0; m < level.keys.length; m++) {
        if (allowed && !allowed(m)) continue;
        const kid = childOf(ax, node, m, true);
        if (!excluded.has(prefix + kid)) list.push(kid);
      }
    } else list = (ax.kids[node] ?? []).filter((k) => (counts[k] ?? 0) > 0);
    const ranks = ranksOf(level);
    const vs = model.valueSort;
    if (ax === rowAx && vs && valueSortMeasure !== -1 && valueSortCol !== -1 && (vs.multipleAxis || depth === ax.D - 1)) {
      const val = new Map(list.map((k) => [k, rawCell(k, valueSortCol, valueSortMeasure)]));
      const dir = vs.direction === 'desc' ? -1 : 1;
      list.sort((a, b) => {
        const x = val.get(a) ?? null;
        const y = val.get(b) ?? null;
        if (x === y) return ranks[ax.member[a]!]! - ranks[ax.member[b]!]!;
        if (x === null) return 1;
        if (y === null) return -1;
        return (x - y) * dir;
      });
    } else list.sort((a, b) => ranks[ax.member[a]!]! - ranks[ax.member[b]!]!);
    kidsCache.set(tag, list);
    return list;
  }

  // --- paths

  const pathOf = (ax: Axis, node: number): Json[] => {
    const out: Json[] = [];
    for (let x = node; x > 0; x = ax.parent[x]!) out.push(ax.levels[ax.depth[x]! - 1]!.keys[ax.member[x]!]!);
    return out.reverse();
  };
  const nodeOf = (ax: Axis, path: readonly Json[]): number => {
    let node = 0;
    for (let l = 0; l < path.length; l++) {
      const level = ax.levels[l];
      const m = level?.byKey.get(path[l]!);
      if (m === undefined) return -1;
      node = childOf(ax, node, m, false);
      if (node === -1) return -1;
    }
    return node;
  };

  const resolveExpanded = () => {
    rowExpanded = new Set();
    colExpanded = new Set();
    allRows = allCols = model.expanded === 'all';
    if (model.expanded === 'all') return;
    for (const p of model.expanded) {
      const [axis, ...path] = p;
      const ax = axis === 'rows' ? rowAx : colAx;
      const node = nodeOf(ax, path);
      if (node > 0) (axis === 'rows' ? rowExpanded : colExpanded).add(node);
    }
  };

  // --- layout

  const subOn = (ax: Axis, l: number): boolean => {
    const f = ax.fields[l]!;
    if (f.showSubTotals !== undefined) return f.showSubTotals;
    const s = model.totals.sub;
    return typeof s === 'boolean' ? s : (s[ax.levels[l]!.name] ?? s[f.field] ?? true);
  };

  function layoutAxis(ax: Axis, isRows: boolean): Layout {
    const M = values.length;
    const here = M > 0 && model.valuesPlacement.axis === (isRows ? 'rows' : 'columns');
    const showV = here && (M > 1 || model.showValueHeader === true);
    const D = ax.D;
    const idx = model.valuesPlacement.index;
    const vl = showV ? Math.max(0, Math.min(D, idx < 0 ? D : idx)) : -1;
    const len = D + (showV ? 1 : 0);
    const fixed = here && !showV ? 0 : -1;
    const t = model.totals;
    const grandOn = t.grand === 'both' || t.grand === (isRows ? 'rows' : 'columns');
    const grandStart = t.grandPosition === 'start';
    const subStart = t.subPosition === 'auto' ? isRows : t.subPosition === 'start';
    const L: Layout = { pn: [], pm: [], pk: [], ph: [], dk: [], dn: [], dm: [], dd: [], dp: [], ds: [], dc: [], dpar: [], roots: [], depth: Math.max(1, len), values: here };
    const open = (kind: number, node: number, m: number, depth: number, parent: number, ctx: number) => {
      const d = L.dk.length;
      L.dk.push(kind);
      L.dn.push(node);
      L.dm.push(m);
      L.dd.push(depth);
      L.dp.push(L.pn.length);
      L.ds.push(0);
      L.dc.push(null);
      L.dpar.push(parent);
      if (parent === -1) L.roots.push(d);
      else (L.dc[parent] ??= []).push(d);
      if (isRows) pos(node, m, ctx, d);
      return d;
    };
    const pos = (node: number, m: number, kind: number, d: number) => {
      L.pn.push(node);
      L.pm.push(m);
      L.pk.push(kind);
      L.ph.push(d);
    };
    const close = (d: number, ctx: number, carried: boolean) => {
      if (!L.dc[d]) {
        if (!isRows) pos(L.dn[d]!, L.dm[d]!, ctx, d);
      } else if (isRows) L.pk[L.dp[d]!] = carried ? 1 : 3;
      L.ds[d] = L.pn.length - L.dp[d]!;
    };
    const valuesBelow = (li: number) => vl >= li;
    const gen = (parent: number, node: number, li: number, m: number, ctx: number): void => {
      if (li >= len) return;
      if (li === vl) {
        for (let k = 0; k < M; k++) {
          const d = open(3, node, k, li, parent, ctx);
          gen(d, node, li + 1, k, ctx);
          close(d, ctx, false);
        }
        return;
      }
      if (ctx !== 0 || !isOpen(ax, node)) return gen(parent, node, li + 1, m, ctx);
      const isRoot = node === 0;
      const level = ax.depth[node]!;
      const showTotal = isRoot ? grandOn : subOn(ax, level - 1);
      const atStart = isRoot ? grandStart : subStart;
      const carried = isRows && !isRoot && showTotal && atStart && vl !== li - 1 && !valuesBelow(li + 1);
      const total = () => {
        const d = open(isRoot ? 2 : 1, node, m, li, parent, isRoot ? 2 : 1);
        gen(d, node, li + 1, m, isRoot ? 2 : 1);
        close(d, isRoot ? 2 : 1, false);
      };
      if (showTotal && atStart && !carried) total();
      for (const kid of visibleKids(ax, node)) {
        const d = open(0, kid, m, li, parent, 0);
        gen(d, kid, li + 1, m, 0);
        const kidCarried = isRows && isOpen(ax, kid) && subOn(ax, level) && subStart && !valuesBelow(li + 2);
        close(d, 0, kidCarried);
      }
      if (showTotal && !atStart) total();
    };
    if (D === 0 && !showV) {
      const d = open(2, 0, fixed, 0, -1, 2);
      close(d, 2, false);
    } else gen(-1, 0, 0, fixed, D === 0 ? 2 : 0);
    return L;
  }

  // --- show values as

  function showAs(k: number, r: number, c: number, v: number | null): number | null {
    const spec = values[k]!.field.showAs;
    if (!spec || v === null) return v;
    const val = (rr: number, cc: number) => rawCell(rr, cc, k);
    const div = (a: number | null, b: number | null) => (a === null || b === null || b === 0 ? null : a / b);
    switch (spec.kind) {
      case 'percentOfGrandTotal':
        return div(v, val(0, 0));
      case 'percentOfColumnTotal':
        return div(v, val(0, c));
      case 'percentOfRowTotal':
        return div(v, val(r, 0));
      case 'percentOfParentRowTotal':
        return div(v, val(r === 0 ? 0 : rowAx.parent[r]!, c));
      case 'percentOfParentColumnTotal':
        return div(v, val(r, c === 0 ? 0 : colAx.parent[c]!));
      case 'index': {
        const g = val(0, 0);
        const rt = val(r, 0);
        const ct = val(0, c);
        return g === null || rt === null || ct === null || rt * ct === 0 ? null : (v * g) / (rt * ct);
      }
    }
    // Base-field kinds: the base level lives on the row or the column axis.
    const base = spec.baseField ?? (spec.kind === 'runningTotal' || spec.kind === 'percentOfRunningTotal' ? rowAx.levels[rowAx.D - 1]?.name ?? colAx.levels[colAx.D - 1]?.name : undefined);
    const ri = rowAx.levels.findIndex((l) => l.name === base);
    const ci = colAx.levels.findIndex((l) => l.name === base);
    if (ri === -1 && ci === -1) return spec.kind === 'percentOfParentTotal' ? div(v, val(0, 0)) : v;
    const ax = ri !== -1 ? rowAx : colAx;
    const node = ri !== -1 ? r : c;
    const depth = (ri !== -1 ? ri : ci) + 1;
    const at = (x: number) => (ri !== -1 ? val(x, c) : val(r, x));
    if (spec.kind === 'percentOfParentTotal') return div(v, at(ax.depth[node]! > depth ? ancestor(ax, node, depth) : node));
    if (ax.depth[node]! < depth) return spec.kind === 'runningTotal' ? v : null;
    const a = ancestor(ax, node, depth);
    const below = pathOf(ax, node).slice(depth);
    const swap = (sib: number) => {
      let x = sib;
      for (let l = 0; l < below.length && x !== -1; l++) {
        const m = ax.levels[depth + l]!.byKey.get(below[l]!);
        x = m === undefined ? -1 : childOf(ax, x, m, false);
      }
      return x;
    };
    const sibs = visibleKids(ax, ax.parent[a]!);
    if (spec.kind === 'differenceFrom' || spec.kind === 'percentOfDifferenceFrom') {
      const level = ax.levels[depth - 1]!;
      const bm = level.byKey.get(spec.baseItem ?? null);
      if (bm === undefined || bm === ax.member[a]) return null;
      const sib = childOf(ax, ax.parent[a]!, bm, false);
      const b = sib === -1 ? null : swapped(swap(sib), at);
      if (b === null) return null;
      return spec.kind === 'differenceFrom' ? v - b : div(v - b, b);
    }
    let run = 0;
    let all = 0;
    let seen = false;
    for (const s of sibs) {
      const x = swapped(swap(s), at) ?? 0;
      all += x;
      if (!seen) run += x;
      if (s === a) seen = true;
    }
    return spec.kind === 'runningTotal' ? run : div(run, all);
  }
  const swapped = (x: number, at: (x: number) => number | null) => (x === -1 ? null : at(x));

  // --- result snapshots
  //
  // A PivotResult is an immutable snapshot: its accessors compute cells lazily from the derived state of
  // the run that produced it. Every run reassigns (never mutates in place) the
  // state that depends on the model, so a result keeps a frame of references
  // to its own run's state; reading an older result swaps that frame in for
  // the duration of the call. Frames share the caches that do not depend on
  // the model (field indexes, levels, axes) and, between runs with the same
  // mask, the row profiles, so a drill copies nothing.

  const capture = () => ({
    rows, model, env, rowAx, colAx, measures, stride, customCount, values, mask, excluded, units, view, rawView, colRows,
    profiles, lazy, kidsCache, filterLevels, valueSortCol, valueSortMeasure, rowExpanded, colExpanded, allRows, allCols,
    scratch, scust, stamp, touched, gen,
  });
  type Frame = ReturnType<typeof capture>;
  const restore = (f: Frame) => {
    ({ rows, model, env, rowAx, colAx, measures, stride, customCount, values, mask, excluded, units, view, rawView, colRows } = f);
    ({ profiles, lazy, kidsCache, filterLevels, valueSortCol, valueSortMeasure, rowExpanded, colExpanded, allRows, allCols } = f);
    ({ scratch, scust, stamp, touched, gen } = f);
  };
  /** The frame the engine's variables hold right now (null while a run or a data update is changing them). */
  let live: Frame | null = null;
  const within = <T>(frame: Frame, fn: () => T): T => {
    if (live === frame) return fn();
    const prev = capture();
    const prevLive = live;
    // Own scratch buffers: a suspended run (createPivotJob) may be using the live ones.
    if (frame.stamp === prev.stamp) Object.assign(frame, { scratch: new Float64Array(0), scust: null, stamp: new Int32Array(0), touched: new Int32Array(0), gen: 0 });
    restore(frame);
    live = frame;
    try {
      return fn();
    } finally {
      Object.assign(frame, capture());
      restore(prev);
      live = prevLive;
    }
  };

  // --- result

  let version = 0;
  const text2 = (s: string | undefined, label: string, fallback: string) => (s ?? fallback).replace('{label}', label);

  function makeResult(): PivotResult {
    const rl = layoutAxis(rowAx, true);
    const cl = layoutAxis(colAx, false);
    const ra = rowAx;
    const ca = colAx;
    const vals = values;
    const m = model;
    const pathCache = new Map<number, string>();
    const keyOfPath = (ax: Axis, node: number) => {
      const tag = ax === ra ? node * 2 : node * 2 + 1;
      let s = pathCache.get(tag);
      if (s === undefined) pathCache.set(tag, (s = node === 0 ? '' : JSON.stringify(pathOf(ax, node))));
      return s;
    };
    const descKey = (L: Layout, ax: Axis, d: number): string => {
      const kind = L.dk[d]!;
      const node = L.dn[d]!;
      const base = kind === 2 ? '' : keyOfPath(ax, node);
      const leafish = !L.dc[d] || (ax === ra && L.pk[L.dp[d]!] === 1);
      const meas = L.dm[d]! >= 0 && L.values ? vals[L.dm[d]!]!.name : null;
      if (kind === 3 && L.dc[d]) return `${base}||${meas}`;
      if (leafish && meas !== null) return `${base}|${meas}`;
      if (kind === 1) return `${base}|total`;
      return base;
    };
    const nodesCache = [new Map<number, PivotHeaderNode>(), new Map<number, PivotHeaderNode>()];
    const header = (axis: 'rows' | 'columns', d: number): PivotHeaderNode => {
      const L = axis === 'rows' ? rl : cl;
      const ax = axis === 'rows' ? ra : ca;
      const cache = nodesCache[axis === 'rows' ? 0 : 1]!;
      let h = cache.get(d);
      if (h) return h;
      const kind = L.dk[d]!;
      const node = L.dn[d]!;
      const depth = ax.depth[node]!;
      const level = depth > 0 ? ax.levels[depth - 1]! : null;
      const memberLabel = level ? level.labels[ax.member[node]!]! : '';
      const label =
        kind === 3
          ? vals[L.dm[d]!]!.caption
          : kind === 2
            ? text2(text.grandTotal, '', 'Grand Total')
            : kind === 1
              ? text2(text.total, memberLabel, '{label} Total')
              : memberLabel === BLANK_LABEL && text.blank
                ? text.blank
                : memberLabel;
      const kids = L.dc[d];
      const obj = {
        key: descKey(L, ax, d),
        axis,
        kind: DESC_KIND[kind]!,
        path: node === 0 ? [] : pathOf(ax, node),
        field: kind === 0 || kind === 1 ? (level?.name ?? null) : null,
        measure: L.dm[d]! >= 0 && vals[L.dm[d]!] ? vals[L.dm[d]!]!.name : null,
        label,
        depth: L.dd[d]!,
        position: L.dp[d]!,
        span: L.ds[d]!,
        expandable: kind === 0 && depth < ax.D,
        expanded: kind === 0 && depth < ax.D && isOpenAt(ax, node),
      } as PivotHeaderNode & { children?: readonly PivotHeaderNode[] };
      if (kids) {
        let list: PivotHeaderNode[] | null = null;
        Object.defineProperty(obj, 'children', { enumerable: true, get: () => (list ??= kids.map((x) => header(axis, x))) });
      }
      cache.set(d, (h = Object.freeze(obj)));
      return h;
    };
    const openR = new Set(rowExpanded);
    const openC = new Set(colExpanded);
    const ar = allRows;
    const ac = allCols;
    const isOpenAt = (ax: Axis, node: number) => (ax === ra ? ar || openR.has(node) : ac || openC.has(node));
    const measureAt = (ri: number, ci: number) => (rl.pm[ri]! >= 0 && rl.values ? rl.pm[ri]! : cl.pm[ci]!);
    const check = (ri: number, ci: number) => {
      if (!(ri >= 0 && ri < rl.pn.length && ci >= 0 && ci < cl.pn.length)) throw new RangeError(`pivot cell (${ri}, ${ci}) is outside the result`);
    };
    const computed = (ri: number, ci: number): number | null => {
      if (rl.pk[ri] === 3 || cl.pk[ci] === 3) return null;
      const k = measureAt(ri, ci);
      if (k < 0 || !vals[k]) return null;
      return rawCell(rl.pn[ri]!, cl.pn[ci]!, k);
    };
    const fmt = (k: number, v: number | null) => {
      if (v === null || k < 0) return '';
      const spec = vals[k]!;
      const calc = m.calculatedFields.find((c) => c.name === spec.field.field);
      const f = m.formats[spec.name] ?? m.formats[spec.field.field] ?? calc?.format;
      const kind = spec.field.showAs?.kind;
      const opts = f?.number ?? (kind && PERCENT.has(kind) ? { style: 'percent', maximumFractionDigits: 2 } : { maximumFractionDigits: 2 });
      return numberFormat(env, opts, f?.locale).format(v);
    };
    const cellOf = (ri: number, ci: number): PivotCell => {
      check(ri, ci);
      const k = measureAt(ri, ci);
      const raw = computed(ri, ci);
      const value = raw === null || k < 0 ? raw : showAs(k, rl.pn[ri]!, cl.pn[ci]!, raw);
      const rk = rl.pk[ri]!;
      const ck = cl.pk[ci]!;
      const kind = CELL_KIND[Math.max(rk === 2 || ck === 2 ? 2 : 0, rk === 1 || rk === 3 || ck === 1 ? 1 : 0)]!;
      const p = profiles[rl.pn[ri]!];
      const j = p ? lookup(p, cl.pn[ci]!) : -1;
      const cell: PivotCell = {
        rowIndex: ri,
        columnIndex: ci,
        rowKey: header('rows', rl.ph[ri]!).key,
        columnKey: header('columns', cl.ph[ci]!).key,
        measure: k >= 0 && vals[k] ? vals[k]!.name : null,
        value,
        rawValue: raw,
        formattedValue: fmt(k, value),
        kind,
        rowCount: p && j !== -1 ? p.st[j * stride]! : 0,
      };
      if (!options.getCellValue) return cell;
      const over = options.getCellValue(cell);
      return over === value ? cell : { ...cell, value: over, formattedValue: fmt(k, over) };
    };
    const result: PivotResult & { errors: readonly PivotModelError[] } = {
      version: ++version,
      model: m,
      rowCount: rl.pn.length,
      columnCount: cl.pn.length,
      get rowTree() {
        return rl.roots.map((d) => header('rows', d));
      },
      get columnTree() {
        return cl.roots.map((d) => header('columns', d));
      },
      columnDepth: cl.depth,
      rowDepth: rl.depth,
      errors,
      memberAt(axis, index) {
        const L = axis === 'rows' ? rl : cl;
        if (!(index >= 0 && index < L.pn.length)) throw new RangeError(`pivot ${axis} position ${index} is outside the result`);
        return header(axis, L.ph[index]!);
      },
      valueAt(ri, ci) {
        check(ri, ci);
        return within(frame, () => {
          if (options.getCellValue) return cellOf(ri, ci).value;
          const raw = computed(ri, ci);
          return raw === null ? null : showAs(measureAt(ri, ci), rl.pn[ri]!, cl.pn[ci]!, raw);
        });
      },
      cellAt: (ri, ci) => within(frame, () => cellOf(ri, ci)),
      rowsAt(ri, ci) {
        check(ri, ci);
        return within(frame, () => core.rowsAt(rl.pn[ri]!, cl.pn[ci]!));
      },
    };
    const frame = capture();
    live = frame;
    return Object.freeze(result);
  }

  // --- compute

  const core: PivotCore<Row> = {
    get rows() {
      return rows as readonly Row[];
    },
    set rows(next) {
      live = null;
      rows = next;
    },
    get model() {
      return model;
    },
    set model(next) {
      live = null;
      model = next;
    },
    result: null,
    progress: 0,
    reset,
    diagnostics: () => ({ rows: rows.length, units: units ? units.count : view ? view.order.length : 0, compressed: units !== null, fullComputes: stats.full, incrementalUpdates: stats.incremental }),
    *compute() {
      live = null;
      core.progress = 0;
      env = { locale, formats: model.formats, cache: fmtCache };
      rowAx = yield* buildAxis(model.rows);
      core.progress = 0.25;
      colAx = yield* buildAxis(model.columns);
      core.progress = 0.4;
      setupMeasures();
      const msig = `${measures.map((x) => x.key).join('|')}`;
      const maskSig = `${rowAx.sig}\u0002${colAx.sig}\u0002${json(model.filterBy)}\u0002${json(model.filters)}\u0002${msig}\u0002${json(model.calculatedFields)}`;
      const baseSig = maskSig.replace(json(model.filterBy), '');
      if (maskSig !== sigs.mask || !view) {
        // A member or label filter change on row fields only: keep the profiles of
        // row nodes below an unchanged member of every changed level.
        const prevLevels = filterLevels;
        const prevBy = lastFilterBy;
        const names = new Set([...Object.keys(prevBy), ...Object.keys(model.filterBy)].filter((k) => json(prevBy[k]) !== json(model.filterBy[k])));
        const rowLevel = (name: string) => rowAx.levels.findIndex((l) => l.name === name);
        const reuse =
          view !== null &&
          baseSig === sigs.base &&
          ![...Object.values(prevBy), ...Object.values(model.filterBy)].some((f) => 'value' in f) &&
          [...names].every((n) => rowLevel(n) !== -1);
        yield* buildMask();
        yield* buildViews();
        stats.full++;
        if (reuse) {
          const changed = [...names].map((n) => {
            const l = rowLevel(n);
            const level = rowAx.levels[l]!;
            const was = prevLevels.find((f) => f.level === level)?.allowed;
            const now2 = filterLevels.find((f) => f.level === level)?.allowed;
            const set = new Set<number>();
            for (let m = 0; m < level.keys.length; m++) if ((was ? was(m) : true) !== (now2 ? now2(m) : true)) set.add(m);
            return { depth: l + 1, set };
          });
          // A copy: older results keep the profiles of their own mask.
          profiles = profiles.slice();
          for (let x = 0; x < profiles.length; x++) {
            if (!profiles[x]) continue;
            const keep = changed.every(({ depth, set }) => rowAx.depth[x]! >= depth && !set.has(rowAx.member[ancestor(rowAx, x, depth)]!));
            if (!keep) profiles[x] = undefined;
          }
        } else profiles = [];
        sigs.mask = maskSig;
        sigs.base = baseSig;
        lastFilterBy = model.filterBy;
        lazy = new Map();
        sigs.sort = '';
      }
      core.progress = 0.7;
      resolveExpanded();
      const vs = model.valueSort;
      valueSortCol = vs ? (vs.columnKey === '' || vs.columnKey.startsWith('|') ? 0 : nodeOf(colAx, safePath(vs.columnKey))) : -1;
      valueSortMeasure = vs ? valueIndex(vs.measure) : -1;
      const sortSig = `${json(model.sort)}${json(vs)}${model.showEmptyMembers}`;
      if (sortSig !== sigs.sort) (kidsCache = new Map()), (sigs.sort = sortSig);
      // Profiles of every visible row node, resumable (each from its own units).
      const stack = [0];
      const frontier: number[] = [];
      const opened: number[] = [];
      while (stack.length) {
        const r = stack.pop()!;
        if (isOpen(rowAx, r) && rowAx.kids[r]?.length) {
          opened.push(r);
          if (r !== 0 && !profiles[r]) frontier.push(r);
          for (const k of rowAx.kids[r]!) if ((view!.rows[k] ?? 0) > 0) stack.push(k);
        } else if (!profiles[r]) frontier.push(r);
      }
      for (let x = 0; x < frontier.length; x++) {
        const r = frontier[x]!;
        if (!profiles[r]) profiles[r] = yield* fromUnits(r);
        core.progress = 0.7 + (0.25 * x) / frontier.length;
        yield x;
      }
      for (let x = opened.length - 1; x >= 0; x--) ensure(opened[x]!);
      core.result = makeResult();
      core.progress = 1;
      return core.result;
    },
    fields() {
      const out: PivotFieldInfo[] = [];
      for (const f of fieldOrder) {
        const d = defs.get(f);
        const info = {
          field: f,
          caption: d?.caption ?? f,
          type: typeOf(f),
          hidden: d?.hidden === true,
          sortable: d?.sortable !== false,
          filterable: d?.filterable !== false,
          removable: d?.removable !== false,
          draggable: d?.draggable !== false,
          ...(d?.folder !== undefined ? { folder: d.folder } : {}),
          get memberCount() {
            return drain(fieldIndex(f)).keys.length;
          },
        };
        out.push(info);
      }
      return out;
    },
    members(field, opts = {}) {
      const base = [...model.rows, ...model.columns, ...model.filters].map((f) => f.field).find((f) => levelNames(f, model.groups[f]).includes(field)) ?? field;
      const levels = drain(levelsOf(base));
      const level = levels.find((l) => l.name === field) ?? levels[0];
      if (!level) return [];
      const counts = new Array<number>(level.keys.length).fill(0);
      level.base.counts.forEach((c, b) => (counts[level.remap ? level.remap[b]! : b]! += c));
      const ranks = ranksOf(level);
      const search = opts.search?.toLowerCase();
      let list = level.keys.map((_, m) => m).filter((m) => counts[m]! > 0 && (!search || level.labels[m]!.toLowerCase().includes(search)));
      list.sort((a, b) => ranks[a]! - ranks[b]!);
      if (opts.limit !== undefined) list = list.slice(0, opts.limit);
      return list.map((m) => Object.freeze({ key: level.keys[m]!, label: level.labels[m]!, count: counts[m]! }));
    },
    setRows(next) {
      live = null;
      const prev = rows;
      rows = next;
      if (!incremental(prev, next)) {
        if (!options.fields && (prev.length === 0 || next.length === 0)) setDefs();
        reset();
      }
    },
    rowsAt(r, c) {
      const rv = getRawView();
      const s = rv.start[r] ?? 0;
      const e = s + (rv.units[r] ?? 0);
      const out: number[] = [];
      const depth = colAx.depth[c] ?? 0;
      for (let x = s; x < e; x++) {
        const i = rv.order[x]!;
        if (c === 0 || ancestor(colAx, colAx.leaf[i]!, depth) === c) out.push(i);
      }
      return out;
    },
    expandedPaths(axis, all) {
      const ax = axis === 'rows' ? rowAx : colAx;
      const out: PivotMemberPath[] = [];
      for (let node = 1; node < ax.parent.length; node++) {
        if (ax.depth[node]! >= ax.D) continue;
        if (all || isOpen(ax, node)) out.push([axis, ...pathOf(ax, node)]);
      }
      return out;
    },
  };

  /** Applies a small row delta in place; returns false when a full recompute is needed. */
  function incremental(prev: readonly unknown[], next: readonly unknown[]): boolean {
    if (!view || !rowAx || !prev.length || next.length < prev.length || Object.values(model.filterBy).some((f) => 'value' in f)) return false;
    const changed: number[] = [];
    const limit = Math.max(32, prev.length >> 6);
    for (let i = 0; i < prev.length; i++) if (prev[i] !== next[i] && changed.push(i) > limit) return false;
    const appended = next.length - prev.length;
    if (changed.length + appended > limit) return false;
    // Older results keep their own profiles, lazy cells and mask (copies, not the whole state).
    live = null;
    profiles = profiles.slice();
    lazy = new Map(lazy);
    if (mask && !appended) mask = mask.slice();
    const touchedRows = [...changed];
    for (let i = prev.length; i < next.length; i++) touchedRows.push(i);
    // Old contributions, read before any index changes.
    const old = new Map<number, { r: number; c: number; pass: boolean }>();
    for (const i of changed) old.set(i, { r: rowAx.leaf[i]!, c: colAx.leaf[i]!, pass: !mask || mask[i] === 1 });
    const affected = new Set<number>();
    const adjust = (r: number) => {
      for (let x = r; x !== -1; x = rowAx.parent[x]!) {
        const p = profiles[x];
        lazy.forEach((_, key) => Math.floor(key / Math.max(1, measures.length)) === x && lazy.delete(key));
        if (p) (profiles[x] = undefined), affected.add(x);
      }
    };
    // Subtract with the old rows' values.
    const saved = rows;
    rows = prev;
    for (const i of changed) if (old.get(i)!.pass) adjust(old.get(i)!.r);
    rows = saved;
    // Re-encode the touched rows in every cached index.
    for (const idx of fieldIdx.values()) {
      if (appended) {
        const ids = new Int32Array(next.length);
        ids.set(idx.ids);
        idx.ids = ids;
      }
      for (const i of touchedRows) {
        if (i < prev.length) idx.counts[idx.ids[i]!]!--;
        idx.ids[i] = encodeRow(idx, next, i);
      }
    }
    for (const [f, arr] of numCache) {
      const get = getterOf(defs.get(f), f);
      const out = appended ? new Float64Array(next.length) : arr;
      if (appended) out.set(arr);
      for (const i of touchedRows) numbersOf(next.slice(i, i + 1), get, out.subarray(i, i + 1));
      numCache.set(f, out);
    }
    // Measures hold their numbers by reference: refresh after the realloc.
    for (const level of levelCache.values()) {
      if (!level.remap) {
        level.of(0);
        level.ids = level.base.ids;
      } else {
        if (appended) {
          const ids = new Int32Array(next.length);
          ids.set(level.ids);
          level.ids = ids;
        }
        for (const i of touchedRows) level.ids[i] = level.of(level.base.ids[i]!);
      }
    }
    let moved = appended > 0;
    for (const ax of axisCache.values()) {
      if (appended) {
        const leaf = new Int32Array(next.length);
        leaf.set(ax.leaf);
        ax.leaf = leaf;
      }
      for (const i of touchedRows) {
        let node = 0;
        for (let l = 0; l < ax.D; l++) node = childOf(ax, node, ax.levels[l]!.ids[i]!, true);
        if (ax === rowAx || ax === colAx) if (ax.leaf[i] !== node) moved = true;
        ax.leaf[i] = node;
      }
    }
    setupMeasures();
    if (mask) {
      if (appended) {
        const m2 = new Uint8Array(next.length);
        m2.set(mask);
        mask = m2;
      }
      for (const i of touchedRows) {
        const pass = filterLevels.every((f) => f.allowed(f.level.ids[i]!)) ? 1 : 0;
        if (i >= prev.length || pass !== mask[i]) moved = true;
        mask[i] = pass;
      }
    }
    for (const i of touchedRows) if (!mask || mask[i]) adjust(rowAx.leaf[i]!);
    stats.incremental++;
    if (moved || units) {
      // Ranges changed: rebuild the unit views, keep the surviving profiles.
      drain(buildViews());
      for (const x of affected) profiles[x] = undefined;
      for (let x = 0; x < profiles.length; x++) {
        const p = profiles[x];
        if (p === EMPTY_PROFILE && (view!.rows[x] ?? 0) > 0) profiles[x] = undefined;
      }
    }
    kidsCache = new Map();
    return true;
  }

  return core;
}

/**
 * Measure id of the value field at `k` (types.ts "Measure ids"): the field,
 * `field#aggregate` when another value field uses the same field, and
 * `field#aggregate#k` when even that repeats.
 */
export function measureId(values: readonly PivotValueField[], k: number): string {
  const v = values[k]!;
  const same = values.filter((x) => x.field === v.field);
  if (same.length === 1) return v.field;
  const id = `${v.field}#${v.aggregate}`;
  return same.filter((x) => x.aggregate === v.aggregate).length === 1 ? id : `${id}#${k}`;
}

const safePath = (key: string): Json[] => {
  const end = key.lastIndexOf(']');
  try {
    const v = JSON.parse(end === -1 ? key : key.slice(0, end + 1)) as unknown;
    return Array.isArray(v) ? (v as Json[]) : [];
  } catch {
    return [];
  }
};

function childOf(ax: Axis, parent: number, member: number, create: boolean): number {
  let id: number;
  if (parent === 0) {
    id = ax.top[member] ?? -1;
    if (id !== -1 || !create) return id;
  } else {
    id = ax.map.get(parent, member);
    if (id !== -1 || !create) return id;
  }
  id = ax.parent.length;
  ax.parent.push(parent);
  ax.member.push(member);
  ax.depth.push(ax.depth[parent]! + 1);
  (ax.kids[parent] ??= []).push(id);
  if (parent === 0) ax.top[member] = id;
  else ax.map.put(parent, member, id);
  return id;
}

// ---------------------------------------------------------------------------
// Public engine.

const samePath = (a: PivotMemberPath, b: PivotMemberPath) => a.length === b.length && a.every((x, i) => json(x) === json(b[i]));

export function createPivotEngine<Row>(options: PivotEngineOptions<Row>): PivotEngine<Row> {
  const core = createPivotCore(options);
  const listeners = new Set<() => void>();
  let result = drain(core.compute());
  const commit = (): PivotResult => {
    const next = drain(core.compute());
    if (next !== result) {
      result = next;
      for (const l of [...listeners]) l();
    }
    return result;
  };
  const setModel = (input: PivotModelInput | ((m: PivotModel) => PivotModelInput)) => {
    const next = normalizePivotModel(typeof input === 'function' ? input(core.model) : input);
    if (JSON.stringify(next) === JSON.stringify(core.model)) return result;
    core.model = next;
    return commit();
  };
  const expandedOf = (axis: 'rows' | 'columns'): PivotMemberPath[] => (core.model.expanded === 'all' ? core.expandedPaths(axis, true) : core.model.expanded.filter((p) => p[0] === axis));
  const other = (axis: 'rows' | 'columns') => expandedOf(axis === 'rows' ? 'columns' : 'rows');
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => result,
    getModel: () => core.model,
    getFields: () => core.fields(),
    getMembers: (field, opts) => core.members(field, opts),
    setModel,
    setData(rows) {
      if (rows === core.rows) return result;
      core.setRows(rows);
      return commit();
    },
    expand(path) {
      if (core.model.expanded === 'all') return result;
      if (core.model.expanded.some((p) => samePath(p, path))) return result;
      return setModel((m) => ({ ...m, expanded: [...(m.expanded as PivotMemberPath[]), path] }));
    },
    collapse(path) {
      const list = core.model.expanded === 'all' ? [...core.expandedPaths('rows', true), ...core.expandedPaths('columns', true)] : core.model.expanded;
      return setModel((m) => ({ ...m, expanded: list.filter((p) => !samePath(p, path)) }));
    },
    expandAll(axis) {
      if (!axis) return setModel((m) => ({ ...m, expanded: 'all' }));
      return setModel((m) => ({ ...m, expanded: [...other(axis), ...core.expandedPaths(axis, true)] }));
    },
    collapseAll(axis) {
      return setModel((m) => ({ ...m, expanded: axis ? other(axis) : [] }));
    },
    getRawRows: (indexes) => indexes.map((i) => core.rows[i]!),
    drillThrough: (ri, ci) => result.rowsAt(ri, ci).map((i) => core.rows[i]!),
    refresh() {
      core.reset();
      return commit();
    },
    destroy() {
      listeners.clear();
    },
    getDiagnostics: () => core.diagnostics(),
  };
}

/** One-shot compute (SSR, servers). */
export function computePivot<Row>(options: PivotEngineOptions<Row>): PivotResult {
  return drain(createPivotCore(options).compute());
}

export interface PivotJob {
  /** Works for at most about `budgetMs`, then returns; `done` once the result is ready. */
  run(budgetMs: number): { readonly done: boolean; readonly progress: number };
  /** The result; throws until `run()` reported `done`. */
  result(): PivotResult;
}

/** A resumable compute for time slicing on the main thread or a Worker. */
export function createPivotJob<Row>(options: PivotEngineOptions<Row>): PivotJob {
  const core = createPivotCore(options);
  const gen = core.compute();
  let out: PivotResult | null = null;
  return {
    run(budgetMs) {
      const end = now() + budgetMs;
      while (!out) {
        const step = gen.next();
        if (step.done) out = step.value;
        else if (now() >= end) break;
      }
      return { done: out !== null, progress: out ? 1 : core.progress };
    },
    result() {
      if (!out) throw new Error('pivot job is not done; call run() until done');
      return out;
    },
  };
}
