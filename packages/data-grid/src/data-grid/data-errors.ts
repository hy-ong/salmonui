// `onError` with `action: 'data'` (data failures): fires once each time the data status turns to
// `error`. One status selector per grid; the event is allocated only when
// `onError` is bound.

import { gridEvent } from '@salmonui/core/internal/events';
import type { DataGridInstance } from './instance.js';
import type { DataGridErrorEvent } from './query-types.js';

/** Subscribes the data error event after mount; returns the teardown. */
export function mountDataErrorEvents<Row>(instance: DataGridInstance<Row>): () => void {
  const engine = instance.engine;
  return engine.subscribeSelector(
    (s) => s.data.status === 'error',
    (failed) => {
      const handler = instance.props.onError;
      if (!failed || !handler) return;
      const raw = engine.getSnapshot().data.error;
      const error = raw instanceof Error ? raw : new Error(String(raw ?? 'Data error'));
      handler(gridEvent<DataGridErrorEvent>('error', 'api', { error, action: 'data' }));
    },
  );
}
