// Type contract: the structural copies in @salmonui/data stay assignable to and
// from @salmonui/data-grid/engine. Checked by
// `tsc -b` (packages/data/tests is in the root solution); the runtime test
// only keeps node:test aware of the file.
import assert from 'node:assert/strict';
import { it } from 'node:test';
import type * as core from '@salmonui/data-grid/engine';
import type * as data from '@salmonui/data';

type Assert<T extends true> = T;
type Extends<A, B> = [A] extends [B] ? true : false;
type Row = readonly unknown[];

export type Checks = [
  // Requests and queries produced by the core are accepted by every adapter.
  Assert<Extends<core.DataQuery, data.DataQuery>>,
  Assert<Extends<data.DataQuery, core.DataQuery>>,
  Assert<Extends<data.FilterEntry, core.FilterEntry>>,
  Assert<Extends<core.FilterEntry, data.FilterEntry>>,
  Assert<Extends<core.DataSourceRequest, data.DataSourceRequest>>,
  Assert<Extends<core.WriteRequest<Row>, data.WriteRequest<Row>>>,
  Assert<Extends<data.WriteRequest<Row>, core.WriteRequest<Row>>>,
  Assert<Extends<data.RowPlacement, core.RowPlacement>>,
  Assert<Extends<core.DataSourceEvent<Row>, data.DataSourceEvent<Row>>>,
  Assert<Extends<core.DataSource<Row>, data.DataSource<Row>>>,
  Assert<Extends<core.DataSourceCapabilities, data.DataSourceCapabilities>>,
  Assert<Extends<data.DataSourceCapabilities, core.DataSourceCapabilities>>,
  // Adapter outputs are accepted by the core.
  Assert<Extends<data.DataSourceResult<Row>, core.DataSourceResult<Row>>>,
  Assert<Extends<data.WriteResult<Row>, core.WriteResult<Row>>>,
  Assert<Extends<data.DataSourceEvent<Row>, core.DataSourceEvent<Row>>>,
  Assert<Extends<data.JsonDataSource<Row>, core.DataSource<Row>>>,
  Assert<Extends<data.LiveDataSource<Row>, core.DataSource<Row>>>,
  Assert<Extends<data.OfflineDataSource<Row>, core.DataSource<Row>>>,
  Assert<Extends<data.DataSource<Row>, core.DataSource<Row>>>,
  Assert<Extends<data.AbortSignalLike, core.AbortSignalLike>>,
  // Tuple columns are data-grid-core column definitions.
  Assert<Extends<ReturnType<typeof import('@salmonui/data').tupleColumns<core.ColumnDef<Row>>>, core.ColumnDef<Row>[]>>,
  // The platform fetch is assignable to the injected FetchLike.
  Assert<Extends<typeof fetch, data.FetchLike>>,
];

it('type contract compiles (see tsc -b)', () => {
  assert.ok(true);
});
