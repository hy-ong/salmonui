'use client';

// `usePivot()`: creates one PivotController per
// component instance and keeps its reactive inputs (`data`, `pivotModel`,
// handlers) current. `usePivotState()` is the narrow selector hook the parts
// use; selectors must return stable values (fields of the store snapshot).

import { useLayoutEffect, useState, useSyncExternalStore } from 'react';
import { useLocale } from '@salmonui/core/internal/locale';
import { PivotController } from './controller.js';
import type { PivotState, UsePivotOptions } from './types.js';

/**
 * Creates the pivot store shared by `PivotTable`, `PivotFieldList`,
 * `PivotAxisBar`, `PivotToolbar` and the chart adapters. The component that
 * calls it re-renders when the result or the status changes.
 */
export function usePivot<Row = unknown>(own: UsePivotOptions<Row> = {}): PivotController<Row> {
  // The nearest `LocaleProvider` locale when the options set none.
  const locale = useLocale(own.locale);
  const options: UsePivotOptions<Row> = { ...own, locale };
  const [pivot] = useState(() => new PivotController<Row>(options));
  useLayoutEffect(() => {
    pivot.updateOptions(options);
  });
  useLayoutEffect(() => pivot.mount(), [pivot]);
  const { data, pivotModel } = options;
  useLayoutEffect(() => {
    pivot.applyDataProp(data);
  }, [pivot, data]);
  useLayoutEffect(() => {
    pivot.applyModelProp(pivotModel);
  }, [pivot, pivotModel]);
  // The host re-renders on result and status changes (`pivot.result`, `pivot.status`).
  usePivotState(pivot, selectResult);
  usePivotState(pivot, selectStatus);
  return pivot;
}

const selectResult = (s: PivotState) => s.result;
const selectStatus = (s: PivotState) => s.status;

/** Subscribes to one field of the pivot store. `selector` must return a value that keeps its identity. */
export function usePivotState<T, Row = unknown>(pivot: PivotController<Row>, selector: (state: PivotState) => T): T {
  return useSyncExternalStore(
    pivot.subscribe,
    () => selector(pivot.getSnapshot()),
    () => selector(pivot.getSnapshot()),
  );
}
