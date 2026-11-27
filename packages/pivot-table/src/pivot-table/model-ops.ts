// Pure report model edits used by the controller commands, the field list
// and the axis bar. Every function returns a
// new model input; the controller normalizes it.

import type { PivotAggregate, PivotAxisField, PivotFieldInfo, PivotModel, PivotModelInput, PivotValueField } from '@salmonui/pivot-table/engine';
import type { PivotAxis } from './types.js';

/** Id of the "Values" pseudo field in the axis lists. */
export const VALUES_FIELD = '__values';

/** Axis of a field on the report, or null; value fields report `values`. */
export function axisOf(model: PivotModel, field: string): PivotAxis | null {
  if (model.rows.some((f) => f.field === field)) return 'rows';
  if (model.columns.some((f) => f.field === field)) return 'columns';
  if (model.filters.some((f) => f.field === field)) return 'filters';
  if (model.values.some((f) => f.field === field)) return 'values';
  return null;
}

/** Whether the Values pseudo field is shown in the axis lists (more than one measure, or `showValueHeader`). */
export function showsValuesItem(model: PivotModel): boolean {
  return model.values.length > 1 || model.showValueHeader === true;
}

/** Fields of an axis as ids, with the Values item at its placement on the rows or columns axis. */
export function axisItems(model: PivotModel, axis: PivotAxis): readonly string[] {
  if (axis === 'values') return model.values.map((v) => v.field);
  const list = (axis === 'rows' ? model.rows : axis === 'columns' ? model.columns : model.filters).map((f) => f.field);
  if (axis !== 'filters' && model.valuesPlacement.axis === axis && showsValuesItem(model)) {
    const index = Math.max(0, Math.min(model.valuesPlacement.index < 0 ? list.length : model.valuesPlacement.index, list.length));
    return [...list.slice(0, index), VALUES_FIELD, ...list.slice(index)];
  }
  return list;
}

/** Default aggregate of a field moved to values: `sum` for numbers, else `count`. */
export function defaultAggregate(info: PivotFieldInfo | undefined): PivotAggregate {
  return info?.type === 'number' ? 'sum' : 'count';
}

/**
 * Moves `field` to `to` at `index` (-1 = end), or removes it (`to: null`).
 * `index` counts the axis items as `axisItems()` lists them (the Values item included).
 */
export function moveField(model: PivotModel, field: string, to: PivotAxis | null, index: number, fields: readonly PivotFieldInfo[]): PivotModelInput {
  const from = field === VALUES_FIELD ? model.valuesPlacement.axis : axisOf(model, field);
  if (field === VALUES_FIELD && to !== 'rows' && to !== 'columns') return model;
  // Work on the item lists (the Values item is a real element), then derive the fields and the placement.
  const lists: Record<PivotAxis, string[]> = {
    rows: [...axisItems(model, 'rows')],
    columns: [...axisItems(model, 'columns')],
    filters: [...axisItems(model, 'filters')],
    values: [...axisItems(model, 'values')],
  };
  if (from) lists[from] = lists[from].filter((id) => id !== field);
  if (to) {
    const list = lists[to];
    const at = index < 0 || index > list.length ? list.length : index;
    list.splice(at, 0, field);
  }
  const axisFieldOf = (id: string): PivotAxisField => model.rows.find((f) => f.field === id) ?? model.columns.find((f) => f.field === id) ?? model.filters.find((f) => f.field === id) ?? { field: id };
  const fieldsOf = (axis: 'rows' | 'columns' | 'filters'): PivotAxisField[] => lists[axis].filter((id) => id !== VALUES_FIELD).map(axisFieldOf);
  const values: PivotValueField[] = lists.values.map((id) => {
    const existing = model.values.find((v) => v.field === id);
    if (existing) return existing;
    const info = fields.find((f) => f.field === id);
    return info?.caption && info.caption !== id ? { field: id, caption: info.caption, aggregate: defaultAggregate(info) } : { field: id, aggregate: defaultAggregate(info) };
  });
  let valuesPlacement = model.valuesPlacement;
  for (const axis of ['rows', 'columns'] as const) {
    const at = lists[axis].indexOf(VALUES_FIELD);
    if (at >= 0) valuesPlacement = { axis, index: at };
  }
  const filterBy = to === null && model.filterBy[field] ? omit(model.filterBy, field) : model.filterBy;
  return { ...model, rows: fieldsOf('rows'), columns: fieldsOf('columns'), filters: fieldsOf('filters'), values, valuesPlacement, filterBy };
}

/** Moves the field one step inside its axis (Alt+ArrowUp / ArrowDown). */
export function stepField(model: PivotModel, field: string, axis: PivotAxis, step: -1 | 1, fields: readonly PivotFieldInfo[]): PivotModelInput | null {
  const items = axisItems(model, axis);
  const i = items.indexOf(field);
  const j = i + step;
  if (i < 0 || j < 0 || j >= items.length) return null;
  return moveField(model, field, axis, j, fields);
}

export function omit<T>(record: Readonly<Record<string, T>>, key: string): Record<string, T> {
  const next: Record<string, T> = {};
  for (const k of Object.keys(record)) if (k !== key) next[k] = record[k] as T;
  return next;
}

/** Changes the aggregate of the value field at `index`. */
export function setAggregate(model: PivotModel, index: number, aggregate: PivotAggregate): PivotModelInput {
  return { ...model, values: model.values.map((v, i) => (i === index ? { ...v, aggregate } : v)) };
}

/** Caption shown for a field: the axis caption, the value caption, the field definition caption, else the name. */
export function captionOf(model: PivotModel, field: string, fields: readonly PivotFieldInfo[]): string {
  const onAxis: PivotAxisField | undefined = model.rows.find((f) => f.field === field) ?? model.columns.find((f) => f.field === field) ?? model.filters.find((f) => f.field === field);
  if (onAxis?.caption) return onAxis.caption;
  const value = model.values.find((v) => v.field === field);
  if (value?.caption) return value.caption;
  const calc = model.calculatedFields.find((c) => c.name === field);
  if (calc) return calc.caption ?? calc.name;
  return fields.find((f) => f.field === field)?.caption ?? field;
}

/** Display text of an aggregate (`Sum of Amount`). */
export const AGGREGATE_LABELS: Readonly<Record<PivotAggregate, string>> = {
  sum: 'Sum',
  product: 'Product',
  count: 'Count',
  distinctCount: 'Distinct count',
  min: 'Min',
  max: 'Max',
  average: 'Average',
  median: 'Median',
  populationStdev: 'Population StDev',
  sampleStdev: 'Sample StDev',
  populationVar: 'Population Var',
  sampleVar: 'Sample Var',
  custom: 'Custom',
};

/** Aggregates offered by default; non-numeric fields get `count` and `distinctCount` only. */
export function aggregateOptionsFor(info: PivotFieldInfo | undefined, options?: readonly PivotAggregate[]): PivotAggregate[] {
  const all: PivotAggregate[] = options ? [...options] : ['sum', 'count', 'distinctCount', 'average', 'median', 'min', 'max', 'product', 'populationStdev', 'sampleStdev', 'populationVar', 'sampleVar'];
  return info && info.type !== 'number' ? all.filter((a) => a === 'count' || a === 'distinctCount') : all;
}
