// Field list of QueryBuilder: nested fields flattened to paths,
// categories, sort, the operators per type and the
// QueryTree `QueryFieldInfo` adapter. No React.

import type { Json } from '@salmonui/core/internal/query/types';
import type { QueryFieldInfo } from '@salmonui/core/internal/query/model';
import { BOOLEAN_OPERATORS, STRING_OPERATORS, VALUE_OPERATORS } from '@salmonui/core/internal/query/operators';
import type { QueryField, QueryFieldType, QueryFieldValue, QueryOperator } from './types.js';

/** The built-in operators of a field type (Data Grid filter operator names), plus `in` / `notIn` for string and number fields. */
export function operatorsFor(type: QueryFieldType = 'string'): readonly string[] {
  switch (type) {
    case 'boolean':
      return BOOLEAN_OPERATORS;
    case 'number':
      return NUMBER_OPERATORS;
    case 'date':
    case 'datetime':
      return VALUE_OPERATORS;
    default:
      return TEXT_OPERATORS;
  }
}
const TEXT_OPERATORS: readonly string[] = Object.freeze([...STRING_OPERATORS.slice(0, -4), 'in', 'notIn', ...STRING_OPERATORS.slice(-4)]);
const NUMBER_OPERATORS: readonly string[] = Object.freeze([...VALUE_OPERATORS.slice(0, -2), 'in', 'notIn', ...VALUE_OPERATORS.slice(-2)]);

export interface FlatField {
  readonly path: string;
  readonly label: string;
  readonly def: QueryField;
  readonly type: QueryFieldType;
  readonly category: string | undefined;
  readonly operators: readonly string[];
}

/** Leaf fields as paths in display order. Labels of nested fields join their parents' (`Address City`). */
export function flattenFields(fields: readonly QueryField[], separator: string, sort: 'asc' | 'desc' | null | undefined, custom: readonly QueryOperator[] | undefined): FlatField[] {
  const out: FlatField[] = [];
  const walk = (list: readonly QueryField[], prefix: string, labelPrefix: string, category: string | undefined): void => {
    for (const f of list) {
      const path = prefix + f.field;
      const label = labelPrefix + (f.label ?? f.field);
      const cat = f.category ?? category;
      if (f.fields?.length) {
        walk(f.fields, path + separator, `${label} `, cat);
        continue;
      }
      const type = f.type ?? 'string';
      const extra = custom?.filter((o) => !o.types || o.types.includes(type)).map((o) => o.name) ?? [];
      const base = f.operators ?? operatorsFor(type);
      out.push({ path, label, def: f, type, category: cat, operators: extra.length && !f.operators ? [...base, ...extra] : base });
    }
  };
  walk(fields, '', '', undefined);
  if (sort) {
    const dir = sort === 'desc' ? -1 : 1;
    out.sort((a, b) => dir * a.label.localeCompare(b.label));
  }
  return out;
}

export const valueOf = (v: QueryFieldValue): string | number | boolean => (typeof v === 'object' ? v.value : v);
export const labelOf = (v: QueryFieldValue): string => (typeof v === 'object' ? v.label : String(v));

/** Parses editor text for a field type; undefined when invalid. */
export function parseText(type: QueryFieldType, raw: string): Json | undefined {
  const text = raw.trim();
  if (text === '') return undefined;
  if (type === 'number') {
    const n = Number(text);
    return Number.isFinite(n) ? n : undefined;
  }
  if (type === 'boolean') return /^(true|1|yes)$/i.test(text) ? true : /^(false|0|no)$/i.test(text) ? false : undefined;
  return raw;
}

/** The tree's view of a field. */
export function fieldInfo(f: FlatField): QueryFieldInfo {
  const type = f.type === 'datetime' ? 'date' : f.type;
  return {
    label: f.label,
    type,
    operators: f.operators,
    defaultOperator: f.operators[0] ?? 'equal',
    format: (v) => (v == null ? '' : String(v)),
    parse: (t) => parseText(f.type, t),
  };
}
