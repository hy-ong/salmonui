import type { DataSourceRequest, DataSourceResult, FilterEntry } from '@salmonui/core/data';

// A stand-in for a remote list endpoint used by the Dropdowns demos: it
// answers the `@salmonui/data` read contract (search, base filters and sort,
// `range`, `totalRowCount`, `AbortSignal`) over an in-memory array after a
// delay, like a server would. Applications pass `createJsonDataSource(...)`
// or any other `@salmonui/data` source instead.

export interface DemoListSourceOptions<T> {
  readonly rows: readonly T[];
  /** Simulated latency in ms. Default 400. */
  readonly latency?: number;
  /** Receives one line per read, abort and failure. */
  readonly log?: (entry: string) => void;
  /** Checked on every read; `true` makes that read fail. */
  readonly shouldFail?: () => boolean;
}

export interface DemoListSource<T> {
  read(request: DataSourceRequest): Promise<DataSourceResult<T>>;
}

const field = (row: unknown, name: string): unknown => (row as Record<string, unknown>)[name];

function fold(text: string, ignoreCase: boolean, ignoreAccent: boolean): string {
  const plain = ignoreAccent ? text.normalize('NFD').replace(/\p{M}/gu, '') : text;
  return ignoreCase ? plain.toLowerCase() : plain;
}

function passes(row: unknown, entry: FilterEntry): boolean {
  if (entry.kind === 'group') {
    const results = entry.filters.map((member) => passes(row, member));
    const combined = entry.predicate === 'or' ? results.some(Boolean) : results.every(Boolean);
    return entry.not ? !combined : combined;
  }
  const value = field(row, entry.columnId);
  if (entry.operator === 'in') return Array.isArray(entry.value) && entry.value.some((v) => String(v) === String(value));
  if (entry.operator === 'notEqual') return value !== entry.value;
  return value === entry.value;
}

export function createDemoListSource<T>({ rows, latency = 400, log, shouldFail }: DemoListSourceOptions<T>): DemoListSource<T> {
  return {
    read(request) {
      const { search, filters, sorting } = request.query;
      const range = request.range;
      const label = `${search?.text ? `search "${search.text}"` : 'no search'}${filters.length ? `, ${filters.length} filter(s)` : ''}${range ? `, rows ${range.start}–${range.end}` : ''}`;
      log?.(`read: ${label}`);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          if (shouldFail?.()) {
            log?.(`failed: ${label}`);
            reject(new Error('The server did not answer'));
            return;
          }
          let result = rows.filter((row) => filters.every((entry) => passes(row, entry)));
          if (search && search.text !== '') {
            const needle = fold(search.text, search.ignoreCase, search.ignoreAccent);
            const columns = search.columnIds === 'all' ? Object.keys((rows[0] ?? {}) as object) : search.columnIds;
            result = result.filter((row) =>
              columns.some((column) => {
                const text = fold(String(field(row, column) ?? ''), search.ignoreCase, search.ignoreAccent);
                return search.operator === 'contains' ? text.includes(needle) : search.operator === 'endsWith' ? text.endsWith(needle) : text.startsWith(needle);
              }),
            );
          }
          const sort = sorting[0];
          if (sort) {
            const direction = sort.direction === 'desc' ? -1 : 1;
            result = [...result].sort((a, b) => direction * String(field(a, sort.columnId)).localeCompare(String(field(b, sort.columnId)), undefined, { numeric: true }));
          }
          resolve({ version: request.version, rows: range ? result.slice(range.start, range.end) : result, totalRowCount: result.length });
        }, latency);
        request.signal.addEventListener('abort', () => {
          clearTimeout(timer);
          log?.(`aborted: ${label}`);
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    },
  };
}
