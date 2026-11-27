// QueryBuilder text. Keys shared with the Data Grid `localeText`
// (operators `operator<Name>`, `and`, `or`, `filterNot`, `addCondition`,
// `addGroup`, `removeCondition`, `removeGroup`, `filterField`,
// `filterOperator`, `filterValue`, `filterFrom`, `filterTo`, `true`,
// `false`) carry the same English defaults (a unit test compares them with
// the Data Grid catalog), so one localized bundle serves both. `{name}`
// placeholders are replaced.

export const QUERY_BUILDER_DEFAULT_LOCALE_TEXT = Object.freeze({
  and: 'And',
  or: 'Or',
  filterNot: 'Not',
  addCondition: 'Add condition',
  addGroup: 'Add group',
  removeCondition: 'Remove condition',
  removeGroup: 'Remove group',
  filterField: 'Field',
  filterOperator: 'Operator',
  filterValue: 'Value',
  filterFrom: 'From',
  filterTo: 'To',
  true: 'true',
  false: 'false',
  /** Root group name. */
  queryBuilder: 'Query builder',
  /** {connector}: a group named by its connector. */
  groupLabel: '{connector} group',
  /** {index}: the 1-based position of a rule in its group. */
  ruleLabel: 'Condition {index}',
  cloneRule: 'Clone condition',
  cloneGroup: 'Clone group',
  lock: 'Lock',
  unlock: 'Unlock',
  /** Drag handle (Alt+ArrowUp / Alt+ArrowDown move). */
  move: 'Move',
  /** {position}: the moved node's new position. */
  moved: 'Moved to position {position}',
  edit: 'Edit',
  done: 'Done',
  selectField: 'Select a field',
  selectOperator: 'Select an operator',
  /** Summary of an empty query. */
  summaryEmpty: 'No conditions',
  /** {field} {operator} {value} */
  summaryRule: '{field} {operator} {value}',
  incomplete: 'Complete this condition',
  operatorEqual: 'Equal',
  operatorNotEqual: 'Not equal',
  operatorContains: 'Contains',
  operatorDoesNotContain: 'Does not contain',
  operatorStartsWith: 'Starts with',
  operatorDoesNotStartWith: 'Does not start with',
  operatorEndsWith: 'Ends with',
  operatorDoesNotEndWith: 'Does not end with',
  operatorIsEmpty: 'Empty',
  operatorIsNotEmpty: 'Not empty',
  operatorIsNull: 'Null',
  operatorIsNotNull: 'Not null',
  operatorGreaterThan: 'Greater than',
  operatorGreaterThanOrEqual: 'Greater than or equal',
  operatorLessThan: 'Less than',
  operatorLessThanOrEqual: 'Less than or equal',
  operatorBetween: 'Between',
  operatorIn: 'In',
  operatorNotIn: 'Not in',
  operatorLike: 'Like',
  operatorWildcard: 'Wildcard',
});

export type QueryBuilderLocaleKey = keyof typeof QUERY_BUILDER_DEFAULT_LOCALE_TEXT;

/** Every key, plus `operator<Name>` labels of custom operators and `validation<Rule>` messages. */
export type QueryBuilderLocaleText = { readonly [K in QueryBuilderLocaleKey]: string } & { readonly [key: string]: string };

/** `operator<Name>`. */
export const operatorKey = (op: string): string => `operator${op.charAt(0).toUpperCase()}${op.slice(1)}`;

export type QueryText = (key: string, params?: Readonly<Record<string, string | number>>) => string;

/** A text function over the defaults and overrides. */
export function textOf(overrides: Partial<QueryBuilderLocaleText> | undefined): QueryText {
  const table = overrides ? { ...QUERY_BUILDER_DEFAULT_LOCALE_TEXT, ...overrides } : QUERY_BUILDER_DEFAULT_LOCALE_TEXT;
  return (key, params) => {
    const raw = (table as Record<string, string | undefined>)[key];
    if (raw === undefined) return key.startsWith('operator') ? key.charAt(8).toLowerCase() + key.slice(9) : key;
    return params ? raw.replace(/\{(\w+)\}/g, (m, name: string) => (params[name] !== undefined ? String(params[name]) : m)) : raw;
  };
}
