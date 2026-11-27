'use client';
import { expectStylesheet } from '@salmonui/core/internal/dev';

// `@salmonui/query-builder`: QueryBuilder, its operator lists and a row
// evaluator. It composes select, combobox (with the shared dropdown),
// button, text-field, number-field, checkbox, date-field (the `DateField`
// that `/date-picker` exports) and tree-select (the lazy `fieldPicker:
// 'tree'` chunk). CSS:
// `@salmonui/query-builder/styles.css` is self-contained: it carries
// the stylesheets of those families. SQL and MongoDB converters live in the
// server-safe `query-builder/sql` and `query-builder/mongo` entries.
export { QueryBuilder } from './query-builder/QueryBuilder.js';
export { operatorsFor } from './query-builder/fields.js';
export { filterRows } from './query-builder/filter-rows.js';
export type { FilterRowsOptions } from './query-builder/filter-rows.js';
export { QUERY_BUILDER_DEFAULT_LOCALE_TEXT } from './query-builder/locale.js';
export type { QueryBuilderLocaleKey, QueryBuilderLocaleText } from './query-builder/locale.js';
export { isQueryGroup } from '@salmonui/core/internal/query/types';
export type {
  Json,
  QueryBuilderAction,
  QueryBuilderApi,
  QueryBuilderBeforeChangeEvent,
  QueryBuilderButtons,
  QueryBuilderChangeDetails,
  QueryBuilderDragEvent,
  QueryBuilderDropEvent,
  QueryBuilderEditorProps,
  QueryBuilderProps,
  QueryField,
  QueryFieldType,
  QueryFieldValue,
  QueryGroup,
  QueryGroupHeaderContext,
  QueryNode,
  QueryOperator,
  QueryRule,
  QueryRuleRenderContext,
  QueryValueEditorContext,
} from './query-builder/types.js';

// Development: warns once when this family renders without its stylesheet. A textual
// NODE_ENV test, so production bundles drop the call even across chunks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };
if (process.env.NODE_ENV !== 'production') expectStylesheet('@salmonui/query-builder', 'salmon-query-builder');
