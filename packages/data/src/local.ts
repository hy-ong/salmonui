// Offline mode: fetch the whole set once, then run every stage
// locally in the core (`mode: 'local'`).

import { createAbortController } from './scheduler.js';
import type { AbortSignalLike, DataSourceEvent, DataSourceRequest, DataSourceResult, DataSource } from './types.js';

export interface OfflineDataSourceOptions<Row> {
  /** Loads the complete row set (for example `createJsonDataSource(...).read` without paging, or a plain fetch). */
  readonly load: (signal: AbortSignalLike) => Promise<readonly Row[]>;
  /** Called with load failures. */
  readonly onError?: (error: unknown) => void;
}

export interface OfflineDataSource<Row> extends DataSource<Row> {
  readonly mode: 'local';
  read(request: DataSourceRequest): DataSourceResult<Row>;
  subscribe(listener: (event: DataSourceEvent<Row>) => void): () => void;
  /** (Re)loads the set; emits one `reset`. The first `read` starts it automatically. */
  load(): Promise<readonly Row[]>;
  readonly status: 'idle' | 'loading' | 'ready' | 'error';
}

export function createOfflineDataSource<Row>(options: OfflineDataSourceOptions<Row>): OfflineDataSource<Row> {
  let rows: readonly Row[] = [];
  let status: OfflineDataSource<Row>['status'] = 'idle';
  let controller = createAbortController();
  const listeners = new Set<(event: DataSourceEvent<Row>) => void>();

  const source: OfflineDataSource<Row> = {
    mode: 'local',
    capabilities: Object.freeze({ reload: true }),
    get status() {
      return status;
    },
    read(request) {
      if (status === 'idle') void source.load().catch(() => {});
      return { version: request.version, rows, totalRowCount: rows.length };
    },
    load() {
      controller.abort();
      controller = createAbortController();
      const signal = controller.signal;
      status = 'loading';
      const promise = options.load(signal).then(
        (next) => {
          if (signal.aborted) return rows;
          rows = next;
          status = 'ready';
          const event = Object.freeze({ type: 'reset' as const, rows, totalRowCount: rows.length });
          for (const l of listeners) l(event);
          return rows;
        },
        (error: unknown) => {
          if (!signal.aborted) {
            status = 'error';
            options.onError?.(error);
          }
          throw error;
        },
      );
      return promise;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  return source;
}
