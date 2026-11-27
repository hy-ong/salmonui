// Pivot engine public types. Everything here is plain
// JSON except `PivotFieldDefinition` accessors and custom aggregators, which
// are client-only.
//
// This file is the shared contract of the pivot modules (engine,
// React parts, export, remote pivot). Extend it additively.

import type { Json } from '@salmonui/core/data';

export type { Json };

export type PivotFieldType = 'string' | 'number' | 'date' | 'boolean';

/** One source field. */
export interface PivotFieldDefinition<Row = unknown> {
  readonly field: string;
  readonly caption?: string;
  /** Inferred from the first non-null value when omitted. */
  readonly type?: PivotFieldType;
  /** Field list folder. */
  readonly folder?: string;
  /** Hidden from the field list and axis bar. */
  readonly hidden?: boolean;
  readonly sortable?: boolean;
  readonly filterable?: boolean;
  readonly removable?: boolean;
  readonly draggable?: boolean;
  /** Reads the raw value; defaults to `row[field]`. */
  readonly valueGetter?: (row: Row) => unknown;
}

/** A field placed on the rows, columns or filters axis. */
export interface PivotAxisField {
  readonly field: string;
  readonly caption?: string;
  /** Per-field subtotal visibility; overrides `totals.sub`. */
  readonly showSubTotals?: boolean;
}

export type PivotAggregate =
  | 'sum'
  | 'product'
  | 'count'
  | 'distinctCount'
  | 'min'
  | 'max'
  | 'average'
  | 'median'
  | 'populationStdev'
  | 'sampleStdev'
  | 'populationVar'
  | 'sampleVar'
  | 'custom';

export type PivotShowAsKind =
  | 'percentOfGrandTotal'
  | 'percentOfColumnTotal'
  | 'percentOfRowTotal'
  | 'percentOfParentTotal'
  | 'percentOfParentColumnTotal'
  | 'percentOfParentRowTotal'
  | 'runningTotal'
  | 'percentOfRunningTotal'
  | 'differenceFrom'
  | 'percentOfDifferenceFrom'
  | 'index';

export interface PivotShowAs {
  readonly kind: PivotShowAsKind;
  readonly baseField?: string;
  readonly baseItem?: Json;
}

/**
 * A value field (one measure of the result).
 *
 * Measure ids: every value field has a measure id, unique within
 * `model.values`, used in `PivotHeaderNode.measure`, `PivotCell.measure`,
 * header keys (`...|<measure id>`), `valueSort.measure`, value filters and
 * `formats`. It is `field` when no other value field uses the same field,
 * `field#aggregate` when one does (`Freight#average`, `Freight#sampleStdev`),
 * and `field#aggregate#index` (position in `model.values`) when even that
 * repeats. `measureId(values, index)` computes it. `valueSort.measure`, value
 * filters and `formats` also accept the plain `field` (first match).
 */
export interface PivotValueField {
  readonly field: string;
  readonly caption?: string;
  readonly aggregate: PivotAggregate;
  /** `aggregate: 'custom'`: key into `PivotEngineOptions.customAggregates`. */
  readonly customId?: string;
  readonly showAs?: PivotShowAs;
}

/** A custom mergeable aggregator (client-only, never on the wire). */
export interface PivotCustomAggregator<State = unknown> {
  init(): State;
  add(state: State, value: unknown): State;
  merge(a: State, b: State): State;
  result(state: State): number | null;
}

/** Label filter operators reuse the Data Grid `FilterOperator` names. */
export type PivotLabelOperator =
  | 'equal'
  | 'notEqual'
  | 'contains'
  | 'doesNotContain'
  | 'startsWith'
  | 'doesNotStartWith'
  | 'endsWith'
  | 'doesNotEndWith'
  | 'greaterThan'
  | 'greaterThanOrEqual'
  | 'lessThan'
  | 'lessThanOrEqual'
  | 'between'
  | 'notBetween';

export type PivotValueOperator =
  | 'equal'
  | 'notEqual'
  | 'greaterThan'
  | 'greaterThanOrEqual'
  | 'lessThan'
  | 'lessThanOrEqual'
  | 'between'
  | 'notBetween'
  | 'top'
  | 'bottom';

/** Member filter (include or exclude member keys), label filter or value filter (-03, -04). */
export type PivotFilter =
  | { readonly include: readonly Json[] }
  | { readonly exclude: readonly Json[] }
  | { readonly label: { readonly operator: PivotLabelOperator; readonly value: Json; readonly value2?: Json; readonly caseSensitive?: boolean } }
  | { readonly value: { readonly measure: string; readonly operator: PivotValueOperator; readonly value: number; readonly value2?: number } };

export type PivotMemberSort = 'asc' | 'desc' | 'none' | { readonly order: readonly Json[] };

/** Sort row members by the values of one column tuple. */
export interface PivotValueSort {
  /** Column leaf key (`PivotHeaderNode.key`) whose values order the rows; `''` = the grand total column. */
  readonly columnKey: string;
  /** Value field (`PivotValueField` caption-independent name: `field` or calculated field `name`). */
  readonly measure: string;
  readonly direction: 'asc' | 'desc';
  /** Sort every row level (true) or only the innermost one. */
  readonly multipleAxis?: boolean;
}

export type PivotDatePart = 'years' | 'quarters' | 'quarterYear' | 'months' | 'days' | 'hours' | 'minutes' | 'seconds';

export type PivotGrouping =
  | { readonly kind: 'number'; readonly start?: number; readonly end?: number; readonly interval: number }
  | { readonly kind: 'date'; readonly parts: readonly PivotDatePart[]; readonly start?: string; readonly end?: string }
  | { readonly kind: 'custom'; readonly groups: readonly { readonly caption: string; readonly members: readonly Json[] }[] };

export interface PivotCalculatedField {
  /** Measure name used by `values[].field`, value sort and value filters. */
  readonly name: string;
  readonly caption?: string;
  /** Formula over aggregated measures: `"Sum(Amount)" / "Count(Units)"`, `IF(...)`, ... */
  readonly formula: string;
  readonly format?: PivotFormat;
}

/** `Intl.NumberFormat` options (or date options for date members) per value or field. */
export interface PivotFormat {
  readonly number?: Intl.NumberFormatOptions;
  readonly date?: Intl.DateTimeFormatOptions;
  readonly locale?: string;
}

export interface PivotConditionalFormat {
  /** Measure name; omitted = every value field. */
  readonly measure?: string;
  readonly operator: PivotValueOperator;
  readonly value: number;
  readonly value2?: number;
  /** A class added to the cell, or one of the seed tones. */
  readonly className?: string;
  readonly tone?: 'accent' | 'success' | 'warning' | 'danger' | 'neutral';
  readonly style?: Readonly<Record<string, string>>;
  /** Apply to grand total cells too (default true). */
  readonly applyGrandTotals?: boolean;
}

/** Member keys from the axis root, prefixed by the axis: `['rows', 'Asia', 'Japan']`. */
export type PivotMemberPath = readonly [axis: 'rows' | 'columns', ...members: Json[]];

export interface PivotTotals {
  readonly grand: 'both' | 'rows' | 'columns' | 'none';
  readonly grandPosition: 'start' | 'end';
  readonly sub: boolean | Readonly<Record<string, boolean>>;
  readonly subPosition: 'start' | 'end' | 'auto';
}

export interface PivotModel {
  readonly rows: readonly PivotAxisField[];
  readonly columns: readonly PivotAxisField[];
  readonly values: readonly PivotValueField[];
  readonly filters: readonly PivotAxisField[];
  readonly filterBy: Readonly<Record<string, PivotFilter>>;
  readonly sort: Readonly<Record<string, PivotMemberSort>>;
  readonly valueSort: PivotValueSort | null;
  readonly groups: Readonly<Record<string, PivotGrouping>>;
  readonly calculatedFields: readonly PivotCalculatedField[];
  readonly formats: Readonly<Record<string, PivotFormat>>;
  readonly conditionalFormats: readonly PivotConditionalFormat[];
  readonly expanded: readonly PivotMemberPath[] | 'all';
  readonly totals: PivotTotals;
  readonly valuesPlacement: { readonly axis: 'columns' | 'rows'; readonly index: number };
  readonly showEmptyMembers: boolean;
  readonly showValueHeader?: boolean;
}

/** Every field optional: what callers pass; `normalizePivotModel()` fills the defaults. */
export type PivotModelInput = { readonly [K in keyof PivotModel]?: PivotModel[K] };

export type PivotHeaderKind = 'member' | 'subtotal' | 'grandTotal' | 'value';

/** A header node of the row or column tree (lazily materialized). */
export interface PivotHeaderNode {
  /** Stable key: member keys (and measure) joined, unique per axis. */
  readonly key: string;
  readonly axis: 'rows' | 'columns';
  readonly kind: PivotHeaderKind;
  /** Member keys from the axis root. */
  readonly path: readonly Json[];
  /** Field of the innermost member (null for grand totals and value headers). */
  readonly field: string | null;
  /** Measure name for `kind: 'value'` headers and for leaves under them. */
  readonly measure: string | null;
  readonly label: string;
  readonly depth: number;
  /** First leaf position covered and the number of leaf positions. */
  readonly position: number;
  readonly span: number;
  /** Has children (expanded or not). */
  readonly expandable: boolean;
  readonly expanded: boolean;
  readonly children?: readonly PivotHeaderNode[];
}

export interface PivotCell {
  readonly rowIndex: number;
  readonly columnIndex: number;
  readonly rowKey: string;
  readonly columnKey: string;
  readonly measure: string | null;
  /** Aggregated value (after calculated fields and show-values-as), or null for empty. */
  readonly value: number | null;
  /** Raw aggregate before show-values-as. */
  readonly rawValue: number | null;
  readonly formattedValue: string;
  readonly kind: 'value' | 'subtotal' | 'grandTotal';
  /** Number of raw rows behind the cell (drill through). */
  readonly rowCount: number;
}

export interface PivotFieldInfo {
  readonly field: string;
  readonly caption: string;
  readonly type: PivotFieldType;
  readonly folder?: string;
  readonly hidden: boolean;
  readonly sortable: boolean;
  readonly filterable: boolean;
  readonly removable: boolean;
  readonly draggable: boolean;
  readonly memberCount: number;
}

export interface PivotMember {
  readonly key: Json;
  readonly label: string;
  readonly count: number;
}

/** The result of one engine run. Header nodes and cells are materialized on demand. */
export interface PivotResult {
  readonly version: number;
  readonly model: PivotModel;
  /** Visible (expanded) leaf rows and columns. */
  readonly rowCount: number;
  readonly columnCount: number;
  /** Header roots per axis (grand total node included when shown). */
  readonly rowTree: readonly PivotHeaderNode[];
  readonly columnTree: readonly PivotHeaderNode[];
  /** Depth of the column header tree (header row count). */
  readonly columnDepth: number;
  readonly rowDepth: number;
  /** Leaf header of a visible row or column position. */
  memberAt(axis: 'rows' | 'columns', index: number): PivotHeaderNode;
  valueAt(rowIndex: number, columnIndex: number): number | null;
  cellAt(rowIndex: number, columnIndex: number): PivotCell;
  /** Raw row indexes behind a cell (drill through). */
  rowsAt(rowIndex: number, columnIndex: number): readonly number[];
}

export type PivotComputeStatus = 'idle' | 'computing' | 'ready' | 'error';
