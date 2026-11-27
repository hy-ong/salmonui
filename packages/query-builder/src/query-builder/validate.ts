// Rule validation: completeness of every rule, then
// the field's rules in the Form vocabulary (`compileValidationRules` from
// `@salmonui/core/validation`) on each value. No React.

import { compileValidationRules, DEFAULT_VALIDATION_MESSAGES, type CompiledValidator, type ValidationMessages } from '@salmonui/core/validation';
import { LIST_OPERATORS, NO_VALUE_OPERATORS } from '@salmonui/core/internal/query/operators';
import { isQueryGroup, type QueryGroup, type QueryNode, type QueryRule } from '@salmonui/core/internal/query/types';
import type { FlatField } from './fields.js';
import type { QueryText } from './locale.js';


/** The values a rule carries (both ends of `between`, every list item). */
const valuesOf = (rule: QueryRule): readonly unknown[] => (Array.isArray(rule.value) ? rule.value : [rule.value]);

const blank = (v: unknown): boolean => v === undefined || v === null || v === '' || (typeof v === 'number' && Number.isNaN(v));

/** True when the rule names a field and an operator and has every value it needs. */
export function ruleComplete(rule: QueryRule, field: FlatField | undefined, valueless: (op: string) => boolean): boolean {
  if (!field || !rule.operator) return false;
  if (NO_VALUE_OPERATORS.has(rule.operator) || valueless(rule.operator)) return true;
  const v = rule.value;
  if (rule.operator === 'between') return Array.isArray(v) && v.length === 2 && !blank(v[0]) && !blank(v[1]);
  if (LIST_OPERATORS.has(rule.operator)) return Array.isArray(v) && v.length > 0;
  return field.type === 'boolean' ? typeof v === 'boolean' : !blank(v);
}

/** Errors per rule id; an empty map when valid. */
export function validateQuery(value: QueryGroup, fieldOf: (path: string) => FlatField | undefined, text: QueryText, valueless: (op: string) => boolean): Map<string, readonly string[]> {
  const errors = new Map<string, readonly string[]>();
  const compiled = new Map<object, CompiledValidator>();
  const messages = Object.fromEntries(Object.keys(DEFAULT_VALIDATION_MESSAGES).map((k) => {
    const key = `validation${k.charAt(0).toUpperCase()}${k.slice(1)}`;
    const t = text(key);
    return [k, t === key ? DEFAULT_VALIDATION_MESSAGES[k as keyof ValidationMessages] : t];
  })) as unknown as ValidationMessages;
  const walk = (node: QueryNode): void => {
    if (isQueryGroup(node)) {
      node.filters.forEach(walk);
      return;
    }
    const id = node.id as string;
    const field = fieldOf(node.field);
    if (!ruleComplete(node, field, valueless)) {
      errors.set(id, [text('incomplete')]);
      return;
    }
    const rules = field?.def.validation;
    if (!rules || NO_VALUE_OPERATORS.has(node.operator)) return;
    let v = compiled.get(rules);
    if (!v) compiled.set(rules, (v = compileValidationRules(rules, messages)));
    for (const x of valuesOf(node)) {
      const e = v.validate(x, null);
      if (e.length) {
        errors.set(id, e);
        return;
      }
    }
  };
  walk(value);
  return errors;
}

/** The value without incomplete rules and empty groups. */
export function validValue(value: QueryGroup, fieldOf: (path: string) => FlatField | undefined, valueless: (op: string) => boolean): QueryGroup {
  const walk = (group: QueryGroup): QueryGroup | null => {
    const filters: QueryNode[] = [];
    for (const n of group.filters) {
      if (isQueryGroup(n)) {
        const g = walk(n);
        if (g) filters.push(g);
      } else if (ruleComplete(n, fieldOf(n.field), valueless)) filters.push(n);
    }
    return filters.length ? { ...group, filters } : null;
  };
  return walk(value) ?? { ...value, filters: [] };
}
