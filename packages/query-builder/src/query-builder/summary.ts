// Summary sentence of a Query Builder value: conditions as
// "{field} {operator} {value}" with the operator labels shared with the Data
// Grid filter status, groups parenthesized and joined by their connector,
// negated groups prefixed with the NOT text. Values use the field format
// through the Data Grid formatter (number presets `N2` / `C2` / `P1`, date
// skeletons and styles, `dd/MM/yyyy` patterns, format options); NumberField
// bundles the same formatter, so the entry adds no formatting code.

import type { FormatOptions } from '@salmonui/core/format';
import { formatValue } from '@salmonui/core/format';
import { NO_VALUE_OPERATORS } from '@salmonui/core/internal/query/operators';
import { isQueryGroup, type Json, type QueryGroup, type QueryNode } from '@salmonui/core/internal/query/types';
import { labelOf, valueOf, type FlatField } from './fields.js';
import { operatorKey, type QueryText } from './locale.js';

/**
 * Formats a value with a Data Grid format: the grid's own formatter
 * (`formatValue`), which the composed NumberField already bundles.
 */
export function formatWith(value: unknown, format: string | FormatOptions, type: 'number' | 'date' | 'datetime', locale: string): string {
  return formatValue(value, format, { type, locale });
}

/** One value as display text: a `values` label, else the field format. */
export function valueText(field: FlatField | undefined, value: Json | undefined, locale: string): string {
  if (value === null || value === undefined) return '';
  const fixed = field?.def.values?.find((v) => valueOf(v) === value);
  if (fixed !== undefined) return labelOf(fixed);
  const format = field?.def.format;
  const type = field?.type;
  if (format === undefined || typeof value === 'boolean' || (type !== 'number' && type !== 'date' && type !== 'datetime')) return String(value);
  return formatWith(value, format, type, locale);
}

export function summaryText(value: QueryGroup, fieldOf: (path: string) => FlatField | undefined, text: QueryText, locale: string, opLabel: (op: string) => string): string {
  const walk = (node: QueryNode, root: boolean): string => {
    if (isQueryGroup(node)) {
      const parts = node.filters.map((n) => walk(n, false)).filter((s) => s !== '');
      if (parts.length === 0) return '';
      const body = parts.join(` ${text(node.logic).toUpperCase()} `);
      const wrapped = root && !node.not ? body : `(${body})`;
      return node.not ? `${text('filterNot').toUpperCase()} ${wrapped}` : wrapped;
    }
    const field = fieldOf(node.field);
    const v = node.value;
    const one = (x: unknown): string => valueText(field, x as Json, locale);
    const valueStr = NO_VALUE_OPERATORS.has(node.operator) ? '' : node.operator === 'between' && Array.isArray(v) ? `${one(v[0])} – ${one(v[1])}` : Array.isArray(v) ? v.map(one).join(', ') : one(v);
    return text('summaryRule', { field: field?.label ?? node.field, operator: opLabel(node.operator).toLowerCase(), value: valueStr }).trim();
  };
  return walk(value, true) || text('summaryEmpty');
}

export { operatorKey };
