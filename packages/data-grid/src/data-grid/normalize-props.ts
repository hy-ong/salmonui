// Props normalization shared by the feature gate (`DataGrid.tsx`, detection
// before the instance exists) and the instance. Feature-free: it imports no
// feature code, so detection never pulls a render feature into the static
// graph.

import { DEV, warnOnce } from '@salmonui/core/internal/dev';
import { childrenOf } from './children.js';
import type { DataGridAggregateRow, DataGridColumn, DataGridProps } from './types.js';

/** Props with `<DataGridColumn>` / `<DataGridAggregateRow>` children resolved into `columns` / `aggregates` (children win). */
export function normalizeProps<Row>(props: DataGridProps<Row>): DataGridProps<Row> {
  const children = childrenOf(props.children);
  if (!children.columns && !children.aggregates) return props.columns ? props : { ...props, columns: [] };
  if (DEV && children.columns && props.columns) {
    warnOnce(`columns+children:${props.id ?? ''}`, 'DataGrid: both `columns` and <DataGridColumn> children were passed; the children win.');
  }
  return {
    ...props,
    columns: (children.columns as DataGridColumn<Row>[] | null) ?? props.columns ?? [],
    ...(children.aggregates ?? props.aggregates ? { aggregates: (children.aggregates ?? props.aggregates) as readonly DataGridAggregateRow<Row>[] } : {}),
  };
}
