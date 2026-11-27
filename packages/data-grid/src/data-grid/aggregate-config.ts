// Aggregate wiring of the `aggregates` render feature (feature-aggregates.ts):
// module registration, engine options, the initial aggregates query, custom
// aggregate resolution and the reactive `aggregates` / `aggregateScope` sync
// (compared with the previous prop value). Reached only through the
// feature, so a grid without `aggregates` never loads it or core
// `aggregates.ts`. No rendering here.

import { createAggregatesModule, type AggregateDescriptor, type AggregateInput, type AggregateType, type DataGridModule, type DataGridQueryInit } from '@salmonui/data-grid/engine';
import { typesOf } from './aggregate-rows.js';
import type { DataGridFeatureUi, NormalizedProps } from './features/types.js';
import type { DataGridInstance } from './instance.js';
import { placed, type AggregatePlacement } from './group-static.js';
import type { DataGridAggregate, DataGridAggregateRow } from './types.js';

/** Engine descriptors of the `aggregates` prop; one per (field, type) and placement union. */
export function aggregateDescriptors<Row>(rows: readonly DataGridAggregateRow<Row>[] | undefined): AggregateDescriptor[] {
  return aggregateInputs(rows).map(({ customId, ...d }) => (customId ? { ...d, custom: customById(rows, customId) } : d) as AggregateDescriptor);
}

/** Serializable `aggregates.set` payload; custom functions are referenced as `r<row>:c<column>`. */
export function aggregateInputs<Row>(rows: readonly DataGridAggregateRow<Row>[] | undefined): AggregateInput[] {
  const merged = new Map<string, { columnId: string; type: AggregateType; placement: Set<AggregatePlacement>; format?: string; customId?: string }>();
  (rows ?? []).forEach((row, r) => {
    row.columns.forEach((column, c) => {
      for (const type of typesOf(column)) {
        // A custom aggregate is its own entry (keyed by its id); built-in ones merge per field, type and format.
        const customId = type === 'custom' ? `r${r}:c${c}` : undefined;
        const key = customId ?? `${column.field}|${type}|${column.format ?? ''}`;
        let entry = merged.get(key);
        if (!entry) {
          entry = { columnId: column.field, type, placement: new Set(), ...(column.format ? { format: column.format } : {}), ...(customId ? { customId } : {}) };
          merged.set(key, entry);
        }
        for (const p of PLACEMENTS) if (placed(column, p)) entry.placement.add(p);
      }
    });
  });
  // Entries carry `format` and `customId` only when set.
  return [...merged.values()].map((e) => ({ ...e, placement: [...e.placement] }));
}

const PLACEMENTS: readonly AggregatePlacement[] = ['footer', 'groupFooter', 'groupCaption'];

function customById<Row>(rows: readonly DataGridAggregateRow<Row>[] | undefined, id: string): DataGridAggregate<Row>['custom'] {
  // `r<row>:c<column>` (aggregateInputs); a malformed id indexes nothing.
  const [r, c] = id.slice(1).split(':c').map(Number);
  return rows?.[r as number]?.columns[c as number]?.custom;
}

/** The core `aggregates` module when the trigger holds (`aggregates !== undefined`); the instance skips it when the app passes one. */
export function aggregatesModules(props: NormalizedProps): readonly DataGridModule<unknown>[] {
  return props.aggregates === undefined ? [] : [createAggregatesModule<unknown>() as unknown as DataGridModule<unknown>];
}

/** Engine options of the aggregates module (`options.aggregates`). */
export function aggregatesEngineOptions(props: NormalizedProps, latest: () => NormalizedProps): Record<string, unknown> {
  return {
    aggregates: {
      // The module defaults to 'page'.
      scope: props.aggregateScope,
      custom: (id: string) => customById(latest().aggregates, id),
    },
  };
}

/** Initial aggregates, so the server snapshot already has them. */
export function aggregatesDefaultQuery(props: NormalizedProps): DataGridQueryInit | undefined {
  return props.aggregates ? { aggregates: aggregateDescriptors(props.aggregates) } : undefined;
}

/** Syncs the aggregate props after a render (layout effect); compared with the previous prop value. */
function syncAggregates(instance: DataGridInstance<unknown>, props: NormalizedProps, prev: NormalizedProps): void {
  if (instance.engine.getModuleState('aggregates') === undefined) return;
  if (props.aggregates !== prev.aggregates) {
    const next = aggregateInputs(props.aggregates);
    if (JSON.stringify(next) !== JSON.stringify(aggregateInputs(prev.aggregates))) instance.syncDispatch({ type: 'aggregates.set', aggregates: next });
  }
  const scope = props.aggregateScope ?? 'page';
  if (scope !== (prev.aggregateScope ?? 'page')) instance.syncDispatch({ type: 'aggregates.setScope', scope });
}

/** The aggregates controller: reactive prop sync. */
export function createAggregatesUi(instance: DataGridInstance<unknown>): DataGridFeatureUi {
  return { sync: (props, prev) => syncAggregates(instance, props, prev) };
}
